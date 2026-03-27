/**
 * src/lib/controllers/orderController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin controller layer for order API routes.
 * Delegates all business logic to orderService.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getAllOrders,
  searchOrders,
  createOrder,
  updateOrder,
  deleteOrder,
} from '../services/orderService.js';
import { badRequest, notFound, serverError } from '../utils/apiResponse.js';

// ── GET /api/order ────────────────────────────────────────────────────────────

export async function getOrdersHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');
    const phone   = searchParams.get('phone');
    const email   = searchParams.get('email');

    // If any search param is provided → search
    if (orderId || phone || email) {
      const orders = await searchOrders({ orderId, phone, email });
      return Response.json(orders);
    }

    const orders = await getAllOrders();
    return Response.json(orders);
  } catch (err) {
    console.error('Order GET error:', err);
    return serverError('Failed to fetch orders');
  }
}

// ── POST /api/order ───────────────────────────────────────────────────────────

export async function createOrderHandler(req) {
  try {
    const body = await req.json();
    const { duplicate, order } = await createOrder(body);

    // Both callers (address/page.jsx and orderCreate.jsx) do:
    //   const data = await res.json(); → data._id
    // So always return the order object directly.
    // HTTP 200 = already existed (dedup), 201 = freshly created.
    return Response.json(order, { status: duplicate ? 200 : 201 });
  } catch (err) {
    console.error('Order POST error:', err);
    return serverError('Failed to create order');
  }
}

// ── PUT /api/order ────────────────────────────────────────────────────────────

export async function updateOrderHandler(req) {
  try {
    const body = await req.json();
    const { _id, id } = body;
    const orderId = _id || id;

    if (!orderId) return badRequest('_id is required');

    const order = await updateOrder(orderId, body);
    if (!order) return notFound('Order not found');

    return Response.json(order);
  } catch (err) {
    console.error('Order PUT error:', err);
    return serverError('Failed to update order');
  }
}

// ── DELETE /api/order ─────────────────────────────────────────────────────────

export async function deleteOrderHandler(req) {
  try {
    const body = await req.json();
    const { _id, id } = body;
    const orderId = _id || id;

    if (!orderId) return badRequest('_id is required');

    const deleted = await deleteOrder(orderId);
    if (!deleted) return notFound('Order not found');

    return Response.json({ message: 'Order deleted', _id: orderId });
  } catch (err) {
    console.error('Order DELETE error:', err);
    return serverError('Failed to delete order');
  }
}
