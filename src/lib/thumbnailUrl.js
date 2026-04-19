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
 * Falls back to the original URL if:
 *   - The URL is not a local /uploads/ path (e.g. Cloudinary, external)
 *   - The file is a video
 *   - Size is not recognised
 * ─────────────────────────────────────────────────────────────────────────────
 */

const VIDEO_EXT  = /\.(mp4|webm|mov|avi|mkv|ogv)(\?.*)?$/i;
// GIF and SVG must always use the original URL:
//  - GIF: animated frames are lost when converting to WebP (thumbnails skip GIFs)
//  - SVG: vector format, thumbnails are never generated for it
const SKIP_EXT   = /\.(gif|svg)(\?.*)?$/i;
const VALID_SIZE = new Set(['sm', 'md', 'lg']);

/**
 * Return the thumbnail URL for a given original image URL and desired size.
 *
 * @param {string | { url: string } | null | undefined} src
 * @param {'sm'|'md'|'lg'} size
 * @returns {string}  always returns a usable string URL
 */
export function thumbUrl(src, size = 'md') {
  // Normalise input — accept both string and {url:...} object
  const url = (typeof src === 'string' ? src : src?.url || src?.src) || '';

  // Fallback conditions
  if (!url)                    return '';
  if (!VALID_SIZE.has(size))   return url;
  if (VIDEO_EXT.test(url))     return url;   // videos — no thumbnail
  if (SKIP_EXT.test(url))      return url;   // GIF/SVG — keep original (animated / vector)
  if (!url.startsWith('/uploads/') && !url.includes('/uploads/')) return url;

  // Strip query string before manipulating
  const [base] = url.split('?');

  // Strip extension: "/uploads/1234-photo.jpg" → "/uploads/1234-photo"
  const noExt = base.replace(/\.[^.]+$/, '');

  return `${noExt}-${size}.webp`;
}

/**
 * Convenience wrappers for each size.
 */
export const thumbSm = (src) => thumbUrl(src, 'sm');  //  80px
export const thumbMd = (src) => thumbUrl(src, 'md');  // 200px
export const thumbLg = (src) => thumbUrl(src, 'lg');  // 400px
