/**
 * src/lib/middleware/withAdminAuth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Like `withAuth` but additionally enforces that the authenticated user
 * has role === 'ADMIN'.
 *
 * Usage:
 *   export const GET = withAdminAuth(async (req, context, user) => { … });
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { verifyToken } from '../services/authService.js';

export function withAdminAuth(handler) {
  return async function (req, context) {
    try {
      const token = req.cookies?.get?.('auth_token')?.value
        || parseCookieHeader(req.headers.get?.('cookie') || '', 'auth_token');

      if (!token) {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
      }

      const user = verifyToken(token);

      if (user.role !== 'ADMIN') {
        return Response.json({ error: 'Admin access required' }, { status: 403 });
      }

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
