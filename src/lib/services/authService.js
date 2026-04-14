/**
 * src/lib/services/authService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Authentication helpers:
 *   - bcrypt password hashing / comparison
 *   - JWT sign / verify  (jsonwebtoken — Node.js runtime only)
 *   - Admin user bootstrapping
 *
 * Token payload shape: { userId, email, role }
 * This matches the existing /api/auth/verify route so nothing breaks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import bcrypt    from 'bcryptjs';
import jwt       from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';
import prisma    from '../prisma.js';

const SALT_ROUNDS = 12;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('[authService] JWT_SECRET environment variable is required but not set.');
  return secret;
}

// DEFAULT_ADMIN is evaluated lazily at request time (not module load time)
// so that Next.js build-time page-data collection does not fail when
// ADMIN_EMAIL / ADMIN_PASSWORD are absent from the build environment.
function getDefaultAdmin() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      throw new Error('[authService] ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required in production.');
    }
  }
  return {
    email:    process.env.ADMIN_EMAIL    || 'admin@localhost',
    password: process.env.ADMIN_PASSWORD || 'change-me-now',
    name:     'Admin',
    role:     'ADMIN',
  };
}

// ── Password helpers ──────────────────────────────────────────────────────────

/** Hash a plaintext password with bcrypt. */
export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a stored hash.
 * Gracefully handles legacy plaintext passwords (no "$2" prefix) that
 * may exist in the database from the old insecure implementation.
 */
export async function comparePassword(plain, stored) {
  if (!stored) return false;
  // Legacy plaintext check — allows a one-time migration on next login.
  // Uses timingSafeEqual to prevent timing-based information leakage.
  if (!stored.startsWith('$2')) {
    try {
      const a = Buffer.from(plain,   'utf8');
      const b = Buffer.from(stored,  'utf8');
      // timingSafeEqual requires same-length buffers; pad to prevent length leak
      const len = Math.max(a.length, b.length);
      const pa  = Buffer.concat([a, Buffer.alloc(len - a.length)]);
      const pb  = Buffer.concat([b, Buffer.alloc(len - b.length)]);
      return a.length === b.length && timingSafeEqual(pa, pb);
    } catch {
      return false;
    }
  }
  return bcrypt.compare(plain, stored);
}

// ── JWT helpers ───────────────────────────────────────────────────────────────

/** Sign a JWT valid for 7 days using HS256 only. */
export function signToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256', expiresIn: '7d' });
}

/**
 * Verify a JWT and return the decoded payload.
 * Explicitly restricts accepted algorithms to HS256 — rejects alg:none and RS* tokens.
 * Throws if invalid, expired, or wrong algorithm.
 */
export function verifyToken(token) {
  return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
}

// ── Admin user helpers ────────────────────────────────────────────────────────

/** Return the first ADMIN user, or seed the default one if none exists. */
export async function getOrCreateAdmin() {
  let admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    const DEFAULT_ADMIN = getDefaultAdmin();
    const hashed = await hashPassword(DEFAULT_ADMIN.password);
    admin = await prisma.user.create({
      data: {
        email:    DEFAULT_ADMIN.email,
        password: hashed,
        name:     DEFAULT_ADMIN.name,
        role:     'ADMIN',
      },
    });
  }
  return admin;
}

/** Look up a user by e-mail. Returns null when not found. */
export async function findUserByEmail(email) {
  return prisma.user.findUnique({ where: { email } });
}

/**
 * Update a user record.
 * If `newPassword` is provided it is automatically hashed before saving.
 */
export async function updateUser(id, { newPassword, ...fields }) {
  const data = { ...fields };
  if (newPassword) {
    data.password = await hashPassword(newPassword);
  }
  return prisma.user.update({ where: { id }, data });
}
