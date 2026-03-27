/**
 * src/lib/middleware/withAffiliateAuth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Middleware for affiliate-protected API routes.
 * Reads Authorization: Bearer <token> from request headers.
 * Token payload: { affiliateId, username, type: 'affiliate' }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { verifyToken } from '../services/authService.js';

export function withAffiliateAuth(handler) {
  return async function (req, context) {
    try {
      const authHeader = req.headers.get('authorization') || '';
      const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

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
