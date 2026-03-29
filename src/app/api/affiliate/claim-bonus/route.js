/**
 * POST /api/affiliate/claim-bonus
 * Claims the team bonus when validReferrals >= requiredActiveAffiliates.
 */

import { withAffiliateAuth } from '@/lib/middleware/withAffiliateAuth';
import { claimTeamBonus }    from '@/lib/services/affiliateSystemService';

async function postHandler(req, _ctx, decoded) {
  try {
    const result = await claimTeamBonus(decoded.affiliateId);
    return Response.json(result);
  } catch (err) {
    const status = err.code === 'ALREADY_CLAIMED' ? 409
                 : err.code === 'GOAL_NOT_MET'    ? 403
                 : err.code === 'NOT_FOUND'        ? 404
                 : 500;
    return Response.json({ error: err.message }, { status });
  }
}

export const POST = withAffiliateAuth(postHandler);
