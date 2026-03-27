/**
 * POST /api/affiliate/auth
 * Affiliate login — username + password.
 * Returns: { token, affiliate }
 */

import { loginAffiliate } from '@/lib/services/affiliateSystemService';

export async function POST(req) {
  try {
    const { username, password } = await req.json();

    if (!username?.trim() || !password) {
      return Response.json({ error: 'Identifiant et mot de passe requis' }, { status: 400 });
    }

    const result = await loginAffiliate(username, password);
    return Response.json(result);
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS' || err.code === 'INACTIVE') {
      return Response.json({ error: err.message }, { status: 401 });
    }
    console.error('Affiliate auth error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
