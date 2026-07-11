/**
 * scripts/lib/mediaMigration.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * PURE, dependency-free migration logic for moving local /uploads/... media in
 * Product.images to Cloudinary. All I/O (file read, Cloudinary upload, HTTP
 * reachability, DB read/write, ledger persistence) is INJECTED, so every branch
 * is unit-testable without a database, Cloudinary account, or network.
 *
 * The runner (scripts/migrate-media-to-cloudinary.mjs) provides the real deps.
 * Nothing here reads process env, touches the DB, or writes files.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import path from 'node:path';
import { createHash } from 'node:crypto';

const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|ogv|ogg|m4v)(\?.*)?$/i;
const CLOUDINARY_HOST_RE = /^https?:\/\/res\.cloudinary\.com\//i;

/** A media entry may be a plain URL string or an object like { url } / { src }. */
export function urlOf(item) {
  return (typeof item === 'string' ? item : item?.url || item?.src || '') || '';
}

export function isCloudinaryUrl(url) {
  return typeof url === 'string' && CLOUDINARY_HOST_RE.test(url);
}

/** True only for local "/uploads/..." paths that should be migrated (no traversal). */
export function isLocalUploadUrl(url) {
  return typeof url === 'string' && url.startsWith('/uploads/') && !url.includes('..');
}

export function detectResourceType(url) {
  return VIDEO_EXT.test(String(url || '')) ? 'video' : 'image';
}

