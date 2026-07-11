#!/usr/bin/env node
/**
 * scripts/mediaCleanup.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the Phase-3 deletion sync (src/lib/mediaCleanup.js) + the
 * URL identity parsing it relies on (publicIdFromUrl in src/lib/cloudinary.js).
 * No test framework, no network: Cloudinary destroy is injected as a mock.
 *
 * Run:  node --experimental-detect-module scripts/mediaCleanup.test.mjs
 *       (flag lets plain Node load the ESM-syntax .js; default on Node >= 22.7)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { destroyManyByUrls, diffRemovedUrls } from '../src/lib/mediaCleanup.js';
import { publicIdFromUrl } from '../src/lib/cloudinary.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log('  PASS ', name); }
  else { fail++; console.log('  FAIL ', name); }
};

const CLD_IMG   = 'https://res.cloudinary.com/demo/image/upload/v1/shopgold/uploads/1699-photo.jpg';
const CLD_VID   = 'https://res.cloudinary.com/demo/video/upload/v1/shopgold/uploads/clip.mp4';
const LOCAL_IMG = '/uploads/1699-photo.jpg';
const EXTERNAL  = 'https://placehold.co/400x500?text=x';

// A mock that mimics destroyByUrl(): derives resource_type from the URL and
// records every call so we can assert what was (and wasn't) destroyed.
function makeMock(recorder, { fail = new Set() } = {}) {
  return async (url) => {
    recorder.push(url);
    if (fail.has(url)) throw new Error('simulated cloudinary failure');
    const parsed = publicIdFromUrl(url);
    if (!parsed) return { ok: false, skipped: true, reason: 'not-a-cloudinary-url' };
    return { ok: true, result: 'ok', publicId: parsed.publicId, resourceType: parsed.resourceType };
  };
}

// ── publicIdFromUrl: correct resource_type / local skip ──────────────────────
console.log('publicIdFromUrl (identity used for destroy):');
ok('image → resource_type image', publicIdFromUrl(CLD_IMG)?.resourceType === 'image');
ok('video → resource_type video', publicIdFromUrl(CLD_VID)?.resourceType === 'video');
ok('local /uploads → null (skipped)', publicIdFromUrl(LOCAL_IMG) === null);

// ── 1. Cloudinary image deletion ─────────────────────────────────────────────
console.log('destroyManyByUrls:');
await (async () => {
  const calls = [];
  const s = await destroyManyByUrls([CLD_IMG], { destroyFn: makeMock(calls) });
  ok('image: deleted=1', s.deleted === 1 && s.skipped === 0 && s.failed === 0);
  ok('image: destroy called with the image url', calls.length === 1 && calls[0] === CLD_IMG);
})();

// ── 2. Cloudinary video deletion (correct resource_type) ─────────────────────
await (async () => {
  const calls = [];
  const s = await destroyManyByUrls([CLD_VID], { destroyFn: makeMock(calls) });
  ok('video: deleted=1', s.deleted === 1 && s.failed === 0);
  ok('video: uses resource_type video', publicIdFromUrl(calls[0])?.resourceType === 'video');
})();

// ── 3. Local upload skipped (uses REAL destroyByUrl — no network) ─────────────
await (async () => {
  const s = await destroyManyByUrls([LOCAL_IMG, EXTERNAL]); // default destroyFn = real destroyByUrl
  ok('local + external: skipped=2, deleted=0, failed=0',
     s.skipped === 2 && s.deleted === 0 && s.failed === 0);
})();

// ── 4. Duplicate URLs handled safely (destroyed once) ────────────────────────
await (async () => {
  const calls = [];
  const s = await destroyManyByUrls([CLD_IMG, CLD_IMG, CLD_VID, CLD_VID], { destroyFn: makeMock(calls) });
  ok('duplicates: destroy called exactly twice (unique)', calls.length === 2);
  ok('duplicates: deleted=2, total=2', s.deleted === 2 && s.total === 2);
})();

// ── 5. Failed destroy() does not throw → DB deletion can continue ─────────────
await (async () => {
  const calls = [];
  let threw = false;
  let summary;
  try {
    summary = await destroyManyByUrls([CLD_IMG, CLD_VID], {
      destroyFn: makeMock(calls, { fail: new Set([CLD_IMG]) }),
    });
  } catch { threw = true; }
  ok('failure: destroyManyByUrls never throws', threw === false);
  ok('failure: one failed, one still deleted', summary && summary.failed === 1 && summary.deleted === 1);

  // Simulate the service ordering: DB delete happens, THEN cleanup fails — DB
  // deletion must still be considered done (never rolled back by a Cloudinary error).
  let dbDeleted = false;
  const fakeDeleteProduct = async () => {
    dbDeleted = true; // prisma.product.delete(...) already succeeded
    await destroyManyByUrls([CLD_IMG], { destroyFn: makeMock([], { fail: new Set([CLD_IMG]) }) });
    return true;
  };
  const result = await fakeDeleteProduct();
  ok('failure: DB delete completes despite cloudinary failure', dbDeleted === true && result === true);
})();

// ── diffRemovedUrls ──────────────────────────────────────────────────────────
console.log('diffRemovedUrls:');
ok('finds removed url', JSON.stringify(diffRemovedUrls([CLD_IMG, CLD_VID], [CLD_VID])) === JSON.stringify([CLD_IMG]));
ok('nothing removed → empty', diffRemovedUrls([CLD_IMG], [CLD_IMG]).length === 0);
ok('handles {url} objects', JSON.stringify(diffRemovedUrls([{ url: CLD_IMG }, { url: CLD_VID }], [{ url: CLD_VID }])) === JSON.stringify([CLD_IMG]));
ok('dedupes removed', diffRemovedUrls([CLD_IMG, CLD_IMG], []).length === 1);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
