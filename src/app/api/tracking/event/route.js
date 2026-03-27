/**
 * POST /api/tracking/event
 * ─────────────────────────────────────────────────────────────────────────────
 * Records a funnel event. Fire-and-forget from the frontend — always returns ok.
 *
 * Body: {
 *   eventType   : "landing_view" | "product_click" | "add_to_cart"
 *               | "checkout_start" | "payment_selected" | "conversion"
 *   clickId?    : string   — last_click_id from cookie/localStorage
 *   sessionId?  : string   — browser session ID
 *   productId?  : string   — product ID (for product_click / add_to_cart)
 *   orderId?    : string   — order ID (for conversion)
 *   metadata?   : object   — any extra key-value data
 * }
 *
 * Valid event types:
 *   landing_view       — user loaded the home / landing page
 *   product_click      — user clicked on a product
 *   add_to_cart        — user added a product to cart
 *   checkout_start     — user reached the checkout address step
 *   payment_selected   — user chose a payment method
 *   conversion         — order was confirmed (supplements /api/tracking/conversion)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from "@/lib/prisma";

const VALID_EVENTS = new Set([
  "landing_view",
  "product_click",
  "add_to_cart",
  "checkout_start",
  "payment_selected",
  "conversion",
]);

function extractIP(request) {
  return (
    request.headers.get("cf-connecting-ip")                       ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")                              ||
    "unknown"
  );
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { eventType, clickId, sessionId, productId, orderId, metadata } = body;

    if (!eventType || !VALID_EVENTS.has(eventType)) {
      return Response.json({ ok: false, error: `Invalid eventType. Valid: ${[...VALID_EVENTS].join(", ")}` }, { status: 400 });
    }

    const ip        = extractIP(request);
    const userAgent = request.headers.get("user-agent") || null;

    await prisma.funnelEvent.create({
      data: {
        eventType,
        clickId:   clickId   || null,
        sessionId: sessionId || null,
        productId: productId || null,
        orderId:   orderId   || null,
        metadata:  metadata  || null,
        ip,
        userAgent,
      },
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[tracking/event]", err?.message ?? err);
    return Response.json({ ok: true }); // non-critical, never block UI
  }
}

// ── GET /api/tracking/event?type=&since= ─────────────────────────────────────
// Simple analytics query for the admin dashboard
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const days    = parseInt(searchParams.get("days") || "30", 10);
    const since   = new Date(Date.now() - days * 864e5);

    const events  = await prisma.funnelEvent.findMany({
      where:   { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take:    5000,
    });

    // ── Count by type ──────────────────────────────────────────────────────
    const byType = {};
    for (const e of events) {
      byType[e.eventType] = (byType[e.eventType] || 0) + 1;
    }

    // ── Funnel steps ──────────────────────────────────────────────────────
    const funnel = [
      "landing_view", "product_click", "add_to_cart",
      "checkout_start", "payment_selected", "conversion",
    ].map((type) => ({ step: type, count: byType[type] || 0 }));

    // ── Drop-off rates ─────────────────────────────────────────────────────
    const funnelWithDrop = funnel.map((row, i) => ({
      ...row,
      dropOff: i === 0 ? null
        : funnel[0].count > 0
          ? Math.round((1 - row.count / funnel[0].count) * 100)
          : null,
    }));

    return Response.json({ ok: true, byType, funnel: funnelWithDrop, total: events.length });
  } catch (err) {
    console.error("[tracking/event GET]", err?.message ?? err);
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
