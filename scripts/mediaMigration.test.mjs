#!/usr/bin/env node
/**
 * scripts/mediaMigration.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the Phase-4 migration logic (scripts/lib/mediaMigration.mjs).
 * Pure module → runs with plain Node, no flags, no DB/Cloudinary/network.
 *
 * Run:  node scripts/mediaMigration.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  isCloudinaryUrl, isLocalUploadUrl, detectResourceType, migrationFilename,
  relUnderUploads, resolveLocalPath, replaceUrl, verifyUpload,
  makeAssetMigrator, migrateProduct, runMigration, runRollback,
  rollbackImages, createLedger,
} from './lib/mediaMigration.mjs';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  PASS ', name); } else { fail++; console.log('  FAIL ', name); } };
const threw = async (fn) => { try { await fn(); return false; } catch { return true; } };

const LOCAL_IMG = '/uploads/1699-photo.jpg';
const LOCAL_VID = '/uploads/clip.mp4';
const CLD_IMG   = 'https://res.cloudinary.com/demo/image/upload/v1/shopgold/products/1699-photo.jpg';
const CLD_VID   = 'https://res.cloudinary.com/demo/video/upload/v1/shopgold/products/clip.mp4';
const EXTERNAL  = 'https://placehold.co/400x500';

// A saveMedia() stub that returns a valid Cloudinary-style result.
const goodSave = (folder = 'shopgold/products') => async (buf, { filename, resourceType }) => ({
  storage: 'cloudinary',
  url: `https://res.cloudinary.com/demo/${resourceType}/upload/v1/${folder}/${filename.replace(/\.[^.]+$/, '')}.x`,
  publicId: `${folder}/${filename.replace(/\.[^.]+$/, '')}`,
  resourceType, bytes: 123, width: 10, height: 10, format: 'x',
});

// ── Pure helpers ─────────────────────────────────────────────────────────────
console.log('helpers:');
ok('isCloudinaryUrl true',  isCloudinaryUrl(CLD_IMG));
ok('isCloudinaryUrl false', !isCloudinaryUrl(LOCAL_IMG));
ok('isLocalUploadUrl true', isLocalUploadUrl(LOCAL_IMG));
ok('isLocalUploadUrl external false', !isLocalUploadUrl(EXTERNAL));
ok('isLocalUploadUrl blocks traversal', !isLocalUploadUrl('/uploads/../secret'));
ok('detectResourceType image', detectResourceType(LOCAL_IMG) === 'image');
ok('detectResourceType video', detectResourceType(LOCAL_VID) === 'video');
ok('relUnderUploads', relUnderUploads('/uploads/a/b.jpg?x=1') === 'a/b.jpg');
ok('migrationFilename base+hash+ext', /^a__b-[0-9a-f]{10}\.jpg$/.test(migrationFilename('/uploads/a/b.jpg')));
ok('publicId: same url ALWAYS same id', migrationFilename(LOCAL_IMG) === migrationFilename(LOCAL_IMG));
ok('publicId: same basename, diff dir → DIFFERENT id', migrationFilename('/uploads/a/photo.jpg') !== migrationFilename('/uploads/b/photo.jpg'));
ok('publicId: both still contain the basename', migrationFilename('/uploads/a/photo.jpg').includes('photo') && migrationFilename('/uploads/b/photo.jpg').includes('photo'));
ok('resolveLocalPath under public/uploads', /public[\\/]+uploads[\\/]+1699-photo\.jpg$/.test(resolveLocalPath(LOCAL_IMG, '/root')));
ok('replaceUrl string→string', replaceUrl('x', 'NEW') === 'NEW');
ok('replaceUrl object keeps shape', (() => { const r = replaceUrl({ url: 'x', _id: 7 }, 'NEW'); return r.url === 'NEW' && r._id === 7; })());

// ── verifyUpload ─────────────────────────────────────────────────────────────
console.log('verifyUpload:');
ok('accepts good result', verifyUpload({ storage: 'cloudinary', url: CLD_IMG, publicId: 'p', resourceType: 'image', bytes: 5 }, 'image'));
ok('rejects local fallback', await threw(async () => verifyUpload({ storage: 'local', url: '/uploads/x.jpg' })));
ok('rejects non-cloudinary url', await threw(async () => verifyUpload({ storage: 'cloudinary', url: 'https://x.com/y', publicId: 'p', bytes: 5 })));
ok('rejects zero bytes', await threw(async () => verifyUpload({ storage: 'cloudinary', url: CLD_IMG, publicId: 'p', resourceType: 'image', bytes: 0 }, 'image')));
ok('rejects resource_type mismatch', await threw(async () => verifyUpload({ storage: 'cloudinary', url: CLD_IMG, publicId: 'p', resourceType: 'image', bytes: 5 }, 'video')));

// ── makeAssetMigrator (verify-before-return) ─────────────────────────────────
console.log('makeAssetMigrator:');
{
  const base = { readFile: async () => Buffer.from('x'), fileExists: async () => true, reachable: async () => true, root: '/root', sleep: async () => {} };
  const migrate = makeAssetMigrator({ ...base, saveMedia: goodSave() });
  const r = await migrate(LOCAL_IMG);
  ok('happy: returns cloudinary newUrl', isCloudinaryUrl(r.newUrl) && r.resourceType === 'image');

  const miss = makeAssetMigrator({ ...base, fileExists: async () => false, saveMedia: goodSave() });
  let code = null; try { await miss(LOCAL_IMG); } catch (e) { code = e.code; }
  ok('missing file → code MISSING', code === 'MISSING');

  const localFallback = makeAssetMigrator({ ...base, saveMedia: async () => ({ storage: 'local', url: '/uploads/x.jpg' }) });
  ok('rejects local-fallback upload', await threw(async () => localFallback(LOCAL_IMG)));

  const unreach = makeAssetMigrator({ ...base, reachable: async () => false, saveMedia: goodSave() });
  ok('unreachable secure_url → throws', await threw(async () => unreach(LOCAL_IMG)));

  const vid = makeAssetMigrator({ ...base, saveMedia: goodSave() });
  const rv = await vid(LOCAL_VID);
  ok('video: resource_type video', rv.resourceType === 'video');
}

// ── reachability retry (tolerate CDN propagation delay) ──────────────────────
console.log('reachability retry:');
{
  const base = { readFile: async () => Buffer.from('x'), fileExists: async () => true, root: '/root', sleep: async () => {}, saveMedia: goodSave() };

  // Succeeds on the 3rd check after two transient failures.
  let calls = 0;
  const flaky = makeAssetMigrator({ ...base, reachAttempts: 3, reachable: async () => { calls += 1; return calls >= 3; } });
  const r = await flaky(LOCAL_IMG);
  ok('reach: succeeds after transient failure', isCloudinaryUrl(r.newUrl) && calls === 3);

  // Fails after all retries are exhausted.
  let calls2 = 0;
  const dead = makeAssetMigrator({ ...base, reachAttempts: 3, reachable: async () => { calls2 += 1; return false; } });
  ok('reach: throws after all retries', await threw(async () => dead(LOCAL_IMG)));
  ok('reach: attempted exactly 3 times', calls2 === 3);
}

// ── migrateProduct ───────────────────────────────────────────────────────────
console.log('migrateProduct:');
const mockAsset = (calls) => async (url) => { calls.push(url); return { newUrl: `CLD:${url}`, publicId: 'p', resourceType: detectResourceType(url), bytes: 1 }; };

{ // skips cloudinary + external, migrates local, preserves order
  const calls = [];
  const ledger = createLedger();
  const p = { id: 'p1', images: [CLD_IMG, LOCAL_IMG, EXTERNAL, LOCAL_VID] };
  const { changed, newImages, perAsset } = await migrateProduct(p, { migrateAsset: mockAsset(calls), ledger });
  ok('migrate: changed true', changed === true);
  ok('migrate: cloudinary untouched at idx0', newImages[0] === CLD_IMG);
  ok('migrate: local replaced at idx1', newImages[1] === `CLD:${LOCAL_IMG}`);
  ok('migrate: external untouched at idx2', newImages[2] === EXTERNAL);
  ok('migrate: local video replaced at idx3', newImages[3] === `CLD:${LOCAL_VID}`);
  ok('migrate: only 2 local assets uploaded', calls.length === 2);
  ok('migrate: statuses', perAsset[0].status === 'skipped-cloudinary' && perAsset[2].status === 'skipped-nonlocal');
  ok('migrate: ledger recorded', ledger.get(LOCAL_IMG)?.status === 'migrated');
}

{ // verify-before-update: failing asset stays local, product unchanged
  const ledger = createLedger();
  const failAsset = async () => { throw new Error('upload failed'); };
  const p = { id: 'p2', images: [LOCAL_IMG] };
  const { changed, newImages, perAsset } = await migrateProduct(p, { migrateAsset: failAsset, ledger });
  ok('fail: changed false (no DB update will run)', changed === false);
  ok('fail: url stays local', newImages[0] === LOCAL_IMG);
  ok('fail: status failed + ledger failed', perAsset[0].status === 'failed' && ledger.get(LOCAL_IMG)?.status === 'failed');
}

{ // resume: pre-seeded ledger → no upload call
  const calls = [];
  const ledger = createLedger({ assets: { [LOCAL_IMG]: { oldUrl: LOCAL_IMG, newUrl: 'CLD:RESUMED', status: 'migrated' } } });
  const p = { id: 'p3', images: [LOCAL_IMG] };
  const { changed, newImages } = await migrateProduct(p, { migrateAsset: mockAsset(calls), ledger });
  ok('resume: reused ledger newUrl', newImages[0] === 'CLD:RESUMED' && changed === true);
  ok('resume: migrateAsset NOT called', calls.length === 0);
}

{ // dry-run: no upload, no ledger writes
  const calls = [];
  const ledger = createLedger();
  const p = { id: 'p4', images: [LOCAL_IMG] };
  const { changed, newImages, perAsset } = await migrateProduct(p, { migrateAsset: mockAsset(calls), ledger, dryRun: true });
  ok('dry-run: no upload calls', calls.length === 0);
  ok('dry-run: url unchanged + changed false', newImages[0] === LOCAL_IMG && changed === false);
  ok('dry-run: status would-migrate + no ledger', perAsset[0].status === 'would-migrate' && ledger.size() === 0);
}

{ // duplicate local url → uploaded once, both replaced
  const calls = [];
  const ledger = createLedger();
  const p = { id: 'p5', images: [LOCAL_IMG, LOCAL_IMG] };
  const { newImages } = await migrateProduct(p, { migrateAsset: mockAsset(calls), ledger });
  ok('dup: uploaded once', calls.length === 1);
  ok('dup: both replaced', newImages[0] === `CLD:${LOCAL_IMG}` && newImages[1] === `CLD:${LOCAL_IMG}`);
}

// ── runMigration (batching + DB-after-verification + continue-on-error) ──────
console.log('runMigration:');
{
  const products = [
    { id: 'a', images: [LOCAL_IMG] },
    { id: 'b', images: [CLD_IMG] },                 // nothing to do → no DB update
    { id: 'c', images: [LOCAL_IMG, LOCAL_VID] },
    { id: 'd', images: ['/uploads/broken.jpg'] },   // asset fails → no DB update
    { id: 'e', images: [LOCAL_IMG] },
  ];
  const afterIds = [];
  const loadProductsBatch = async (afterId, size) => {
    afterIds.push(afterId);
    const start = afterId == null ? 0 : products.findIndex((p) => p.id === afterId) + 1;
    return products.slice(start, start + size);
  };
  const updated = [];
  const updateProductImages = async (id, images) => { updated.push({ id, images }); };
  const migrateAsset = async (url) => {
    if (url.includes('broken')) throw new Error('boom');
    return { newUrl: `CLD:${url}`, publicId: 'p', resourceType: detectResourceType(url), bytes: 1 };
  };
  const ledger = createLedger();
  const s = await runMigration({ loadProductsBatch, updateProductImages, migrateAsset, ledger, batchSize: 2 });

  ok('run: keyset cursors null,b,d (id > lastId)', JSON.stringify(afterIds) === JSON.stringify([null, 'b', 'd']));
  ok('run: products scanned 5', s.productsScanned === 5);
  ok('run: only changed products updated (a,c,e)', updated.length === 3 && updated.map((u) => u.id).join('') === 'ace');
  ok('run: cloudinary-only product NOT updated', !updated.find((u) => u.id === 'b'));
  ok('run: failed product NOT updated (verify-before-update)', !updated.find((u) => u.id === 'd'));
  ok('run: DB got verified secure_urls', updated[0].images[0] === `CLD:${LOCAL_IMG}`);
  // LOCAL_IMG is shared by a, c, e → uploaded once (product a), reused via the
  // ledger for c & e (cross-product dedup → no duplicate Cloudinary assets).
  ok('run: shared asset uploaded once, reused twice',
     s.migrated === 2 && s.resumed === 2 && s.failed === 1 && s.skippedCloudinary === 1 && s.productsUpdated === 3);
}

{ // --limit stops early (keyset)
  const products = [{ id: 'a', images: [LOCAL_IMG] }, { id: 'b', images: [LOCAL_VID] }, { id: 'c', images: [LOCAL_IMG] }, { id: 'd', images: [LOCAL_VID] }];
  const loadProductsBatch = async (afterId, size) => {
    const start = afterId == null ? 0 : products.findIndex((p) => p.id === afterId) + 1;
    return products.slice(start, start + size);
  };
  const updated = [];
  const updateProductImages = async (id) => { updated.push(id); };
  const migrateAsset = async (url) => ({ newUrl: `CLD:${url}`, publicId: 'p', resourceType: detectResourceType(url), bytes: 1 });
  const s = await runMigration({ loadProductsBatch, updateProductImages, migrateAsset, ledger: createLedger(), batchSize: 20, limit: 2 });
  ok('limit: only 2 products scanned', s.productsScanned === 2);
  ok('limit: only 2 products updated', updated.length === 2 && updated.join('') === 'ab');
}

// ── runRollback ──────────────────────────────────────────────────────────────
console.log('runRollback / rollbackImages:');
{
  const rev = new Map([[`CLD:${LOCAL_IMG}`, LOCAL_IMG]]);
  const { changed, images } = rollbackImages([`CLD:${LOCAL_IMG}`, CLD_VID], rev);
  ok('rollbackImages restores old url', changed && images[0] === LOCAL_IMG && images[1] === CLD_VID);
}
{
  const ledger = createLedger({ assets: { [LOCAL_IMG]: { oldUrl: LOCAL_IMG, newUrl: `CLD:${LOCAL_IMG}`, status: 'migrated' } } });
  const products = [{ id: 'a', images: [`CLD:${LOCAL_IMG}`] }, { id: 'b', images: [CLD_VID] }];
  const loadProductsBatch = async (o, n) => products.slice(o, o + n);
  const updated = [];
  const updateProductImages = async (id, images) => updated.push({ id, images });
  const s = await runRollback({ loadProductsBatch, updateProductImages, ledger, batchSize: 20 });
  ok('rollback: reverted product a only', updated.length === 1 && updated[0].id === 'a' && updated[0].images[0] === LOCAL_IMG);
  ok('rollback: summary', s.reverseCount === 1 && s.productsReverted === 1 && s.urlsReverted === 1);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
