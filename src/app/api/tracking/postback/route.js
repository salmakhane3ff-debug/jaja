/**
 * GET /api/tracking/postback?click_id=XXX&sum=99.99&type=main
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-to-server postback endpoint (Voluum / RedTrack / DaoPush style).
 *
 * Query params:
 *   click_id  — required, must match an existing ClickEvent.clickId
 *   sum       — conversion revenue amount (float), default 0
 *   type      — "main" | "dep" | "custom", default "main"
 *   order_id  — optional order ID to associate
 *
 * Deduplication:
 *   DB-level @@unique([clickId, type]) prevents double recording.
 *   On duplicate → returns { status: "duplicate" }
 *   Always responds HTTP 200 so tracking platforms don't retry.
 *
 * Profit calculation:
 *   revenue = sum from postback
 *   cost    = click.cpc (stored when click was recorded)
 *   profit  = revenue - cost
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from "@/lib/prisma";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const clickId = searchParams.get("click_id");
    const sum     = parseFloat(searchParams.get("sum") || "0") || 0;
    const type    = searchParams.get("type") || "main";
    const orderId = searchParams.get("order_id") || null;

    if (!clickId) {
      return Response.json({ ok: false, error: "click_id required" }, { status: 400 });
    }

    // Verify the click exists and get CPC for cost calculation
    const click = await prisma.clickEvent.findUnique({
      where:  { clickId },
      select: { id: true, cpc: true },
    });
    if (!click) {
      return Response.json({ ok: false, error: "click not found" }, { status: 404 });
    }

    const cost  = click.cpc ?? 0;
    const prof  = Math.max(0, sum - cost);

    try {
      await prisma.conversionEvent.create({
        data: {
          clickId,
          orderId,
          amount:  sum,
          revenue: sum,
          cost,
          profit:  prof,
          type,
        },
      });
    } catch (e) {
      if (e?.code === "P2002") {
        // Unique constraint violation — already recorded
        return Response.json({ ok: true, status: "duplicate" });
      }
      throw e;
    }

    return Response.json({ ok: true, status: "recorded", revenue: sum, cost, profit: prof });
  } catch (err) {
    console.error("[tracking/postback]", err?.message ?? err);
    return Response.json({ ok: true }); // always 200 for tracker platforms
  }
}
