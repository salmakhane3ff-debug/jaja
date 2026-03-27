/**
 * GET /api/admin/product-analytics
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns per-product analytics enriched with derived metrics and insights.
 *
 * Shape (keyed by productId):
 * {
 *   [productId]: {
 *     clicks, orders, views, ctaClicks,
 *     stickyImpressions, stickyAddClicks, stickyBuyClicks,
 *     stickyCTR, buyNowCTR, totalCTR, conversionCTR,
 *     preferredAction, engagementLevel,
 *     recommendation, recommendations,
 *     uiOverrides
 *   }
 * }
 *
 * Non-blocking: returns {} on any error so the admin page always loads.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma          from "@/lib/prisma";
import { withAdminAuth } from "@/lib/middleware/withAdminAuth";
import { buildInsights } from "@/lib/analytics/productInsights";

async function handler() {
  try {
    const rows = await prisma.productAnalytics.findMany({
      select: {
        productId:         true,
        clicks:            true,
        orders:            true,
        views:             true,
        ctaClicks:         true,
        stickyImpressions: true,
        stickyAddClicks:   true,
        stickyBuyClicks:   true,
      },
    });

    const analytics = {};
    for (const row of rows) {
      analytics[row.productId] = buildInsights(row);
    }

    return Response.json(analytics);
  } catch (err) {
    console.error("[product-analytics]", err?.message ?? err);
    return Response.json({});
  }
}

export const GET = withAdminAuth(handler);
