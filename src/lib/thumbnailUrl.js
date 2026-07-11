/**
 * src/lib/thumbnailUrl.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Frontend helper — pick the right pre-generated thumbnail URL.
 *
 * Usage:
 *   import { thumbUrl } from '@/lib/thumbnailUrl';
 *
 *   // In a product card (200px display size):
 *   <img src={thumbUrl(product.images[0], 'md')} ... />
 *
 *   // In a cart icon (40px display size):
 *   <img src={thumbUrl(item.image, 'sm')} ... />
 *
 *   // In a product gallery strip (80px):
 *   <img src={thumbUrl(img, 'lg')} ... />
 *
 * Sizes:
 *   'sm'  →  80px  — icons, cart, wishlist, review avatars
 *   'md'  → 200px  — product cards, collection grids
 *   'lg'  → 400px  — gallery thumbnail strip
 *
 * Cloudinary images are transformed by inserting f_auto,q_auto,w_*,c_limit after
 * /image/upload/ (never -sm/-md/-lg sidecars). Local /uploads/ images use the
 * pre-generated -sm/-md/-lg.webp sidecars. Cloudinary videos, local videos,
 * GIF/SVG, external and unknown URLs are returned unchanged.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const VIDEO_EXT  = /\.(mp4|webm|mov|avi|mkv|ogv)(\?.*)?$/i;
// GIF and SVG must always use the original URL:
//  - GIF: animated frames are lost when converting to WebP (thumbnails skip GIFs)
//  - SVG: vector format, thumbnails are never generated for it
const SKIP_EXT   = /\.(gif|svg)(\?.*)?$/i;
const VALID_SIZE = new Set(['sm', 'md', 'lg']);

// ── Cloudinary ────────────────────────────────────────────────────────────────
// Our Cloudinary delivery host. Images are transformed by INSERTING a
// transformation segment after "/image/upload/". We NEVER append -sm/-md/-lg to a
// Cloudinary URL — those sidecar files exist only for local /uploads/ images, and
// a Cloudinary URL can itself contain "/uploads/" inside its folder path
// (shopgold/uploads/...), which must not be mistaken for a local sidecar path.
// Video URLs (/video/upload/) and any other Cloudinary path are returned as-is.
const CLOUDINARY_HOST_RE  = /^https?:\/\/res\.cloudinary\.com\//i;
const IMAGE_UPLOAD_MARKER = '/image/upload/';

// f_auto (best format) + q_auto (auto quality) + c_limit (never upscale, keep
// aspect — matches the gallery's object-contain layout).
const CLD_TRANSFORM = {
  sm: 'f_auto,q_auto,w_300,c_limit',
  md: 'f_auto,q_auto,w_600,c_limit',
  lg: 'f_auto,q_auto,w_1200,c_limit',
};

/**
 * Return the display URL for a given original media URL and desired size.
 *
 *   - Cloudinary image        → /image/upload/<transform>/…  (f_auto,q_auto,w_*,c_limit)
 *   - Cloudinary video / other → original (unchanged)
 *   - Local /uploads/ image    → pre-generated "-sm/-md/-lg.webp" sidecar
 *   - Video / GIF / SVG / external / unknown → original (unchanged)
 *
 * @param {string | { url: string } | null | undefined} src
 * @param {'sm'|'md'|'lg'} size
 * @returns {string}  always returns a usable string URL
 */
export function thumbUrl(src, size = 'md') {
  // Normalise input — accept both string and {url:...} object
  const url = (typeof src === 'string' ? src : src?.url || src?.src) || '';

  if (!url)                  return '';
  if (!VALID_SIZE.has(size)) return url;

  // ── Cloudinary URLs ────────────────────────────────────────────────────────
  // Checked FIRST — before the /uploads/ test below — because a Cloudinary URL
  // may contain "/uploads/" in its folder path.
  if (CLOUDINARY_HOST_RE.test(url)) {
    const idx = url.indexOf(IMAGE_UPLOAD_MARKER);
    if (idx === -1) return url;                          // e.g. /video/upload/ → unchanged
    const insertAt = idx + IMAGE_UPLOAD_MARKER.length;
    return url.slice(0, insertAt) + CLD_TRANSFORM[size] + '/' + url.slice(insertAt);
  }

  // ── Videos / GIF / SVG (local or external) → keep original ─────────────────
  if (VIDEO_EXT.test(url)) return url;
  if (SKIP_EXT.test(url))  return url;

  // ── Local /uploads/ sidecars (existing behavior) ───────────────────────────
  if (url.startsWith('/uploads/') || url.includes('/uploads/')) {
    const [base] = url.split('?');                       // strip query string
    const noExt  = base.replace(/\.[^.]+$/, '');         // strip extension
    return `${noExt}-${size}.webp`;
  }

  // ── Anything else (external, data:, unknown) → unchanged ───────────────────
  return url;
}

/**
 * Convenience wrappers for each size.
 */
export const thumbSm = (src) => thumbUrl(src, 'sm');  //  80px
export const thumbMd = (src) => thumbUrl(src, 'md');  // 200px
export const thumbLg = (src) => thumbUrl(src, 'lg');  // 400px
