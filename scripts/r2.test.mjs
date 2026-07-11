#!/usr/bin/env node
/**
 * scripts/r2.test.mjs — unit tests for src/lib/r2.js (config, keys, URL parsing,
 * upload, delete). SDK is never loaded: saveMediaR2/destroyByUrlR2 take injected
 * `deps`, and config funcs take an injected `env`.
 *
 * Run:  node --experimental-detect-module scripts/r2.test.mjs
 */

import {
  normalizePrefix, normalizePublicUrl, r2ConfigStatus, isR2Configured,
  buildObjectKey, publicUrlForKey, isR2Url, keyFromUrl, categoryFor,
  contentTypeFor, detectResourceType, saveMediaR2, destroyByUrlR2,
} from '../src/lib/r2.js';
import { migrationFilename } from './lib/mediaMigration.mjs';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };
const threw = (fn) => { try { fn(); return false; } catch { return true; } };

const ENV = {
  R2_ACCESS_KEY_ID: 'ak', R2_SECRET_ACCESS_KEY: 'sk', R2_BUCKET: 'shopgold-media',
  R2_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  R2_PUBLIC_URL: 'https://media.example.com/', R2_PREFIX: 'siteA',
};
const PUB = 'https://media.example.com';

console.log('config:');
ok('missing vars listed', (() => { const s = r2ConfigStatus({ R2_BUCKET: 'b' }); return !s.ok && s.missing.includes('R2_ENDPOINT') && s.missing.includes('R2_PREFIX'); })());
ok('complete config ok', r2ConfigStatus(ENV).ok && isR2Configured(ENV));
ok('normalizePublicUrl strips trailing slash', normalizePublicUrl('https://m.example.com//') === 'https://m.example.com');
ok('normalizePrefix strips slashes', normalizePrefix('/siteA/') === 'siteA');
ok('normalizePrefix collapses inner', normalizePrefix('a//b') === 'a/b');
ok('normalizePrefix empty ok', normalizePrefix('') === '');
ok('normalizePrefix rejects traversal', threw(() => normalizePrefix('a/../b')));

console.log('object keys:');
ok('contentTypeFor png', contentTypeFor('x.png') === 'image/png');
ok('contentTypeFor mp4', contentTypeFor('x.mp4') === 'video/mp4');
ok('detectResourceType video', detectResourceType('x.mp4') === 'video' && detectResourceType('x.jpg') === 'image');
ok('categoryFor video', categoryFor('shopgold/uploads', 'video') === 'videos');
ok('categoryFor avatars', categoryFor('shopgold/avatars', 'image') === 'avatars');
ok('categoryFor receipts', categoryFor('shopgold/receipts', 'image') === 'receipts');
ok('categoryFor default products', categoryFor('shopgold/uploads', 'image') === 'products');

const kDet = buildObjectKey({ prefix: 'siteA', category: 'products', filename: '1699-photo-abc123.jpg', deterministic: true });
ok('deterministic key shape', kDet === 'siteA/products/1699-photo-abc123.jpg');
ok('deterministic key stable', buildObjectKey({ prefix: 'siteA', category: 'products', filename: '1699-photo-abc123.jpg', deterministic: true }) === kDet);
ok('sanitizes weird chars', buildObjectKey({ prefix: 'siteA', category: 'products', filename: 'my file (1)!.png', deterministic: true }) === 'siteA/products/my-file-1.png');
const kRand1 = buildObjectKey({ prefix: 'siteA', category: 'products', filename: 'p.jpg' });
const kRand2 = buildObjectKey({ prefix: 'siteA', category: 'products', filename: 'p.jpg' });
ok('non-deterministic keys differ (random suffix)', kRand1 !== kRand2 && /^siteA\/products\/p-[0-9a-f]+\.jpg$/.test(kRand1));
ok('different prefix does not collide', buildObjectKey({ prefix: 'siteB', category: 'products', filename: 'p-h.jpg', deterministic: true }) !== buildObjectKey({ prefix: 'siteA', category: 'products', filename: 'p-h.jpg', deterministic: true }));

// migration determinism end-to-end (migrationFilename → R2 key)
const keyFor = (u) => buildObjectKey({ prefix: 'siteA', category: 'products', filename: migrationFilename(u), deterministic: true });
ok('same old URL → same key', keyFor('/uploads/photo.jpg') === keyFor('/uploads/photo.jpg'));
ok('same basename diff dir → different keys', keyFor('/uploads/a/photo.jpg') !== keyFor('/uploads/b/photo.jpg'));

