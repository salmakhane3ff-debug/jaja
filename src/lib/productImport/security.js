/**
 * src/lib/productImport/security.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SSRF defence for the manual product-URL importer.
 *
 * The importer takes ONE admin-supplied URL and fetches it server-side, which
 * means the server can be pointed at anything the admin (or an attacker who
 * reached the admin session) types. Everything here exists to make that
 * impossible:
 *
 *   • https only — no http, file, ftp, data, gopher…
 *   • the HOSTNAME must be on a per-source allow-list (exact match, so
 *     "mercari.com.evil.test" and "notmercari.com" both fail)
 *   • default port only — an explicit :8080 is rejected
 *   • no embedded credentials (user:pass@host)
 *   • literal IPs never match a hostname allow-list, and are additionally
 *     screened for loopback / private / link-local / CGNAT / reserved ranges
 *   • redirects are followed MANUALLY and every hop is re-validated against the
 *     same allow-list, so an allowed host cannot bounce us onto 169.254.169.254
 *   • hard timeout, hard byte cap, and a content-type check
 *
 * `fetchImpl` is injectable so the whole thing is unit-testable with no network.
 *
 * No React, no DOM, no Prisma → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Machine-readable failure codes. The route maps these to admin-facing copy. */
export const ERR = Object.freeze({
  INVALID_URL:        'INVALID_URL',
  UNSUPPORTED_SOURCE: 'UNSUPPORTED_SOURCE',
  NOT_HTTPS:          'NOT_HTTPS',
  BLOCKED_HOST:       'BLOCKED_HOST',
  TOO_MANY_REDIRECTS: 'TOO_MANY_REDIRECTS',
  TIMEOUT:            'TIMEOUT',
  TOO_LARGE:          'TOO_LARGE',
  BAD_CONTENT_TYPE:   'BAD_CONTENT_TYPE',
  UPSTREAM_ERROR:     'UPSTREAM_ERROR',
  UNAVAILABLE:        'UNAVAILABLE',
});

/** Hostnames that are never fetched, whatever the allow-list says. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback',
  'broadcasthost', 'metadata', 'metadata.google.internal',
]);

/** Suffixes that only ever resolve inside a private network. */
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home.arpa'];

const MAX_REDIRECTS = 3;

// ── Address screening ────────────────────────────────────────────────────────

/** True when `h` looks like a dotted-quad IPv4 literal. */
function isIPv4(h) {
  const parts = h.split('.');
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/**
 * True when the host is an IP literal inside a range that must never be
 * reachable from a user-supplied URL.
 * Covers: 0.0.0.0/8, 10/8, 127/8, 169.254/16 (cloud metadata), 172.16/12,
 * 192.168/16, 100.64/10 (CGNAT), 192.0.0/24, 198.18/15, 224/4, 240/4,
 * and the IPv6 loopback / unique-local / link-local blocks.
 */
export function isPrivateAddress(host) {
  if (!host) return false;
  let h = String(host).trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);   // [::1] → ::1

  if (h.includes(':')) {                                          // IPv6
    if (h === '::' || h === '::1') return true;
    if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;                // fc00::/7 unique-local
    if (/^fe[89ab][0-9a-f]:/.test(h)) return true;                // fe80::/10 link-local
    // IPv4-mapped (::ffff:127.0.0.1) — screen the embedded address too.
    const mapped = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }

  if (!isIPv4(h)) return false;
  const [a, b] = h.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;                        // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;              // CGNAT
  if (a === 192 && b === 0) return true;                          // 192.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true;           // benchmarking
  if (a >= 224) return true;                                      // multicast + reserved
  return false;
}

/** True when the hostname is internal by name, or a private/loopback IP. */
export function isBlockedHost(hostname) {
  const h = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) return true;
  if (!h.includes('.') && !h.includes(':')) return true;           // bare "intranet"
  return isPrivateAddress(h);
}

// ── URL validation ───────────────────────────────────────────────────────────

/**
 * Validate a candidate URL against an explicit hostname allow-list.
 *
 * @param {string} raw
 * @param {string[]} allowedHosts  exact hostnames, lower-case
 * @returns {{ok:true, url:URL} | {ok:false, code:string}}
 */
