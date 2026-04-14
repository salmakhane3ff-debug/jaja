/**
 * POST /api/login
 * ─────────────────────────────────────────────────────────────────────────────
 * Authenticates an admin user with bcrypt + JWT.
 *
 * Security improvements over the legacy implementation:
 *   ✅ Passwords hashed with bcrypt (SALT_ROUNDS = 12)
 *   ✅ Legacy plaintext passwords are upgraded on successful login
 *   ✅ Auth token is a signed JWT (not a random string)
 *   ✅ JWT payload: { userId, email, role } — compatible with /api/auth/verify
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { loginHandler } from '@/lib/controllers/authController';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(req) {
  const limited = rateLimit(req, 'login', { max: 10, windowMs: 60_000 });
  if (limited) return limited;
  return loginHandler(req);
}
