/**
 * GET /api/products/ui-hints?productId=<id>
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns data-driven UIControl overrides for a single product.
 * Used by StickyAddToCart to auto-adapt its design based on real engagement.
 *
 * Response: { quickBuy?: boolean, stickyVariant?: "A" | "B" }
 *   — only keys that should be overridden are present.
 *   — empty object {} means "use UIControl defaults".
 *
 * Public endpoint (no auth) — productId is not sensitive.
 * Non-blocking: always returns 200.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma          from "@/lib/prisma";
import { buildInsights } from "@/lib/analytics/productInsights";

export async function GET(request) {
  try {
    const productId = new URL(request.url).searchParams.get("productId");
    if (!productId) return Response.json({});

    const row = await prisma.productAnalytics.findUnique({
      where:  { productId },
      select: {
        stickyImpressions: true,
        stickyAddClicks:   true,
        stickyBuyClicks:   true,
      },
    });

    if (!row) return Response.json({});

    const { uiOverrides } = buildInsights(row);
    return Response.json(uiOverrides);
  } catch (err) {
    console.error("[ui-hints]", err?.message ?? err);
    return Response.json({}); // safe fallback — client uses UIControl defaults
  }
}
