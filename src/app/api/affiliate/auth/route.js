/**
 * POST /api/affiliate/auth
 * Affiliate login — username + password.
 *
 * Security:
 *   - Rate limited (10 req/min per IP)
 *   - Returns JWT in BOTH:
 *       1. HttpOnly Secure SameSite=Strict cookie (preferred — XSS-resistant)
 *       2. Response body token field (backward compat for existing frontend)
 *   - Frontend should migrate to cookie-only; localStorage storage is insecure
 */

import { loginAffiliate } from '@/lib/services/affiliateSystemService';
import { rateLimit }      from '@/lib/rateLimit';

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export async function POST(req) {
  const limited = rateLimit(req, 'affiliate-auth', { max: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const { username, password } = await req.json();

    if (!username?.trim() || !password) {
      return Response.json({ error: 'Identifiant et mot de passe requis' }, { status: 400 });
    }

    const result = await loginAffiliate(username, password);

    // Set HttpOnly cookie (XSS-proof) in addition to returning token in body
    const isProduction = process.env.NODE_ENV === 'production';
    const response = Response.json(result);
    response.headers.set(
      'Set-Cookie',
      `affiliate_token=${result.token}; HttpOnly; Path=/api/affiliate; Max-Age=${COOKIE_MAX_AGE}; SameSite=Strict${isProduction ? '; Secure' : ''}`,
    );

    return response;
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS' || err.code === 'INACTIVE') {
      return Response.json({ error: err.message }, { status: 401 });
    }
    console.error('Affiliate auth error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
