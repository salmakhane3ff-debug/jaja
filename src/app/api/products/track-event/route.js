/**
 * POST /api/products/track-event
 * ─────────────────────────────────────────────────────────────────────────────
 * Fire-and-forget analytics endpoint for sticky bar engagement events.
 *
 * Body: { productId: string, event: "sticky_impression" | "sticky_click_add" | "sticky_click_buy_now" }
 *
 * Maps each event to its dedicated counter in ProductAnalytics:
 *   sticky_impression    → stickyImpressions
 *   sticky_click_add     → stickyAddClicks
 *   sticky_click_buy_now → stickyBuyClicks
 *
 * Always returns { ok: true } — never blocks the client.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from "@/lib/prisma";

const EVENT_MAP = {
  sticky_impression:    { stickyImpressions: { increment: 1 } },
  sticky_click_add:     { stickyAddClicks:   { increment: 1 } },
  sticky_click_buy_now: { stickyBuyClicks:   { increment: 1 } },
};

export async function POST(request) {
  try {
    const { productId, event } = await request.json().catch(() => ({}));

    if (!productId || typeof productId !== "string") {
      return Response.json({ ok: false, error: "productId required" }, { status: 400 });
    }

    const updateData = EVENT_MAP[event];
    if (!updateData) {
      return Response.json({ ok: false, error: "unknown event" }, { status: 400 });
    }

    await prisma.productAnalytics.upsert({
      where:  { productId },
      create: { productId, ...Object.fromEntries(Object.keys(updateData).map((k) => [k, 1])) },
      update: updateData,
    });

    return Response.json({ ok: true });
  } catch (err) {
    // Tracking is non-critical — swallow all errors silently
    console.error("[track-event]", err?.message ?? err);
    return Response.json({ ok: true }); // still 200 so client never retries
  }
}
