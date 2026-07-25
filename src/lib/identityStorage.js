/**
 * src/lib/identityStorage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIVATE storage for affiliate identity documents (CIN recto/verso).
 *
 * WHY LOCAL-PRIVATE: the project's media facade (Cloudinary / R2 / public
 * uploads) is all PUBLIC-URL based — anything stored there is world-readable.
 * Identity documents must never be public, so they are written OUTSIDE the web
 * root, in `<cwd>/private_uploads/identity/`, which no route serves statically.
 * They are streamed ONLY through an admin-authenticated API route, keyed by an
 * unguessable filename that is stored on the row (never exposed to affiliates).
 *
 * HARDENING:
 *   • Every upload is re-encoded through sharp to a normalized JPEG — this strips
 *     metadata/EXIF and makes it impossible to store a polyglot/executable
 *     (a non-image simply fails to decode → rejected).
 *   • Filenames are crypto-random (never derived from client input).
 *   • readCinByKey resolves inside the identity dir and rejects any traversal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export const CIN_ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const CIN_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per image
export const CIN_MAX_DIM = 2000;               // downscale huge scans; keeps docs legible
const IDENTITY_DIR = path.join(process.cwd(), 'private_uploads', 'identity');

export function isAcceptedCinType(mime) {
  return CIN_ACCEPTED_TYPES.includes(String(mime || '').toLowerCase());
}

/**
 * Validate ONE uploaded CIN image (backend-authoritative — never trust the UI).
 * @returns {string[]} problems: [] = ok, ['type'] and/or ['size']
 */
export function validateCinUpload({ mime, size } = {}) {
  const errors = [];
  if (!isAcceptedCinType(mime)) errors.push('type');
  if (!Number.isFinite(size) || size <= 0 || size > CIN_MAX_BYTES) errors.push('size');
  return errors;
}

/** Resolve a stored key to an absolute path INSIDE the identity dir (or null). */
export function resolveCinPath(key) {
  if (!key || typeof key !== 'string') return null;
  // Reject anything that isn't a bare safe filename.
  if (!/^[A-Za-z0-9._-]+$/.test(key)) return null;
  const abs = path.resolve(IDENTITY_DIR, key);
  const root = path.resolve(IDENTITY_DIR);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null; // traversal guard
  return abs;
}

/**
 * Normalize + store one CIN image privately. Returns the opaque storage key.
 * Throws (code CIN_INVALID_IMAGE) if the buffer is not a decodable image.
 */
export async function processAndStoreCin(buffer) {
  let out;
  try {
    out = await sharp(buffer)
      .rotate() // honour EXIF orientation, then drop metadata
      .resize(CIN_MAX_DIM, CIN_MAX_DIM, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw Object.assign(new Error('Fichier image invalide'), { code: 'CIN_INVALID_IMAGE' });
  }
  if (!existsSync(IDENTITY_DIR)) await mkdir(IDENTITY_DIR, { recursive: true });
  const key = `${randomUUID()}.jpg`;
  await writeFile(path.join(IDENTITY_DIR, key), out);
  return key;
}

/** Read a stored CIN by key (admin-only callers). Returns null if missing. */
export async function readCinByKey(key) {
  const abs = resolveCinPath(key);
  if (!abs || !existsSync(abs)) return null;
  const buffer = await readFile(abs);
  return { buffer, contentType: 'image/jpeg' };
}

/** Best-effort delete (used when a CIN is replaced on resubmission). */
export async function deleteCinByKey(key) {
  const abs = resolveCinPath(key);
  if (!abs || !existsSync(abs)) return false;
  try { await unlink(abs); return true; } catch { return false; }
}
