/**
 * /api/order
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    ?orderId=&phone=&email=  → all orders (or search results)
 * POST   { ...orderFields }        → create order (sessionId dedup)
 * PUT    { _id, ...updateFields }  → update order by _id
 * DELETE { _id }                   → delete order by _id
 *
 * Response shape is identical to the original MongoDB implementation:
 *   { _id, name, email, phone, shipping, products.items[], paymentDetails,
 *     status, sessionId, utm_source, createdAt, updatedAt }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getOrdersHandler,
  createOrderHandler,
  updateOrderHandler,
  deleteOrderHandler,
} from '@/lib/controllers/orderController';

export const GET    = getOrdersHandler;
export const POST   = createOrderHandler;
export const PUT    = updateOrderHandler;
export const DELETE = deleteOrderHandler;
