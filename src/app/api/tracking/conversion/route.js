/**
 * POST /api/tracking/conversion
 * ─────────────────────────────────────────────────────────────────────────────
 * Internal endpoint called fire-and-forget from the checkout pages when an
 * order is placed.
 *
 * Attribution: uses `last_click_id` (last-click attribution model).
 *              Falls back to `click_id` if `last_click_id` is not provided.
 *
 * Body: { clickId, orderId?, revenue? }
 *   clickId — the last_click_id resolved on the client side
 *   revenue — order total (for profit calculation)
 *   orderId — optional order ID to associate
 *
 * Profit calculation:
 *   revenue = order total
 *   cost    = click.cpc (CPC paid when click was recorded)
 *   profit  = revenue - cost
 *
 * Deduplication: DB-level @@unique([clickId, type]) prevents double-counting.
 * Always returns { ok: true } — never blocks checkout flow.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from "@/lib/prisma";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { clickId, orderId, revenue, amount } = body;

    if (!clickId || typeof clickId !== "string") {
      return Response.json({ ok: false, error: "clickId required" }, { status: 400 });
    }

    // Look up the click to get CPC for cost calculation
    const click = await prisma.clickEvent.findUnique({
      where:  { clickId },
      select: { cpc: true, cpm: true, isSuspicious: true },
    });

    // Don't record conversions for suspicious clicks
    if (click?.isSuspicious) {
      return Response.json({ ok: true, skipped: "suspicious" });
    }

    const rev  = parseFloat(revenue ?? amount) || 0;
    const cost = click?.cpc ?? 0;
    const prof = Math.max(0, rev - cost);

    try {
      await prisma.conversionEvent.create({
        data: {
          clickId,
          orderId: orderId || null,
          amount:  rev,
          revenue: rev,
          cost,
          profit:  prof,
          type:    "main",
        },
      });
    } catch (e) {
      // P2002 = unique constraint violation (duplicate conversion)
      if (e?.code === "P2002") {
        return Response.json({ ok: true, status: "duplicate" });
      }
      throw e;
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[tracking/conversion]", err?.message ?? err);
    return Response.json({ ok: true }); // non-critical, always succeed
  }
}
