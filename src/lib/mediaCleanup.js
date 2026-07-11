/**
 * src/lib/mediaCleanup.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Best-effort Cloudinary cleanup for Product.images (a string[] of URLs).
 *
 * Built on top of the existing destroyByUrl() (which derives public_id +
 * resource_type from the stored URL). This layer only orchestrates:
 *   - normalises items (accepts strings or {url}/{src} objects)
 *   - de-duplicates URLs so an asset is destroyed at most once
 *   - NEVER throws — a Cloudinary failure must not block or roll back the DB
 *     delete/update that called it
 *   - logs each outcome: deleted / skipped / failed
 *
 * Local "/uploads/..." URLs are ignored by destroyByUrl() (returns skipped), so
 * local files are never touched here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { destroyByUrl } from './cloudinary.js';

/** Accept a plain URL string or an object like { url } / { src }. */
function toUrl(item) {
  return (typeof item === 'string' ? item : item?.url || item?.src || '') || '';
}

/**
 * Destroy every Cloudinary asset referenced by `items`, best-effort.
 *
 * @param {Array<string|{url?:string,src?:string}>} items
 * @param {object} [opts]
 * @param {(url:string)=>Promise<any>} [opts.destroyFn]  defaults to destroyByUrl (injectable for tests)
 * @param {string} [opts.label]  short context label for logs
 * @returns {Promise<{deleted:number, skipped:number, failed:number, total:number}>}
 */
export async function destroyManyByUrls(items, { destroyFn = destroyByUrl, label = 'media' } = {}) {
  // Normalise + de-duplicate (requirement: skip duplicate URLs safely).
  const urls = Array.from(new Set((items || []).map(toUrl).filter(Boolean)));
  const summary = { deleted: 0, skipped: 0, failed: 0, total: urls.length };

  for (const url of urls) {
    try {
      const res = await destroyFn(url);
      if (res?.skipped) {
        summary.skipped++;
        console.log(`[media-cleanup] skipped | ${label} | ${url} | ${res.reason || 'not-cloudinary'}`);
      } else if (res?.ok) {
        summary.deleted++;
        console.log(`[media-cleanup] deleted | ${label} | ${url} | public_id=${res.publicId ?? '?'} result=${res.result ?? 'ok'}`);
      } else {
        summary.failed++;
        console.error(`[media-cleanup] failed  | ${label} | ${url} | ${res?.error ?? res?.result ?? 'unknown'}`);
      }
    } catch (err) {
      // destroyByUrl already swallows its own errors, but never let anything
      // escape this loop — the caller's DB operation must not be affected.
      summary.failed++;
      console.error(`[media-cleanup] failed  | ${label} | ${url} | ${err?.message ?? err}`);
    }
  }

  return summary;
}

/**
 * URLs present in `before` but not in `after` (both may be string[] or object[]).
 * De-duplicated. Used to find media removed during a product update.
 *
 * @returns {string[]}
 */
export function diffRemovedUrls(before, after) {
  const beforeUrls = (before || []).map(toUrl).filter(Boolean);
  const afterSet = new Set((after || []).map(toUrl).filter(Boolean));
  return Array.from(new Set(beforeUrls.filter((u) => !afterSet.has(u))));
}
