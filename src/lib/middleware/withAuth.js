/**
 * src/lib/middleware/withAuth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Higher-order function (HOF) that wraps a Next.js API route handler and
 * verifies the `auth_token` cookie using JWT before calling the handler.
 *
 * Usage:
 *   export const GET = withAuth(async (req, context, user) => { … });
 *
 * The decoded token payload is passed as the third argument so handlers can
 * access `user.userId`, `user.email`, `user.role` without re-verifying.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { verifyToken } from '../services/authService.js';

export function withAuth(handler) {
  return async function (req, context) {
    try {
      const token = req.cookies?.get?.('auth_token')?.value
        // Fallback: parse cookie header manually (for edge cases)
        || parseCookieHeader(req.headers.get?.('cookie') || '', 'auth_token');

      if (!token) {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
      }

      const user = verifyToken(token); // throws on invalid / expired
      return handler(req, context, user);
    } catch (err) {
      return Response.json({ error: 'Invalid or expired token' }, { status: 401 });
    }
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function parseCookieHeader(cookieStr, name) {
  const match = cookieStr.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
