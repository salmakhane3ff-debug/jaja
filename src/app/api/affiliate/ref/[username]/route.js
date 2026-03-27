/**
 * GET /api/affiliate/ref/[username]
 * Public — validates a referral username.
 * Returns { affiliateId, username, name } or 404.
 * Called on ?ref= landing to save affiliateRef to localStorage/cookie.
 */

import { validateAffiliateRef } from '@/lib/services/affiliateSystemService';

export async function GET(req, { params }) {
  try {
    const { username } = await params;

    if (!username?.trim()) {
      return Response.json({ error: 'username requis' }, { status: 400 });
    }

    const result = await validateAffiliateRef(username);
    if (!result) {
      return Response.json({ error: 'Affilié introuvable' }, { status: 404 });
    }

    return Response.json(result);
  } catch (err) {
    console.error('Affiliate ref GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
