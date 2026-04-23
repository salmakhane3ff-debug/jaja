/**
 * GET /api/order/status?orderId=...
 * ─────────────────────────────────────────────────────────────────────────────
 * Public (no admin auth) — lets the success page poll for live order status.
 * Returns only the fields needed for the success page UI. Sensitive internal
 * fields (affiliateId, sessionId, IP, etc.) are never included.
 *
 * Security:
 *   - orderId is a UUID known only to the customer (from their URL / session).
 *   - Rate-limited to 60 req/min per IP.
 *   - Only "safe" fields are returned (no internal DB metadata).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

// Fields we expose publicly (everything else stays server-side)
const PUBLIC_SELECT = {
  id:            true,
  status:        true,
  paymentStatus: true,
  name:          true,
  phone:         true,
  email:         true,
  createdAt:     true,
  shipping:      true,
  products:      true,
  paymentDetails: true,
};

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
    // Match by UUID (id) or by sessionId — same lookup strategy as /api/order/receipt
    const order = await prisma.order.findFirst({
      where: { OR: [{ id: orderId }, { sessionId: orderId }] },
      select: PUBLIC_SELECT,
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Return with _id alias for frontend compatibility
    return NextResponse.json({ ...order, _id: order.id });
  } catch (err) {
    console.error("GET /api/order/status error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
