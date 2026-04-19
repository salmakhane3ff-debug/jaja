#!/usr/bin/env node
/**
 * scripts/generate-thumbnails.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * One-shot migration: generate sm/md/lg WebP thumbnails for every existing
 * image in /public/uploads/ that does not already have them.
 *
 * Usage:
 *   node scripts/generate-thumbnails.mjs            # dry-run, no writes
 *   node scripts/generate-thumbnails.mjs --apply    # actually write files
 *   node scripts/generate-thumbnails.mjs --apply --dir=public/uploads
 *
 * Safe by default:
 *   - Dry-run shows what would be created without touching anything.
 *   - Already-existing thumbnails are skipped (idempotent).
 *   - Videos, GIFs, SVGs are skipped.
 *   - Existing originals are never modified.
 *
 * Run ONCE after deploying the thumbnail system, then archive this script.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readdir, stat, readFile, writeFile, access } from 'node:fs/promises';
import path    from 'node:path';
import process from 'node:process';
import sharp   from 'sharp';

// ── Config (mirrors src/lib/imageThumbnails.js) ──────────────────────────────
const THUMB_SIZES = { sm: 80, md: 200, lg: 400 };
const WEBP_QUALITY = 82;
const IMAGE_EXTS   = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);
const SKIP_EXTS    = new Set(['gif', 'svg', 'mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv']);

// ── Args ─────────────────────────────────────────────────────────────────────
const argv   = process.argv.slice(2);
const APPLY  = argv.includes('--apply');
const dirArg = argv.find(a => a.startsWith('--dir='));
const UPLOAD_DIR = path.resolve(
  process.cwd(),
  dirArg ? dirArg.slice('--dir='.length) : 'public/uploads'
);

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory())  yield* walk(full);
    else if (e.isFile())  yield full;
  }
}

async function generateThumbs(buffer, base, uploadDir) {
  return Promise.all(
    Object.entries(THUMB_SIZES).map(async ([key, size]) => {
      const thumbPath = path.join(uploadDir, `${base}-${key}.webp`);
      const buf = await sharp(buffer, { failOn: 'none' })
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      return { key, thumbPath, buf, size: buf.length };
    })
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[thumbnails] dir:  ${UPLOAD_DIR}`);
  console.log(`[thumbnails] mode: ${APPLY ? 'APPLY (will write files)' : 'DRY RUN (no writes)'}\n`);

  let scanned = 0, skipped = 0, alreadyDone = 0, created = 0, failed = 0;
  let bytesWritten = 0;

  for await (const filePath of walk(UPLOAD_DIR)) {
    scanned++;
    const name = path.basename(filePath);
    const ext  = (path.extname(filePath).slice(1) || '').toLowerCase();

    // Skip thumbnails themselves (they end in -sm/-md/-lg.webp)
    if (/-(sm|md|lg)\.webp$/.test(name)) { skipped++; continue; }

    if (SKIP_EXTS.has(ext) || !IMAGE_EXTS.has(ext)) { skipped++; continue; }

    const base = name.replace(/\.[^.]+$/, '');

    // Check if all 3 thumbnails already exist
    const allExist = await Promise.all(
      Object.keys(THUMB_SIZES).map(key => exists(path.join(UPLOAD_DIR, `${base}-${key}.webp`)))
    ).then(r => r.every(Boolean));

    if (allExist) { alreadyDone++; continue; }

    try {
      const buffer = await readFile(filePath);
      const thumbs = await generateThumbs(buffer, base, UPLOAD_DIR);
      const rel    = path.relative(UPLOAD_DIR, filePath);

      if (APPLY) {
        await Promise.all(thumbs.map(({ thumbPath, buf }) => writeFile(thumbPath, buf)));
        const total = thumbs.reduce((s, t) => s + t.size, 0);
        bytesWritten += total;
        created += thumbs.length;
        console.log(`✓ ${rel}  → sm(${formatBytes(thumbs[0].size)}) md(${formatBytes(thumbs[1].size)}) lg(${formatBytes(thumbs[2].size)})`);
      } else {
        const total = thumbs.reduce((s, t) => s + t.size, 0);
        console.log(`• ${rel}  → would write ~${formatBytes(total)} (3 thumbs)`);
      }
    } catch (err) {
      failed++;
      console.warn(`! failed ${path.relative(UPLOAD_DIR, filePath)}: ${err.message}`);
    }
  }

  console.log('\n─── summary ─────────────────────────────────────────');
  console.log(`scanned:       ${scanned}`);
  console.log(`skipped:       ${skipped}  (videos / gif / svg / thumb files)`);
  console.log(`already done:  ${alreadyDone}`);
  console.log(`failed:        ${failed}`);
  if (APPLY) {
    console.log(`files created: ${created}  (${created / 3 | 0} originals × 3 sizes)`);
    console.log(`bytes written: ${formatBytes(bytesWritten)}`);
  } else {
    console.log(`would process: ${scanned - skipped - alreadyDone - failed} originals`);
    console.log('\nRe-run with --apply to actually generate the thumbnails.');
  }
}

main().catch(err => {
  console.error('[thumbnails] fatal:', err);
  process.exit(1);
});