/** Path relative to /uploads (query stripped). */
export function relUnderUploads(url) {
  return String(url).replace(/^\/uploads\//, '').split('?')[0];
}

/** Stable short hex hash of a string (default 10 chars). */
export function shortHash(str, len = 10) {
  return createHash('sha1').update(String(str)).digest('hex').slice(0, len);
}

/**
 * Deterministic filename handed to saveMedia(): its basename-without-extension
 * becomes the Cloudinary public_id. It combines a readable flattened base with a
 * stable short hash of the COMPLETE old local URL, so:
 *   - the same old URL ALWAYS maps to the same public_id (idempotent), and
 *   - two different paths that share a basename (a/photo.jpg vs b/photo.jpg)
 *     NEVER collide — the hash differs even when the base is identical.
 */
export function migrationFilename(url) {
  const rel = relUnderUploads(url);                         // path under /uploads, query stripped
  const ext = path.extname(rel);                            // ".jpg" | ""
  const baseNoExt = rel.slice(0, rel.length - ext.length).replace(/\//g, '__');
  const safeBase = (baseNoExt.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 60)) || 'media';
  return `${safeBase}-${shortHash(url)}${ext}`;             // hash of the FULL old url
}

/** Absolute local file path for a /uploads/... URL, under <root>/public/uploads. */
export function resolveLocalPath(url, root) {
  if (!isLocalUploadUrl(url)) throw new Error(`not a local upload url: ${url}`);
  return path.join(root, 'public', 'uploads', relUnderUploads(url));
}

/** Preserve the original entry's shape (string→string, object→object) when swapping the URL. */
export function replaceUrl(original, newUrl) {
  if (original && typeof original === 'object') return { ...original, url: newUrl };
  return newUrl;
}

/** Throw unless a saveMedia() result is a verified Cloudinary asset. */
export function verifyUpload(result, expectedType) {
  if (!result || result.storage !== 'cloudinary')
    throw new Error(`upload did not go to Cloudinary (storage=${result?.storage})`);
  if (typeof result.url !== 'string' || !CLOUDINARY_HOST_RE.test(result.url))
    throw new Error(`secure_url is not a Cloudinary HTTPS URL: ${result.url}`);
  if (!result.publicId) throw new Error('upload result missing public_id');
  if (expectedType && result.resourceType !== expectedType)
    throw new Error(`resource_type mismatch: expected ${expectedType}, got ${result.resourceType}`);
  if (!(Number(result.bytes) > 0)) throw new Error('upload result bytes not > 0');
  return true;
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Verify a URL is reachable, tolerating Cloudinary CDN propagation delay: retry
 * up to `attempts` times (default 3) with exponential backoff (baseDelayMs, then
 * 2x each). `sleep` is injectable so tests run instantly. Returns a boolean.
 */
export async function verifyReachableWithRetry(url, { reachable, attempts = 3, baseDelayMs = 500, sleep = defaultSleep }) {
  for (let i = 0; i < attempts; i++) {
    try { if (await reachable(url)) return true; } catch { /* treat as not-yet-reachable */ }
    if (i < attempts - 1) await sleep(baseDelayMs * (2 ** i));   // 500ms, 1s, 2s, ...
  }
  return false;
}

/**
 * Build a single-asset migrator from injected I/O. Returns async (url) => result,
 * throwing on any failure (missing file, bad upload, unreachable secure_url).
 *
 * Verification order: upload-response metadata is the PRIMARY gate (verifyUpload),
 * THEN secure_url reachability is confirmed with retries/backoff before success.
 *
 * deps: { readFile, fileExists, saveMedia, reachable, folder, root,
 *         sleep, reachAttempts, reachBaseDelayMs }
 */
export function makeAssetMigrator({
  readFile, fileExists, saveMedia, reachable, folder = 'shopgold/products', root,
  sleep, reachAttempts = 3, reachBaseDelayMs = 500,
}) {
  return async function migrateAsset(url) {
    const resourceType = detectResourceType(url);
    const absPath = resolveLocalPath(url, root);

    if (!(await fileExists(absPath))) {
      const err = new Error(`local file not found: ${absPath}`);
      err.code = 'MISSING';
      throw err;
    }

    const buffer = await readFile(absPath);
    const result = await saveMedia(buffer, { filename: migrationFilename(url), folder, resourceType });

    verifyUpload(result, resourceType);                 // 1. PRIMARY gate: upload response metadata

    const reached = await verifyReachableWithRetry(result.url, {   // 2. reachability (retry + backoff)
      reachable, attempts: reachAttempts, baseDelayMs: reachBaseDelayMs, sleep,
    });
    if (!reached) throw new Error(`secure_url not reachable after ${reachAttempts} attempts: ${result.url}`);

    return {
      newUrl: result.url,
      publicId: result.publicId,
      resourceType: result.resourceType,
      bytes: result.bytes ?? null,
      width: result.width ?? null,
      height: result.height ?? null,
    };
  };
}

/**
 * Migrate one product's images (pure orchestration; migrateAsset + ledger injected).
 * Cloudinary URLs are skipped, local URLs migrated, order preserved. Never throws —
 * per-asset failures are recorded and skipped so the batch continues.
 *
 * @returns {{changed:boolean, newImages:any[], perAsset:Array}}
 */
export async function migrateProduct(product, { migrateAsset, ledger, dryRun = false, log = () => {} }) {
  const images = Array.isArray(product.images) ? product.images : [];
  const newImages = images.slice();
  const perAsset = [];
  let changed = false;

  for (let i = 0; i < images.length; i++) {
    const original = images[i];
    const url = urlOf(original);

    if (!url) { perAsset.push({ url, status: 'empty' }); continue; }
    if (isCloudinaryUrl(url)) { perAsset.push({ url, status: 'skipped-cloudinary' }); continue; }
    if (!isLocalUploadUrl(url)) { perAsset.push({ url, status: 'skipped-nonlocal' }); continue; }

    // Resume: reuse a previously-migrated result (deterministic, idempotent).
    const known = ledger.get(url);
    if (known && known.status === 'migrated' && known.newUrl) {
      const replaced = replaceUrl(original, known.newUrl);
      if (newImages[i] !== replaced) { newImages[i] = replaced; changed = true; }
      perAsset.push({ url, status: 'resumed', newUrl: known.newUrl });
      continue;
    }

    if (dryRun) { perAsset.push({ url, status: 'would-migrate', resourceType: detectResourceType(url) }); continue; }

    try {
      const res = await migrateAsset(url);                                // uploads + verifies
      ledger.set(url, { oldUrl: url, ...res, status: 'migrated', at: new Date().toISOString() });
      newImages[i] = replaceUrl(original, res.newUrl);                    // only AFTER verification
      changed = true;
      perAsset.push({ url, status: 'migrated', newUrl: res.newUrl });
      log(`[migrate] uploaded | ${url} -> ${res.newUrl}`);
    } catch (err) {
      const status = err?.code === 'MISSING' ? 'missing' : 'failed';
      ledger.set(url, { oldUrl: url, status, reason: err?.message ?? String(err), at: new Date().toISOString() });
      perAsset.push({ url, status, reason: err?.message ?? String(err) });
      log(`[migrate] ${status} | ${url} | ${err?.message ?? err}`);       // continue on error
    }
  }

  return { changed, newImages, perAsset };
}

export function newSummary() {
  return {
    productsScanned: 0, productsUpdated: 0, dbUpdateErrors: 0,
    migrated: 0, resumed: 0, skippedCloudinary: 0, skippedNonlocal: 0,
    wouldMigrate: 0, missing: 0, failed: 0,
  };
}

function tally(summary, perAsset) {
  for (const a of perAsset) {
    if (a.status === 'migrated') summary.migrated++;
    else if (a.status === 'resumed') summary.resumed++;
    else if (a.status === 'skipped-cloudinary') summary.skippedCloudinary++;
    else if (a.status === 'skipped-nonlocal') summary.skippedNonlocal++;
    else if (a.status === 'would-migrate') summary.wouldMigrate++;
    else if (a.status === 'missing') summary.missing++;
    else if (a.status === 'failed') summary.failed++;
  }
}

/**
 * Drive the migration over all products using KEYSET pagination (id ascending,
 * continue with id > last processed id). DB is updated ONLY after a product's
 * assets have uploaded + verified (migrateProduct builds newImages from verified
 * results; updateProductImages runs afterwards).
 *
 * deps: { loadProductsBatch(afterId,size), updateProductImages(id,images),
 *         migrateAsset, ledger, dryRun, batchSize, limit, log }
 *   loadProductsBatch(afterId, size): return up to `size` products with id > afterId
 *   (or the first page when afterId == null), ordered by id ascending.
 */
export async function runMigration(
  { loadProductsBatch, updateProductImages, migrateAsset, ledger, dryRun = false, batchSize = 20, limit = null, log = () => {} },
  summary = newSummary(),
) {
  let afterId = null;
  outer: for (;;) {
    const products = await loadProductsBatch(afterId, batchSize);
    if (!products || products.length === 0) break;

    for (const product of products) {
      if (limit != null && summary.productsScanned >= limit) break outer;
      summary.productsScanned++;
      const { changed, newImages, perAsset } = await migrateProduct(product, { migrateAsset, ledger, dryRun, log });
      tally(summary, perAsset);

      if (changed && !dryRun) {
        try {
          await updateProductImages(product.id, newImages);   // ← only after verification
          summary.productsUpdated++;
          log(`[migrate] db-updated | product ${product.id}`);
        } catch (err) {
          summary.dbUpdateErrors++;
          log(`[migrate] db-update-failed | product ${product.id} | ${err?.message ?? err}`);
        }
      }
    }

    afterId = products[products.length - 1].id;   // keyset cursor
    if (products.length < batchSize) break;
  }
  return summary;
}

/** Restore old local URLs from a reverse (newUrl → oldUrl) map. Pure. */
export function rollbackImages(images, reverseMap) {
  const arr = Array.isArray(images) ? images : [];
  let changed = false;
  const out = arr.map((item) => {
    const u = urlOf(item);
    if (reverseMap.has(u)) { changed = true; return replaceUrl(item, reverseMap.get(u)); }
    return item;
  });
  return { changed, images: out };
}

/**
 * Rollback all products using the ledger (KEYSET pagination). Local files are
 * untouched — this only rewrites Cloudinary URLs back to their old local URLs.
 */
export async function runRollback({ loadProductsBatch, updateProductImages, ledger, dryRun = false, batchSize = 20, limit = null, log = () => {} }) {
  const reverse = new Map();
  for (const [oldUrl, rec] of ledger.entries()) {
    if (rec && rec.status === 'migrated' && rec.newUrl) reverse.set(rec.newUrl, oldUrl);
  }
  const summary = { reverseCount: reverse.size, productsScanned: 0, productsReverted: 0, urlsReverted: 0, dbUpdateErrors: 0 };
  if (reverse.size === 0) return summary;

  let afterId = null;
  outer: for (;;) {
    const products = await loadProductsBatch(afterId, batchSize);
    if (!products || products.length === 0) break;

    for (const product of products) {
      if (limit != null && summary.productsScanned >= limit) break outer;
      summary.productsScanned++;
      const { changed, images } = rollbackImages(product.images, reverse);
      if (!changed) continue;
      const reverted = (Array.isArray(product.images) ? product.images : []).filter((it) => reverse.has(urlOf(it))).length;

      if (dryRun) { summary.productsReverted++; summary.urlsReverted += reverted; continue; }
      try {
        await updateProductImages(product.id, images);
        summary.productsReverted++;
        summary.urlsReverted += reverted;
        log(`[rollback] reverted | product ${product.id} | ${reverted} url(s)`);
      } catch (err) {
        summary.dbUpdateErrors++;
        log(`[rollback] db-update-failed | product ${product.id} | ${err?.message ?? err}`);
      }
    }

    afterId = products[products.length - 1].id;   // keyset cursor
    if (products.length < batchSize) break;
  }
  return summary;
}

/** In-memory ledger with optional persistence hook. */
export function createLedger(initial = {}, { onChange } = {}) {
  const map = new Map(Object.entries((initial && initial.assets) || {}));
  const api = {
    get: (url) => map.get(url),
    has: (url) => map.has(url),
    entries: () => map.entries(),
    size: () => map.size,
    toJSON: () => ({ version: 1, updatedAt: new Date().toISOString(), assets: Object.fromEntries(map) }),
    set: (url, val) => { map.set(url, val); if (onChange) onChange(api.toJSON()); },
  };
  return api;
}
