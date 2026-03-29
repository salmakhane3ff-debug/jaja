/**
 * GET /api/affiliate/sub-team/:memberId
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns the direct children of `memberId` — but only if that member is a
 * direct child of the requesting affiliate (ownership check, no recursion).
 *
 * Used by the dashboard "expandable sub-team" panel (lazy-loaded on click).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { withAffiliateAuth }  from '@/lib/middleware/withAffiliateAuth';
import prisma                 from '@/lib/prisma';
import { getSubTeamMembers }  from '@/lib/services/affiliateSystemService';

async function getHandler(req, ctx, decoded) {
  try {
    const { memberId } = await ctx.params;

    // Security: memberId must be a direct child of the requesting affiliate
    const belongs = await prisma.affiliate.findFirst({
      where:  { id: memberId, parentId: decoded.affiliateId },
      select: { id: true },
    });
    if (!belongs) {
      return Response.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const members = await getSubTeamMembers(memberId);
    return Response.json(members);
  } catch (err) {
    console.error('sub-team GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export const GET = withAffiliateAuth(getHandler);
