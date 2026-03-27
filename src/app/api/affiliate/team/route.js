/**
 * GET /api/affiliate/team  → team members (affiliates with parentId = me)
 */

import { withAffiliateAuth }    from '@/lib/middleware/withAffiliateAuth';
import { getAffiliateTeam }     from '@/lib/services/affiliateSystemService';

async function getHandler(req, _ctx, decoded) {
  try {
    const team = await getAffiliateTeam(decoded.affiliateId);
    return Response.json(team);
  } catch (err) {
    console.error('Affiliate team GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export const GET = withAffiliateAuth(getHandler);
