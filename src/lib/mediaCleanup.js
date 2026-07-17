/**
 * src/lib/mediaCleanup.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Best-effort remote cleanup for Product.images (a string[] of URLs).
 *
 * Built on top of destroyByUrl(), which dispatches by URL:
 *   - R2 URLs         → deleted (only within R2_PUBLIC_URL / R2_PREFIX)
 *   - Cloudinary URLs → deleted (partially-migrated legacy assets)
 *   - local /uploads/ → skipped (local files are never touched)
 *   - external URLs   → skipped
 *
 * This layer only orchestrates:
 *   - normalises items (accepts strings or {url}/{src} objects)
 *   - de-duplicates URLs so an asset is destroyed at most once
 *   - asks the optional `isReferenced` guard whether an asset is still in use,
 *     and RETAINS it if so (media URLs are shared — see mediaReferences.js)
 *   - NEVER throws — a remote failure must not block or roll back the DB
 *     delete/update that called it (callers do DB-first, then this cleanup)
 *   - logs each outcome: deleted / retained / skipped / failed
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
 * @param {(url:string)=>Promise<boolean>} [opts.isReferenced]  guard: true → KEEP the asset.
 *        Omit it and nothing is retained (the pre-guard behaviour). Callers that
 *        delete product media pass isMediaUrlReferenced — media URLs are shared
 *        (the Duplicate button copies them verbatim), so destroying one product's
 *        image can blank a survivor's. A throw from this guard is treated as
 *        "referenced": we never delete what we cannot prove is unused.
 * @param {string} [opts.label]  short context label for logs
 * @returns {Promise<{deleted:number, retained:number, skipped:number, failed:number, total:number}>}
 */
export async function destroyManyByUrls(items, { destroyFn = destroyByUrl, isReferenced = null, label = 'media' } = {}) {
  // Normalise + de-duplicate (requirement: skip duplicate URLs safely).
  // De-duplication happens BEFORE the guard, so a repeated URL is checked once.
  const urls = Array.from(new Set((items || []).map(toUrl).filter(Boolean)));
  const summary = { deleted: 0, retained: 0, skipped: 0, failed: 0, total: urls.length };

  for (const url of urls) {
    if (isReferenced) {
      let stillUsed;
      try {
        stillUsed = await isReferenced(url);
      } catch (err) {
        // Fail-safe: an unusable answer must never authorise a deletion.
        stillUsed = true;
        console.error(`[media-cleanup] guard failed | ${label} | ${url} | ${err?.message ?? err}`);
      }
      if (stillUsed) {
        summary.retained++;
        console.log(`[media-cleanup] retained | ${label} | ${url} | still referenced elsewhere`);
        continue;
      }
    }

    try {
      const res = await destroyFn(url);
      if (res?.skipped) {
        summary.skipped++;
        console.log(`[media-cleanup] skipped | ${label} | ${url} | ${res.reason || 'not-cloudinary'}`);
      } else if (res?.ok) {
        summary.deleted++;
        console.log(`[media-cleanup] deleted | ${label} | ${url} | storage=${res.storage ?? '?'} key=${res.key ?? res.publicId ?? '?'} result=${res.result ?? 'ok'}`);
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
