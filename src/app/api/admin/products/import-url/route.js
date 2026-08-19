/**
 * POST /api/admin/products/import-url
 * ─────────────────────────────────────────────────────────────────────────────
 * Manual product-URL importer. ADMIN ONLY.
 *
 * The admin pastes ONE listing URL; this reads that single page, extracts the
 * V1 fields (title, price, images), copies the images into our own media
 * pipeline, and returns the result for review. It is NOT a crawler: no link is
 * followed out of the page and no listing is enumerated.
 *
 * IT NEVER CREATES A PRODUCT. Nothing here writes to `products` — the response
 * only populates the existing /admin/products/new form, and the admin still
 * presses Save. The only rows written are `images`, exactly as a manual upload
 * through /api/image would write them.
 *
 * SSRF: every URL (the listing and each image, plus every redirect hop) is
 * re-validated against a per-source hostname allow-list before it is fetched.
 * See src/lib/productImport/security.js.
 *
 * Body:      { url: "https://www.mercari.com/..." }
 * Response:  { source, sourceUrl, title, price:{amount,currency}|null,
 *              images:[our media URLs], warnings:[...] }
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { rateLimit } from '@/lib/rateLimit';
import { importFromUrl, resolveSource, IMAGE_LIMITS, ERR } from '@/lib/productImport';
import { safeFetch } from '@/lib/productImport/security.js';
import { ingestImageBuffers } from '@/lib/services/imageIngestService.js';

export const maxDuration = 60;

/**
 * Admin-facing copy. Upstream status codes and bodies are NEVER forwarded —
 * an importer must not become a window onto internal responses.
 */
const MESSAGES = {
  [ERR.INVALID_URL]:        'That does not look like a valid URL.',
  [ERR.UNSUPPORTED_SOURCE]: 'Unsupported product source.',
  [ERR.NOT_HTTPS]:          'Only https:// links are supported.',
  [ERR.BLOCKED_HOST]:       'Unsupported product source.',
  [ERR.TOO_MANY_REDIRECTS]: 'Could not read this listing.',
  [ERR.TIMEOUT]:            'The listing took too long to respond.',
  [ERR.TOO_LARGE]:          'The listing page is too large to read.',
  [ERR.BAD_CONTENT_TYPE]:   'Could not read this listing.',
  [ERR.UPSTREAM_ERROR]:     'Could not read this listing.',
  [ERR.UNAVAILABLE]:        'Listing unavailable.',
};

const messageFor = (code) => MESSAGES[code] || 'Could not read this listing.';

/** Image content types we are willing to ingest. */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/** Derive a safe filename (uploadSecurity checks the extension against magic bytes). */
function filenameFor(url, contentType, index) {
  let ext = 'jpg';
  const fromType = String(contentType || '').split('/')[1];
  if (fromType && /^[a-z0-9]+$/.test(fromType)) ext = fromType === 'jpeg' ? 'jpg' : fromType;
  try {
    const m = new URL(url).pathname.match(/\.(jpe?g|png|webp|gif|avif)$/i);
    if (m) ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  } catch { /* keep the content-type extension */ }
  return `import-${Date.now()}-${index + 1}.${ext}`;
}

export const POST = withAdminAuth(async (req) => {
  // Cheap guard against an admin session being used to hammer a marketplace.
  const limited = rateLimit(req, 'product-import', { max: 10, windowMs: 60_000 });
  if (limited) return limited;

  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'Invalid request body.' }, { status: 400 }); }

  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!url) return Response.json({ error: 'A product URL is required.' }, { status: 400 });

  try {
    // ── 1. Read + extract the listing ───────────────────────────────────────
    const imported = await importFromUrl(url);
    if (!imported.ok) {
      const status = imported.code === ERR.UNSUPPORTED_SOURCE ||
                     imported.code === ERR.NOT_HTTPS ||
                     imported.code === ERR.BLOCKED_HOST ||
                     imported.code === ERR.INVALID_URL ? 400
                   : imported.code === ERR.UNAVAILABLE ? 404 : 502;
      return Response.json({ error: messageFor(imported.code), code: imported.code }, { status });
    }

    const result = imported.result;
    const source = resolveSource(result.sourceUrl) || resolveSource(url);
    const warnings = [...result.warnings];

    // ── 2. Copy the images into OUR media pipeline ──────────────────────────
    // Source image URLs are never persisted as product images: they are fetched
    // here and replaced by the URLs saveMedia() returns.
    const fetched = [];
    for (const [i, imgUrl] of result.imageUrls.entries()) {
      const res = await safeFetch(imgUrl, {
        allowedHosts: source?.imageHosts || [],
        maxBytes: IMAGE_LIMITS.maxBytes,
        timeoutMs: IMAGE_LIMITS.timeoutMs,
        accept: 'image/*',
        allowedContentTypes: IMAGE_TYPES,
      });
      if (!res.ok) { warnings.push('IMAGE_FETCH_FAILED'); continue; }
      fetched.push({
        buffer: res.buffer,
        originalName: filenameFor(imgUrl, res.contentType, i),
        sourceUrl: imgUrl,
      });
    }

    // A failure inside the batch keeps every image that did succeed.
    const { urls: images, failed } = await ingestImageBuffers(fetched);
    if (failed.length > 0) warnings.push('IMAGE_IMPORT_FAILED');

    const requested = result.imageUrls.length;
    const partialImages = requested > 0 && images.length < requested;

    return Response.json({
      source:    result.source,
      sourceUrl: result.sourceUrl,
      title:     result.title,
      price:     result.price,
      images,
      imagesRequested: requested,
      imagesFailed: requested - images.length,
      partial:   partialImages || warnings.includes('PRICE_MISSING') ||
                 warnings.includes('CURRENCY_MISSING') || warnings.includes('TITLE_MISSING'),
      warnings:  Array.from(new Set(warnings)),
    });
  } catch (err) {
    // Log the detail server-side; the browser only ever sees generic copy.
    console.error('[/api/admin/products/import-url]', err);
    return Response.json({ error: 'Could not read this listing.' }, { status: 500 });
  }
});
