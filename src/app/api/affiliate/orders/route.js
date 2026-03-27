/**
 * GET  /api/affiliate/orders          → affiliate's order list
 * PUT  /api/affiliate/orders          → update order status (confirmed|cancelled)
 */

import { withAffiliateAuth }                    from '@/lib/middleware/withAffiliateAuth';
import {
  getAffiliateOrders,
  updateAffiliateOrderStatus,
} from '@/lib/services/affiliateSystemService';

async function getHandler(req, _ctx, decoded) {
  try {
    const orders = await getAffiliateOrders(decoded.affiliateId);
    return Response.json(orders);
  } catch (err) {
    console.error('Affiliate orders GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

async function putHandler(req, _ctx, decoded) {
  try {
    const { id, status } = await req.json();

    if (!id) return Response.json({ error: 'id requis' }, { status: 400 });

    // Affiliate can only mark confirmed or cancelled
    const allowed = ['confirmed', 'cancelled'];
    if (!allowed.includes(status)) {
      return Response.json({ error: 'Statut non autorisé' }, { status: 400 });
    }

    const order = await updateAffiliateOrderStatus(id, status);
    return Response.json(order);
  } catch (err) {
    console.error('Affiliate orders PUT error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export const GET = withAffiliateAuth(getHandler);
export const PUT = withAffiliateAuth(putHandler);
