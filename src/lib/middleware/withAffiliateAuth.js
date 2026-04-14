/**
 * src/lib/middleware/withAffiliateAuth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Middleware for affiliate-protected API routes.
 *
 * Token resolution order (most secure first):
 *   1. HttpOnly cookie: `affiliate_token`  ← preferred (XSS-resistant)
 *   2. Authorization: Bearer <token>       ← backward-compat for existing frontend
 *
 * Token payload must contain: { affiliateId, username, type: 'affiliate' }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { verifyToken } from '../services/authService.js';

export function withAffiliateAuth(handler) {
  return async function (req, context) {
    try {
      // 1. Prefer HttpOnly cookie (set by /api/affiliate/auth)
      const cookieToken = parseCookieHeader(
        req.headers.get?.('cookie') || '',
        'affiliate_token',
      );

      // 2. Fall back to Authorization: Bearer header (legacy frontend support)
      const authHeader  = req.headers.get('authorization') || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

      const token = cookieToken || bearerToken;

      if (!token) {
        return Response.json({ error: 'Token requis' }, { status: 401 });
      }

      const decoded = verifyToken(token);

      if (decoded.type !== 'affiliate' || !decoded.affiliateId) {
        return Response.json({ error: 'Token invalide' }, { status: 401 });
      }

      return handler(req, context, decoded);
    } catch {
      return Response.json({ error: 'Token expiré ou invalide' }, { status: 401 });
    }
  };
}

function parseCookieHeader(cookieStr, name) {
  if (!cookieStr) return null;
  const match = cookieStr.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
