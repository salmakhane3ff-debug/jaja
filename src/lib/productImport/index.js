/**
 * src/lib/productImport/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Source registry + orchestration for the manual product-URL importer.
 *
 * ONE admin-supplied URL at a time. This is deliberately not a crawler: nothing
 * here follows links found in the page, enumerates listings, or queues work.
 * It fetches exactly the document the admin pasted (plus, later, that page's
 * own images) and stops.
 *
 * Extensibility: adding a marketplace means appending its descriptor to
 * SOURCES. The API route and the admin UI are source-agnostic.
 *
 * No Prisma, no React → unit-testable with an injected fetch.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { mercariSource } from './mercari.js';
import { safeFetch, validateUrl, ERR } from './security.js';
import { normalizeResult } from './normalize.js';

/** V1 ships one source. Order is irrelevant — hosts are matched exactly. */
export const SOURCES = Object.freeze([mercariSource]);

/** Every listing host we accept, across all sources. */
export function allPageHosts() {
  return SOURCES.flatMap((s) => s.pageHosts);
}

/** The source descriptor that owns this URL, or null. */
export function resolveSource(rawUrl) {
  let host;
  try { host = new URL(String(rawUrl).trim()).hostname.toLowerCase().replace(/\.$/, ''); }
  catch { return null; }
  return SOURCES.find((s) => s.pageHosts.includes(host)) || null;
}

/** Page fetches are small documents; images are capped separately. */
export const PAGE_LIMITS = Object.freeze({ maxBytes: 3_000_000, timeoutMs: 12_000 });
export const IMAGE_LIMITS = Object.freeze({ maxBytes: 12_000_000, timeoutMs: 15_000 });

/**
 * Fetch + extract ONE product URL. Does NOT touch media storage or the database —
 * `imageUrls` are still the source's URLs at this point.
 *
 * @param {string} rawUrl
 * @param {{fetchImpl?:Function}} [opts]
 * @returns {Promise<{ok:true, result:object} | {ok:false, code:string}>}
 */
export async function importFromUrl(rawUrl, { fetchImpl } = {}) {
  const source = resolveSource(rawUrl);
  if (!source) return { ok: false, code: ERR.UNSUPPORTED_SOURCE };

  // Re-validate through the full security gate (https, port, credentials,
  // blocked hosts) against THIS source's allow-list.
  const checked = validateUrl(rawUrl, source.pageHosts);
  if (!checked.ok) return { ok: false, code: checked.code };

  const res = await safeFetch(checked.url.toString(), {
    allowedHosts: source.pageHosts,
    maxBytes: PAGE_LIMITS.maxBytes,
    timeoutMs: PAGE_LIMITS.timeoutMs,
    accept: 'text/html,application/xhtml+xml',
    allowedContentTypes: ['text/html', 'application/xhtml+xml'],
    fetchImpl,
  });
  if (!res.ok) return { ok: false, code: res.code };

  let extracted;
  try {
    extracted = source.extract(res.buffer.toString('utf8'), res.finalUrl);
  } catch {
    // A malformed upstream document must never surface as a 500.
    return { ok: false, code: ERR.UPSTREAM_ERROR };
  }

  if (extracted.unavailable) return { ok: false, code: ERR.UNAVAILABLE };

  // Nothing usable at all — treat as an unreadable listing rather than an
  // "successful" import of an empty product.
  if (!extracted.title && extracted.imageUrls.length === 0) {
    return { ok: false, code: ERR.UPSTREAM_ERROR };
  }

  return {
    ok: true,
    result: normalizeResult({
      source: source.id,
      sourceUrl: res.finalUrl,
      title: extracted.title,
      price: extracted.price,
      imageUrls: extracted.imageUrls,
      warnings: extracted.warnings,
    }),
  };
}

export { ERR } from './security.js';
