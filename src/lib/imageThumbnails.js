/**
 * src/lib/imageThumbnails.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates pre-sized WebP thumbnails alongside the original upload.
 *
 * Sizes:
 *   sm  →  300×300  — icons, cart, wishlist, thumbnail strip
 *   md  →  600×600  — product cards, collection grids
 *   lg  → 1200×1200 — product gallery main display (HiDPI/Retina safe)
 *
 * Output format: always WebP (best size/quality ratio).
 * Naming convention (derived, no DB change needed):
 *   original : /uploads/1234-photo.jpg
 *   sm       : /uploads/1234-photo-sm.webp
 *   md       : /uploads/1234-photo-md.webp
 *   lg       : /uploads/1234-photo-lg.webp
 *
 * Pure performance layer — no UI, no business logic changed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import sharp from 'sharp';
import path  from 'path';
import { writeFile } from 'fs/promises';

// Skip formats that sharp can't safely process
const SKIP_EXTS = new Set(['gif', 'svg', 'mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv']);

export const THUMB_SIZES = {
  sm:  300,   // thumbnail strip + cart + icons
  md:  600,   // product cards + collection grids
  lg: 1200,   // main product gallery — HiDPI/Retina safe (2x of 600px display)
};

const WEBP_QUALITY = 85;

/**
 * Generate sm / md / lg WebP thumbnails from a buffer.
 * Returns { sm, md, lg } as Buffers, or null on skip/error.
 *
 * @param {Buffer} buffer    optimized original image bytes
 * @param {string} filename  original filename (extension used for skip check)
 */
export async function generateThumbnailBuffers(buffer, filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (SKIP_EXTS.has(ext)) return null;

  try {
    const entries = await Promise.all(
      Object.entries(THUMB_SIZES).map(async ([key, size]) => {
        // animated: true preserves animation frames in animated WebP inputs.
        // For static images it has no effect.
        const buf = await sharp(buffer, { failOn: 'none', animated: true })
          .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer();
        return [key, buf];
      })
    );
    return Object.fromEntries(entries); // { sm: Buffer, md: Buffer, lg: Buffer }
  } catch (err) {
    console.warn('[imageThumbnails] skipped:', err.message);
    return null;
  }
}

/**
 * Write thumbnail files to disk next to the original.
 *
 * @param {Buffer}  buffer      optimized original image bytes
 * @param {string}  filename    original file name  (e.g. "1234-photo.jpg")
 * @param {string}  uploadDir   absolute path to /public/uploads
 * @returns {{ sm: string, md: string, lg: string } | null}  relative /uploads/... URLs
 */
export async function writeThumbnails(buffer, filename, uploadDir) {
  const thumbs = await generateThumbnailBuffers(buffer, filename);
  if (!thumbs) return null;

  // Strip extension: "1234-photo.jpg" → "1234-photo"
  const base = filename.replace(/\.[^.]+$/, '');

  const urls = {};
  await Promise.all(
    Object.entries(thumbs).map(async ([key, buf]) => {
      const thumbName = `${base}-${key}.webp`;
      await writeFile(path.join(uploadDir, thumbName), buf);
      urls[key] = `/uploads/${thumbName}`;
    })
  );

  return urls; // { sm: '/uploads/1234-photo-sm.webp', md: '...', lg: '...' }
}
