#!/usr/bin/env node
/**
 * scripts/r2-smoketest.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * DB-free Cloudflare R2 smoke test — validates the REAL saveMedia() (R2 backend)
 * and destroyByUrl() end to end.
 *
 * What it does NOT touch: the database, any product media, public/uploads (all
 * bytes in-memory), your .env, or the running app (MEDIA_STORAGE is forced for
 * THIS process only).
 *
 * Flow: force MEDIA_STORAGE=r2 → check R2 config → upload a tiny PNG + a real
 * tiny MP4 into <R2_PREFIX>/_smoketest/ → GET each public URL (expect 200) →
 * delete both via destroyByUrl(). On failure: print the real error, clean up
 * only what was uploaded, stop.
 *
 * Run on the VPS (needs R2 creds — NOT here):
 *   node --env-file=.env --experimental-detect-module scripts/r2-smoketest.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

process.env.MEDIA_STORAGE = 'r2'; // THIS process only

import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const FACADE = path.resolve(ROOT, 'src/lib/cloudinary.js');
const R2_MOD = path.resolve(ROOT, 'src/lib/r2.js');

// 1x1 transparent PNG (in-memory; no local file).
const PNG_1x1_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const line = () => console.log('─'.repeat(60));

/** Real, valid tiny MP4: reuse the fixture embedded in cloudinary-smoketest.mjs,
 *  or SMOKETEST_VIDEO_PATH=./clip.mp4 (read-only; nothing is written). */
async function loadMp4() {
  const override = process.env.SMOKETEST_VIDEO_PATH;
  if (override) return readFile(path.resolve(override));
  const cs = fs.readFileSync(path.resolve(ROOT, 'scripts/cloudinary-smoketest.mjs'), 'utf8');
  const m = cs.match(/SAMPLE_MP4_B64 = `([\s\S]*?)`\.replace/);
  if (!m) throw new Error('MP4 fixture not found; set SMOKETEST_VIDEO_PATH=./clip.mp4');
  return Buffer.from(m[1].replace(/\s+/g, ''), 'base64');
}

async function httpStatus(url) {
  try { const r = await fetch(url, { method: 'GET' }); return r.status; }
  catch (e) { return `ERR ${e?.message ?? e}`; }
}

function printAsset(label, r) {
  console.log(`${label}:`);
  console.log(`  storage       : ${r.storage}`);
  console.log(`  public url    : ${r.url}`);
  console.log(`  object key    : ${r.key}`);
  console.log(`  resource type : ${r.resource_type}`);
  console.log(`  content type  : ${r.contentType}`);
  console.log(`  bytes         : ${r.bytes}`);
  console.log(`  format        : ${r.format ?? '(n/a)'}`);
  console.log(`  width/height  : ${r.width ?? '(n/a)'} / ${r.height ?? '(n/a)'}  (not parsed — never fabricated)`);
}

async function main() {
  const svc = await import(pathToFileURL(FACADE).href);
  const r2 = await import(pathToFileURL(R2_MOD).href);

  const status = r2.r2ConfigStatus();
  line();
  console.log('R2 smoke test — DB-free, no product media, no local file');
  console.log(`MEDIA_STORAGE : ${process.env.MEDIA_STORAGE}`);
  console.log(`R2 configured : ${status.ok}${status.ok ? '' : ` (missing: ${status.missing.join(', ')})`}`);
  line();
  if (!status.ok) {
    console.error('✗ R2 config incomplete. Run: node --env-file=.env --experimental-detect-module scripts/r2-smoketest.mjs');
    process.exit(1);
  }

  const ts = Date.now();
  const uploaded = []; // public URLs actually uploaded

  try {
    // ── image ──
    const img = await svc.saveMedia(Buffer.from(PNG_1x1_B64, 'base64'), {
      filename: `smoketest-image-${ts}.png`, category: '_smoketest', resourceType: 'image',
    });
    if (img.storage !== 'r2') throw new Error(`image did not upload to R2 (storage=${img.storage})`);
    uploaded.push(img.url); printAsset('IMAGE', img);

    // ── video ──
    const mp4 = await loadMp4();
    const vid = await svc.saveMedia(mp4, {
      filename: `smoketest-video-${ts}.mp4`, category: '_smoketest', resourceType: 'video',
    });
    if (vid.storage !== 'r2') throw new Error(`video did not upload to R2 (storage=${vid.storage})`);
    uploaded.push(vid.url); printAsset('VIDEO', vid);

    // ── reachability (expect HTTP 200) ──
    line();
    for (const u of uploaded) {
      const s = await httpStatus(u);
      console.log(`GET ${u} -> ${s}`);
      if (s !== 200) throw new Error(`public URL not 200: ${u} (${s})`);
    }
  } catch (err) {
    line();
    console.error('✗ SMOKE TEST FAILED:', err?.message ?? err);
    if (uploaded.length) {
      console.error(`  cleaning up ${uploaded.length} uploaded object(s)…`);
      for (const u of uploaded) {
        try { console.error('   destroy:', JSON.stringify(await svc.destroyByUrl(u))); }
        catch (e) { console.error('   destroy error:', e?.message ?? e); }
      }
    }
    process.exit(1);
  }

  // ── delete both ──
  line();
  console.log('Deleting both objects via destroyByUrl()…');
  let allOk = true;
  for (const u of uploaded) {
    const d = await svc.destroyByUrl(u);
    console.log('  ', JSON.stringify(d));
    if (!d.ok) allOk = false;
  }

  line();
  console.log(allOk
    ? '✓ R2 SMOKE TEST PASSED — upload + HTTP 200 + delete OK. No DB, no product media, no local file.'
    : '⚠ uploads verified but a delete did not return ok — check the bucket under <R2_PREFIX>/_smoketest/.');
  process.exit(allOk ? 0 : 2);
}

main().catch((e) => { console.error('Fatal:', e?.message ?? e); process.exit(1); });
