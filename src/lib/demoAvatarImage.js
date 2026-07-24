/**
 * src/lib/demoAvatarImage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Demo avatar image processing (admin upload). Pure image transform — no DB, no
 * storage — so it is unit-testable. Every accepted image is normalised to:
 *   • square centre crop (fit: cover)
 *   • resized to 256×256
 *   • converted to WebP, quality 80, compressed
 * Only JPG / PNG / WEBP inputs are accepted.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import sharp from 'sharp';

export const DEMO_AVATAR_SIZE = 256;
export const DEMO_AVATAR_QUALITY = 80;
export const DEMO_AVATAR_MAX_PER_UPLOAD = 20;
export const DEMO_AVATAR_FOLDER = 'demo/avatars';
export const DEMO_AVATAR_GENDERS = Object.freeze(['men', 'women']);

const ACCEPTED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

/** True for an accepted upload MIME type. */
export function isAcceptedAvatarType(mime) {
  return ACCEPTED.has(String(mime || '').toLowerCase());
}

/**
 * Crop-square → 256×256 → WebP q80. Returns a Buffer, or throws a coded error for
 * an undecodable / non-image buffer.
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
export async function processDemoAvatar(buffer) {
  if (!buffer || !buffer.length) {
    throw Object.assign(new Error('empty image'), { code: 'DEMO_AVATAR_EMPTY' });
  }
  try {
    return await sharp(buffer)
      .rotate()                                  // honour EXIF orientation
      .resize(DEMO_AVATAR_SIZE, DEMO_AVATAR_SIZE, { fit: 'cover', position: 'attention' })
      .webp({ quality: DEMO_AVATAR_QUALITY })
      .toBuffer();
  } catch (err) {
    throw Object.assign(new Error('unreadable image'), { code: 'DEMO_AVATAR_INVALID', cause: err });
  }
}
