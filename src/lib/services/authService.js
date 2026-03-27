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
import prisma    from '../prisma.js';

const JWT_SECRET  = process.env.JWT_SECRET || 'change-this-to-a-long-random-secret';
const SALT_ROUNDS = 12;

// ── Default admin seeded on first login attempt ───────────────────────────────
const DEFAULT_ADMIN = {
  email:    'admin@gmail.com',
  password: '123456',
  name:     'Admin',
  role:     'ADMIN',
};

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
  // Legacy plaintext check — allows a one-time migration on next login
  if (!stored.startsWith('$2')) {
    return plain === stored;
  }
  return bcrypt.compare(plain, stored);
}

// ── JWT helpers ───────────────────────────────────────────────────────────────

/** Sign a JWT valid for 7 days. */
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Verify a JWT and return the decoded payload.
 * Throws if invalid or expired.
 */
export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// ── Admin user helpers ────────────────────────────────────────────────────────

/** Return the first ADMIN user, or seed the default one if none exists. */
export async function getOrCreateAdmin() {
  let admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
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
