/**
 * src/lib/imageOptimize.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared image optimizer used by upload routes.
 *
 * WHY: Phones upload 3024×3024 / 3–5 MB JPEGs that the storefront renders at
 * 300–400 px. Bytes we never show crush LCP and bandwidth. We clamp dimensions
 * and re-encode while KEEPING the original file extension so URLs, DB rows,
 * and API responses stay byte-compatible with existing clients.
 *
 * Pure performance layer — no UI, no business logic, no response shape change.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import sharp from 'sharp';

const MAX_IMAGE_DIMENSION = 1600;   // px on the longest side
const JPEG_QUALITY        = 82;
const WEBP_QUALITY        = 82;
const AVIF_QUALITY        = 60;
const PNG_COMPRESSION     = 9;

/**
 * Resize (fit inside MAX_IMAGE_DIMENSION) + re-encode the buffer in its
 * original format. GIF / SVG are returned untouched — sharp cannot safely
 * round-trip animations or vector graphics.
 *
 * Never throws: on any failure returns the original buffer so an upload is
 * never blocked by an optimizer hiccup.
 *
 * @param {Buffer} buffer   original file bytes
 * @param {string} filename original file name (used only to detect extension)
 * @returns {Promise<Buffer>}
 */
export async function optimizeImageBuffer(buffer, filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'gif' || ext === 'svg') return buffer;

  try {
    // animated: true preserves all frames in animated WebP inputs.
    // For static images it has no effect on output or performance.
    const pipeline = sharp(buffer, { failOn: 'none', animated: true })
      .rotate() // honour EXIF orientation then strip it
      .resize({
        width:  MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });

    switch (ext) {
      case 'png':
        return await pipeline.png({ compressionLevel: PNG_COMPRESSION, palette: true }).toBuffer();
      case 'webp':
        return await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
      case 'avif':
        return await pipeline.avif({ quality: AVIF_QUALITY }).toBuffer();
      case 'jpg':
      case 'jpeg':
      default:
        return await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
    }
  } catch (err) {
    console.warn('[imageOptimize] skipped:', err.message);
    return buffer;
  }
}
