/**
 * /api/order
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    ?orderId=&phone=&email=  → all orders (or search results)   [admin]
 * POST   { ...orderFields }        → create order (sessionId dedup)  [public]
 * PUT    { _id, ...updateFields }  → update order by _id             [admin]
 * DELETE { _id }                   → delete order by _id             [admin]
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getOrdersHandler,
  createOrderHandler,
  updateOrderHandler,
  deleteOrderHandler,
} from '@/lib/controllers/orderController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { rateLimit }     from '@/lib/rateLimit';

export const GET    = withAdminAuth(getOrdersHandler);
export const PUT    = withAdminAuth(updateOrderHandler);
export const DELETE = withAdminAuth(deleteOrderHandler);

// POST is public (checkout), but rate-limited to block order-spam
export async function POST(req) {
  const limited = rateLimit(req, 'order', { max: 20, windowMs: 60_000 });
  if (limited) return limited;
  return createOrderHandler(req);
}