export function validateUrl(raw, allowedHosts) {
  if (typeof raw !== 'string' || raw.trim() === '') return { ok: false, code: ERR.INVALID_URL };

  let u;
  try { u = new URL(raw.trim()); } catch { return { ok: false, code: ERR.INVALID_URL }; }

  // Protocol first: file:/ftp:/data: must never reach the host checks.
  if (u.protocol !== 'https:') return { ok: false, code: ERR.NOT_HTTPS };
  if (u.username || u.password) return { ok: false, code: ERR.BLOCKED_HOST };
  if (u.port && u.port !== '443') return { ok: false, code: ERR.BLOCKED_HOST };

  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (isBlockedHost(host)) return { ok: false, code: ERR.BLOCKED_HOST };

  // EXACT match only — never endsWith, which "mercari.com.evil.test" would pass.
  const allowed = (allowedHosts || []).map((h) => String(h).toLowerCase());
  if (!allowed.includes(host)) return { ok: false, code: ERR.UNSUPPORTED_SOURCE };

  return { ok: true, url: u };
}

// ── Guarded fetch ────────────────────────────────────────────────────────────

/**
 * Fetch a validated URL with manual redirect handling, a timeout, and a byte cap.
 *
 * EVERY redirect hop goes back through validateUrl with the SAME allow-list, so
 * a permitted host cannot redirect us to an internal address.
 *
 * Never throws for upstream problems — returns { ok:false, code } instead, and
 * never surfaces the upstream body or headers to the caller on failure.
 *
 * @returns {Promise<{ok:true, buffer:Buffer, contentType:string, finalUrl:string}
 *                 | {ok:false, code:string, status?:number}>}
 */
export async function safeFetch(rawUrl, {
  allowedHosts = [],
  maxBytes = 2_000_000,
  timeoutMs = 10_000,
  accept = 'text/html',
  allowedContentTypes = ['text/html'],
  fetchImpl = globalThis.fetch,
} = {}) {
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const checked = validateUrl(current, allowedHosts);
    if (!checked.ok) return { ok: false, code: checked.code };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(checked.url.toString(), {
        method: 'GET',
        redirect: 'manual',            // we revalidate every hop ourselves
        signal: controller.signal,
        headers: { accept, 'user-agent': 'Mozilla/5.0 (compatible; ProductImporter/1.0)' },
      });
    } catch (err) {
      return { ok: false, code: err?.name === 'AbortError' ? ERR.TIMEOUT : ERR.UPSTREAM_ERROR };
    } finally {
      clearTimeout(timer);
    }

    const status = Number(res?.status) || 0;

    // Redirect: revalidate the destination on the next loop iteration.
    if (status >= 300 && status < 400) {
      const loc = res.headers?.get?.('location');
      if (!loc) return { ok: false, code: ERR.UPSTREAM_ERROR };
      try { current = new URL(loc, checked.url).toString(); }
      catch { return { ok: false, code: ERR.INVALID_URL }; }
      continue;
    }

    if (status === 404 || status === 410) return { ok: false, code: ERR.UNAVAILABLE, status };
    if (status < 200 || status >= 300)    return { ok: false, code: ERR.UPSTREAM_ERROR, status };

    const contentType = String(res.headers?.get?.('content-type') || '').toLowerCase();
    const bare = contentType.split(';')[0].trim();
    if (!allowedContentTypes.some((t) => bare === t || bare.startsWith(t))) {
      return { ok: false, code: ERR.BAD_CONTENT_TYPE };
    }

    // Trust the declared length only to reject early; the real cap is the read.
    const declared = Number(res.headers?.get?.('content-length') || 0);
    if (declared && declared > maxBytes) return { ok: false, code: ERR.TOO_LARGE };

    const read = await readCapped(res, maxBytes);
    if (!read.ok) return read;

    return { ok: true, buffer: read.buffer, contentType: bare, finalUrl: checked.url.toString() };
  }

  return { ok: false, code: ERR.TOO_MANY_REDIRECTS };
}

/**
 * Read a response body, aborting as soon as it exceeds `maxBytes`.
 * Streams when the runtime gives us a reader so an enormous body is never
 * buffered whole; falls back to arrayBuffer() for simple/mocked responses.
 */
async function readCapped(res, maxBytes) {
  try {
    const reader = res.body?.getReader?.();
    if (!reader) {
      const ab = await res.arrayBuffer();
      if (ab.byteLength > maxBytes) return { ok: false, code: ERR.TOO_LARGE };
      return { ok: true, buffer: Buffer.from(ab) };
    }

    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* already closed */ }
        return { ok: false, code: ERR.TOO_LARGE };
      }
      chunks.push(Buffer.from(value));
    }
    return { ok: true, buffer: Buffer.concat(chunks) };
  } catch (err) {
    return { ok: false, code: err?.name === 'AbortError' ? ERR.TIMEOUT : ERR.UPSTREAM_ERROR };
  }
}
