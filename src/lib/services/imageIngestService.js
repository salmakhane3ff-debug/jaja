/**
 * src/lib/services/imageIngestService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * THE image-ingest pipeline. Extracted verbatim from the POST /api/image
 * handler so that route and the product-URL importer share ONE implementation
 * instead of growing a second, drifting uploader.
 *
 * The order is load-bearing and unchanged:
 *   1. validate  — extension + magic bytes + size (uploadSecurity)
 *   2. optimize  — compress/resize BEFORE watermarking, so the watermark is
 *                  applied to the final dimensions (imageOptimize)
 *   3. watermark — store setting, non-fatal if it fails (watermarkService)
 *   4. store     — saveMedia(): R2 in production, Cloudinary legacy, local dev.
 *                  R2 prefix/category conventions come from that service, never
 *                  from callers.
 *   5. thumbnails— local storage only, fire-and-forget sm/md/lg WebP
 *   6. record    — a row in `images`, so imported media appears in the existing
 *                  media library exactly like an uploaded file
 *
 * SERVER-ONLY.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import path from 'path';
import prisma from '../prisma.js';
import { getWatermarkSettings, applyWatermark } from './watermarkService.js';
import { validateImage, validateVideo } from '../uploadSecurity.js';
import { optimizeImageBuffer } from '../imageOptimize.js';
import { writeThumbnails } from '../imageThumbnails.js';
import { saveMedia } from '../cloudinary.js';

/** Shape the `images` row the way every existing consumer expects. */
export function mapImageRow(row) {
  if (!row) return null;
  return { _id: row.id, name: row.name, url: row.url, createdAt: row.createdAt };
}

/**
 * Run one buffer through the full pipeline and record it in the media library.
 *
 * @param {Buffer} buffer
 * @param {{originalName:string, isVideo?:boolean, folder?:string}} opts
 * @returns {Promise<{ok:true, record:object} | {ok:false, error:string, status:number}>}
 */
export async function ingestImageBuffer(buffer, {
  originalName,
  isVideo = false,
  folder = 'shopgold/uploads',
} = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, error: 'File is empty', status: 400 };
  }

  const name = String(originalName || 'image');

  // 1 — security
  const validation = isVideo ? validateVideo(buffer, name) : validateImage(buffer, name);
  if (!validation.ok) return { ok: false, error: validation.error, status: validation.status };

  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const fileName = `${Date.now()}-${safeName}`;

  let out = buffer;

  // 2 + 3 — image-only post-processing (video is never re-encoded)
  if (!isVideo) {
    out = await optimizeImageBuffer(out, name);
    try {
      const wm = await getWatermarkSettings();
      if (wm?.isEnabled) out = await applyWatermark(out, wm);
    } catch (wmErr) {
      console.warn('[watermark] Skipped:', wmErr.message);
    }
  }

  // 4 — storage (R2 / Cloudinary / local is decided inside saveMedia)
  const saved = await saveMedia(out, {
    filename: fileName,
    folder,
    resourceType: isVideo ? 'video' : 'image',
  });

  // 5 — responsive variants, local storage only
  if (saved.storage === 'local' && !isVideo) {
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    writeThumbnails(out, fileName, uploadDir).catch((e) =>
      console.warn('[thumbnails] failed for', fileName, e.message)
    );
  }

  // 6 — media-library record
  const row = await prisma.image.create({ data: { name, url: saved.url } });
  return { ok: true, record: mapImageRow(row) };
}

/**
 * Ingest several already-fetched buffers, keeping the successes when some fail.
 * Never rejects: a per-item failure becomes an entry in `failed`.
 *
 * @param {Array<{buffer:Buffer, originalName:string, sourceUrl?:string}>} items
 * @returns {Promise<{urls:string[], records:object[], failed:Array<{sourceUrl:string, error:string}>}>}
 */
export async function ingestImageBuffers(items) {
  const urls = [], records = [], failed = [];

  for (const item of Array.isArray(items) ? items : []) {
    try {
      const res = await ingestImageBuffer(item.buffer, { originalName: item.originalName });
      if (res.ok) { urls.push(res.record.url); records.push(res.record); }
      else failed.push({ sourceUrl: item.sourceUrl || '', error: res.error });
    } catch (err) {
      // One bad image must never abort the batch or bubble to the admin page.
      console.warn('[importImages] ingest failed:', err.message);
      failed.push({ sourceUrl: item.sourceUrl || '', error: 'Processing failed' });
    }
  }
  return { urls, records, failed };
}
