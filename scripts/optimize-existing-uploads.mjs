#!/usr/bin/env node
/**
 * scripts/optimize-existing-uploads.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * One-shot migration: resize + recompress every image already sitting in
 * /public/uploads/ so legacy files get the same treatment as new uploads.
 *
 * Usage:
 *   node scripts/optimize-existing-uploads.mjs            # dry run, no writes
 *   node scripts/optimize-existing-uploads.mjs --apply    # actually replace files
 *   node scripts/optimize-existing-uploads.mjs --apply --dir=public/uploads
 *
 * Safe by default:
 *   - Dry-run mode prints what would change without touching anything.
 *   - In --apply mode each file is written atomically via a .tmp sibling then
 *     renamed, so a crash mid-write never leaves a half-file in place.
 *   - Filename + extension are preserved → URLs, DB rows, API responses stay
 *     identical. Only the bytes on disk change.
 *   - Videos, GIFs, SVGs are skipped.
 *   - If the "optimized" version is LARGER than the original (rare, e.g. an
 *     already-tiny file), the original is kept.
 *
 * Run this ONCE per deploy, then delete or archive. Run from project root.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readdir, stat, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

// ── Config (mirrors src/lib/imageOptimize.js) ───────────────────────────────
const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY        = 82;
const WEBP_QUALITY        = 82;
const AVIF_QUALITY        = 60;
const PNG_COMPRESSION     = 9;

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);
const SKIP_EXTS  = new Set(['gif', 'svg', 'mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv', 'ogg']);

// ── Args ────────────────────────────────────────────────────────────────────
const argv   = process.argv.slice(2);
const APPLY  = argv.includes('--apply');
const dirArg = argv.find(a => a.startsWith('--dir='));
const UPLOAD_DIR = path.resolve(
  process.cwd(),
  dirArg ? dirArg.slice('--dir='.length) : 'public/uploads'
);

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function optimize(buffer, ext) {
  const pipeline = sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({
      width:  MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    });

  switch (ext) {
    case 'png':
      return pipeline.png({ compressionLevel: PNG_COMPRESSION, palette: true }).toBuffer();
    case 'webp':
      return pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
    case 'avif':
      return pipeline.avif({ quality: AVIF_QUALITY }).toBuffer();
    case 'jpg':
    case 'jpeg':
    default:
      return pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  }
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory())  yield* walk(full);
    else if (e.isFile())  yield full;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[optimize] dir:   ${UPLOAD_DIR}`);
  console.log(`[optimize] mode:  ${APPLY ? 'APPLY (will rewrite files)' : 'DRY RUN (no writes)'}\n`);

  let scanned = 0, skipped = 0, rewritten = 0, keptLarger = 0, failed = 0;
  let bytesBefore = 0, bytesAfter = 0;

  for await (const filePath of walk(UPLOAD_DIR)) {
    scanned++;
    const ext = (path.extname(filePath).slice(1) || '').toLowerCase();

    if (SKIP_EXTS.has(ext) || !IMAGE_EXTS.has(ext)) {
      skipped++;
      continue;
    }

    try {
      const before = (await stat(filePath)).size;
      const buf    = await readFile(filePath);
      const out    = await optimize(buf, ext);

      bytesBefore += before;

      if (out.length >= before) {
        // Optimized version is bigger — keep original bytes.
        bytesAfter += before;
        keptLarger++;
        console.log(`= kept   ${path.relative(UPLOAD_DIR, filePath)}  (${formatBytes(before)} → ${formatBytes(out.length)}, no gain)`);
        continue;
      }

      bytesAfter += out.length;
      const pct = ((1 - out.length / before) * 100).toFixed(1);
      console.log(`${APPLY ? '✓ wrote ' : '• would '}${path.relative(UPLOAD_DIR, filePath)}  ${formatBytes(before)} → ${formatBytes(out.length)} (-${pct}%)`);

      if (APPLY) {
        const tmp = `${filePath}.optimize.tmp`;
        await writeFile(tmp, out);
        await rename(tmp, filePath); // atomic on same filesystem
        rewritten++;
      }
    } catch (err) {
      failed++;
      console.warn(`! failed ${path.relative(UPLOAD_DIR, filePath)}: ${err.message}`);
      // Best-effort cleanup of stray .tmp
      try { await unlink(`${filePath}.optimize.tmp`); } catch {}
    }
  }

  const saved = bytesBefore - bytesAfter;
  console.log('\n─── summary ─────────────────────────────');
  console.log(`scanned:     ${scanned}`);
  console.log(`skipped:     ${skipped}  (videos / gif / svg / non-image)`);
  console.log(`kept-larger: ${keptLarger}`);
  console.log(`failed:      ${failed}`);
  console.log(`${APPLY ? 'rewritten:   ' : 'would rewrite:'} ${APPLY ? rewritten : (scanned - skipped - keptLarger - failed)}`);
  console.log(`bytes before: ${formatBytes(bytesBefore)}`);
  console.log(`bytes after:  ${formatBytes(bytesAfter)}`);
  console.log(`saved:        ${formatBytes(saved)}  (${bytesBefore ? ((saved / bytesBefore) * 100).toFixed(1) : 0}%)`);
  if (!APPLY) console.log('\nRe-run with --apply to actually rewrite the files.');
}

main().catch(err => {
  console.error('[optimize] fatal:', err);
  process.exit(1);
});
