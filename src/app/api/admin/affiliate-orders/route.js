/**
 * /api/admin/affiliate-orders
 * GET  → all affiliate orders (with affiliate info)
 * PUT  → update order status
 */

import {
  adminGetAllAffiliateOrders,
  adminUpdateAffiliateOrderStatus,
} from '@/lib/services/affiliateSystemService';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

async function getHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const orders = await adminGetAllAffiliateOrders();
    const filtered = status ? orders.filter((o) => o.status === status) : orders;
    return Response.json(filtered);
  } catch (err) {
    console.error('Admin affiliate-orders GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

async function putHandler(req) {
  try {
    const { id, _id, status } = await req.json();
    const orderId = id || _id;

    if (!orderId || !status) {
      return Response.json({ error: 'id et status requis' }, { status: 400 });
    }

    const order = await adminUpdateAffiliateOrderStatus(orderId, status);
    return Response.json(order);
  } catch (err) {
    console.error('Admin affiliate-orders PUT error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export const GET = withAdminAuth(getHandler);
export const PUT = withAdminAuth(putHandler);
