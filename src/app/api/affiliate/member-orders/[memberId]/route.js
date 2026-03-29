/**
 * GET /api/affiliate/member-orders/:memberId
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns all orders for a direct team member, lazy-loaded on dashboard click.
 *
 * Security: memberId must be a direct child of the requesting affiliate.
 * Capped at 100 most-recent orders (service level).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { withAffiliateAuth } from '@/lib/middleware/withAffiliateAuth';
import prisma                from '@/lib/prisma';
import { getMemberOrders }   from '@/lib/services/affiliateSystemService';

async function getHandler(req, ctx, decoded) {
  try {
    const { memberId } = await ctx.params;

    // Ownership check — memberId must be a direct child of requesting affiliate
    const belongs = await prisma.affiliate.findFirst({
      where:  { id: memberId, parentId: decoded.affiliateId },
      select: { id: true },
    });
    if (!belongs) {
      return Response.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const orders = await getMemberOrders(memberId);
    return Response.json(orders);
  } catch (err) {
    console.error('member-orders GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export const GET = withAffiliateAuth(getHandler);