console.log('url parsing:');
ok('publicUrlForKey builds + encodes', publicUrlForKey('https://m.example.com/', 'siteA/products/a b.jpg') === 'https://m.example.com/siteA/products/a%20b.jpg');
ok('isR2Url true', isR2Url(`${PUB}/siteA/products/x.jpg`, PUB));
ok('isR2Url wrong host false', !isR2Url('https://evil.com/siteA/x.jpg', PUB));
ok('isR2Url wrong protocol false', !isR2Url('http://media.example.com/siteA/x.jpg', PUB));
ok('keyFromUrl valid', keyFromUrl(`${PUB}/siteA/products/x.jpg`, { publicUrl: PUB }) === 'siteA/products/x.jpg');
ok('keyFromUrl decodes segments', keyFromUrl(`${PUB}/siteA/products/a%20b.jpg`, { publicUrl: PUB }) === 'siteA/products/a b.jpg');
ok('keyFromUrl wrong host → null', keyFromUrl('https://evil.com/siteA/x.jpg', { publicUrl: PUB }) === null);
ok('keyFromUrl empty path → null', keyFromUrl(`${PUB}/`, { publicUrl: PUB }) === null);
// URL() normalizes both literal ".." and "%2e%2e" for http(s) (can't escape the
// origin) → out-of-prefix result is blocked by enforcePrefix (used by real deletes).
ok('encoded traversal normalized, blocked by enforcePrefix', keyFromUrl(`${PUB}/siteA/%2e%2e/secret.jpg`, { publicUrl: PUB, prefix: 'siteA', enforcePrefix: true }) === null);
ok('literal .. normalized, blocked by enforcePrefix', keyFromUrl(`${PUB}/siteA/../secret.jpg`, { publicUrl: PUB, prefix: 'siteA', enforcePrefix: true }) === null);
ok('keyFromUrl enforcePrefix rejects outside', keyFromUrl(`${PUB}/siteB/x.jpg`, { publicUrl: PUB, prefix: 'siteA', enforcePrefix: true }) === null);
ok('keyFromUrl enforcePrefix allows inside', keyFromUrl(`${PUB}/siteA/x.jpg`, { publicUrl: PUB, prefix: 'siteA', enforcePrefix: true }) === 'siteA/x.jpg');

console.log('upload (injected deps):');
{
  const calls = [];
  const deps = { putObject: async (p) => { calls.push(p); return { ETag: 'x' }; }, deleteObject: async () => {} };
  const img = await saveMediaR2(Buffer.from('hello'), { filename: 'pic.png', category: 'products', resourceType: 'image', deterministic: true }, deps, ENV);
  ok('image: storage r2', img.storage === 'r2');
  ok('image: bucket + key + content-type + cache-control', calls[0].bucket === 'shopgold-media' && calls[0].key === 'siteA/products/pic.png' && calls[0].contentType === 'image/png' && calls[0].cacheControl === 'public, max-age=31536000, immutable');
  ok('image: public url', img.url === 'https://media.example.com/siteA/products/pic.png' && img.secure_url === img.url);
  ok('image: metadata (no fabrication)', img.resource_type === 'image' && img.bytes === 5 && img.format === 'png' && img.width === undefined && img.height === undefined);

  const calls2 = [];
  const deps2 = { putObject: async (p) => { calls2.push(p); }, deleteObject: async () => {} };
  const vid = await saveMediaR2(Buffer.from('vv'), { filename: 'clip.mp4', resourceType: 'video', deterministic: true }, deps2, ENV);
  ok('video: category videos + content-type', calls2[0].key === 'siteA/videos/clip.mp4' && calls2[0].contentType === 'video/mp4' && vid.resource_type === 'video');
}

console.log('deletion (injected deps):');
{
  const del = [];
  const deps = { putObject: async () => {}, deleteObject: async (p) => { del.push(p); return {}; } };
  const r1 = await destroyByUrlR2(`${PUB}/siteA/products/x.jpg`, deps, ENV);
  ok('valid image delete', r1.ok && r1.storage === 'r2' && r1.result === 'deleted' && r1.key === 'siteA/products/x.jpg' && del[0].bucket === 'shopgold-media');
  const r2v = await destroyByUrlR2(`${PUB}/siteA/videos/clip.mp4`, deps, ENV);
  ok('valid video delete', r2v.ok && r2v.key === 'siteA/videos/clip.mp4');
  ok('local url skipped', (await destroyByUrlR2('/uploads/x.jpg', deps, ENV)).skipped === true);
  ok('external url skipped', (await destroyByUrlR2('https://placehold.co/x.jpg', deps, ENV)).skipped === true);
  ok('wrong-host skipped (reason)', (await destroyByUrlR2('https://evil.com/siteA/x.jpg', deps, ENV)).reason === 'wrong-host');
  ok('outside prefix → invalid-key skip', (await destroyByUrlR2(`${PUB}/siteB/x.jpg`, deps, ENV)).skipped === true);

  // best-effort: delete failure returns structured error, does not throw
  const failDeps = { deleteObject: async () => { throw new Error('r2 down'); } };
  let threwErr = false; let res;
  try { res = await destroyByUrlR2(`${PUB}/siteA/products/x.jpg`, failDeps, ENV); } catch { threwErr = true; }
  ok('failed delete does not throw', !threwErr && res.ok === false && /r2 down/.test(res.error) && res.key === 'siteA/products/x.jpg');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
