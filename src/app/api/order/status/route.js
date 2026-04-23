/**
 * GET /api/order/status?orderId=...
 * ─────────────────────────────────────────────────────────────────────────────
 * Public (no admin auth) — lets the success page poll for live order status.
 *
 * Security:
 *   - orderId is a UUID known only to the customer (from their URL / session).
 *   - Rate-limited to 60 req/min per IP.
 *   - Only safe fields are returned (no affiliateId, sessionId, userId, etc.)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

export async function GET(req) {
  // Rate-limit: 60 polls/min per IP
  const limited = rateLimit(req, "order_status", { max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId")?.trim();

  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }

  try {
    // Include items + productSnapshot so we can rebuild products.items for the frontend
    const order = await prisma.order.findFirst({
      where: { OR: [{ id: orderId }, { sessionId: orderId }] },
      select: {
        id:             true,
        status:         true,
        paymentStatus:  true,
        customerName:   true,
        customerPhone:  true,
        customerEmail:  true,
        shippingAddress: true,
        paymentDetails: true,
        createdAt:      true,
        // items relation — productSnapshot contains title, images, variants, etc.
        items: {
          select: {
            id:              true,
            productId:       true,
            quantity:        true,
            price:           true,
            regularPrice:    true,
            productSnapshot: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // ── Map to the shape the success page expects (mirrors mapOrder in mappers.js) ──
    const payDetails = (order.paymentDetails && typeof order.paymentDetails === "object")
      ? order.paymentDetails
      : {};

    const publicOrder = {
      _id:    order.id,
      id:     order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      name:   order.customerName,
      phone:  order.customerPhone,
      email:  order.customerEmail,
      shipping:       order.shippingAddress || {},
      paymentDetails: {
        paymentMethod: payDetails.paymentMethod || null,
        paymentStatus: payDetails.paymentStatus || order.paymentStatus || null,
        ...payDetails,
      },
      createdAt: order.createdAt,
      // Rebuild products.items from OrderItem rows + productSnapshot
      products: {
        items: (order.items || []).map((item) => ({
          _id:      item.id,
          productId: item.productId,
          quantity:  item.quantity,
          price:     item.price,
          regularPrice: item.regularPrice,
          // productSnapshot spreads title, images, variants, isFreeGift, etc.
          ...(item.productSnapshot && typeof item.productSnapshot === "object"
            ? item.productSnapshot
            : {}),
        })),
      },
    };

    return NextResponse.json(publicOrder);
  } catch (err) {
    console.error("GET /api/order/status error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
