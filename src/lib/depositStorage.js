/**
 * src/lib/depositStorage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIVATE storage for security-deposit transfer proofs — same architecture as
 * identity documents (private_uploads outside the web root, streamed only via
 * authorized routes), extended to also accept PDF.
 *
 * HARDENING:
 *   • MIME + MAGIC-BYTE verification (a lie in the Content-Type is caught).
 *   • Images are re-encoded through sharp → normalized JPEG (strips metadata,
 *     makes a polyglot/executable impossible). PDFs are validated by the %PDF-
 *     signature and stored as-is (they cannot be re-encoded).
 *   • Crypto-random filenames (never from client input); traversal-safe reads;
 *     stored OUTSIDE public/ so no /uploads/... URL can ever reach them.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export const DEPOSIT_ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
export const DEPOSIT_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const DEPOSIT_DIR = path.join(process.cwd(), 'private_uploads', 'deposits');

export function isAcceptedDepositType(mime) {
  return DEPOSIT_ACCEPTED_TYPES.includes(String(mime || '').toLowerCase());
}

/** Validate declared type + size (backend-authoritative). */
export function validateDepositUpload({ mime, size } = {}) {
  const errors = [];
  if (!isAcceptedDepositType(mime)) errors.push('type');
  if (!Number.isFinite(size) || size <= 0 || size > DEPOSIT_MAX_BYTES) errors.push('size');
  return errors;
}

/** Sniff the real kind from magic bytes: 'jpeg' | 'png' | 'webp' | 'pdf' | null. */
export function sniffKind(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer.slice(0, 4).toString('latin1') === 'RIFF' && buffer.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buffer.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  return null;
}

/** Resolve a stored key to an absolute path INSIDE the deposits dir (or null). */
export function resolveDepositPath(key) {
  if (!key || typeof key !== 'string') return null;
  if (!/^[A-Za-z0-9._-]+$/.test(key)) return null;
  const abs = path.resolve(DEPOSIT_DIR, key);
  const root = path.resolve(DEPOSIT_DIR);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

/**
 * Normalize (images) or validate (PDF) + store privately. Returns the opaque key.
 * Throws (code DEPOSIT_INVALID_FILE) if the bytes are not a real accepted file.
 */
export async function processAndStoreDeposit(buffer) {
  const kind = sniffKind(buffer);
  if (!kind) throw Object.assign(new Error('Fichier non supporté ou corrompu'), { code: 'DEPOSIT_INVALID_FILE' });

  if (!existsSync(DEPOSIT_DIR)) await mkdir(DEPOSIT_DIR, { recursive: true });

  if (kind === 'pdf') {
    const key = `${randomUUID()}.pdf`;
    await writeFile(path.join(DEPOSIT_DIR, key), buffer);
    return key;
  }
  // Image → re-encode to a normalized JPEG (strips metadata, guarantees an image).
  let out;
  try {
    out = await sharp(buffer).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } catch {
    throw Object.assign(new Error('Image invalide'), { code: 'DEPOSIT_INVALID_FILE' });
  }
  const key = `${randomUUID()}.jpg`;
  await writeFile(path.join(DEPOSIT_DIR, key), out);
  return key;
}

/** Content-Type for a stored key (only jpg/pdf are ever produced). */
export function contentTypeForKey(key) {
  return String(key).toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
}

/** Read a stored proof by key (authorized callers only). Returns null if missing. */
export async function readDepositByKey(key) {
  const abs = resolveDepositPath(key);
  if (!abs || !existsSync(abs)) return null;
  const buffer = await readFile(abs);
  return { buffer, contentType: contentTypeForKey(key) };
}

export async function deleteDepositByKey(key) {
  const abs = resolveDepositPath(key);
  if (!abs || !existsSync(abs)) return false;
  try { await unlink(abs); return true; } catch { return false; }
}
