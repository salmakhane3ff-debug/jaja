/**
 * productInsights.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure functions that transform raw ProductAnalytics DB rows into rich,
 * actionable insight objects. No DB calls — only computation.
 *
 * Used by:
 *   /api/admin/product-analytics   — admin table
 *   /api/products/ui-hints         — per-product UIControl overrides
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a ratio as "X.X%" string. Returns "0%" on division by zero. */
function fmtPct(numerator, denominator, decimals = 1) {
  if (!denominator || denominator <= 0) return "0%";
  return `${((numerator / denominator) * 100).toFixed(decimals)}%`;
}

/** Same ratio as a plain number (0–100). Returns 0 on division by zero. */
function rawPct(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

// ── Derived metrics ───────────────────────────────────────────────────────────

/** "BUY_NOW" if buy clicks beat add-to-cart clicks, else "ADD_TO_CART" */
function preferredAction(addClicks, buyClicks) {
  return buyClicks > addClicks ? "BUY_NOW" : "ADD_TO_CART";
}

/**
 * Engagement level based on impression volume + total CTR:
 *   < 100 impressions → "INSUFFICIENT_DATA"
 *   totalCTR ≥ 6 %   → "HIGH"
 *   totalCTR ≥ 2 %   → "MEDIUM"
 *   otherwise         → "LOW"
 */
function engagementLevel(impressions, totalCTRRaw) {
  if (impressions < 100) return "INSUFFICIENT_DATA";
  if (totalCTRRaw >= 6)  return "HIGH";
  if (totalCTRRaw >= 2)  return "MEDIUM";
  return "LOW";
}

// ── Recommendation engine ─────────────────────────────────────────────────────

/**
 * Returns an array of recommendation objects:
 *   { type, message, detail }
 *
 * Rules:
 *   1. buyNowCTR > addCTR * 1.3 (and ≥ 100 impressions) → promote Buy Now
 *   2. totalCTR < 2 % and ≥ 1000 impressions → try variant B
 *   3. ≥ 500 impressions and totalCTR < 1 % → pricing / trust issue
 */
function buildRecommendations({ impressions, addClicks: _addClicks, buyClicks: _buyClicks, addCTR, buyCTR, totalCTR }) {
  const recs = [];

  if (impressions >= 100 && buyCTR > addCTR * 1.3) {
    recs.push({
      type:    "PROMOTE_BUY_NOW",
      message: "Promote Buy Now button",
      detail:  `Buy Now CTR (${buyCTR.toFixed(1)}%) outperforms Add to Cart (${addCTR.toFixed(1)}%) by >30 %`,
    });
  }

  if (impressions >= 1000 && totalCTR < 2) {
    recs.push({
      type:    "TRY_VARIANT_B",
      message: "Try variant B (more aggressive UI)",
      detail:  `Total sticky CTR is ${totalCTR.toFixed(1)}% — below the 2 % threshold`,
    });
  }

  if (impressions >= 500 && totalCTR < 1) {
    recs.push({
      type:    "CHECK_PRICING_TRUST",
      message: "Check product pricing or trust signals",
      detail:  `${impressions.toLocaleString()} impressions but only ${totalCTR.toFixed(1)}% engagement`,
    });
  }

  return recs;
}

// ── Auto UIControl overrides (Power Mode) ─────────────────────────────────────

/**
 * Returns a partial UIControl override object:
 *   { quickBuy?: true, stickyVariant?: "B" }
 *
 * Only applied when there is sufficient data (≥ 100 impressions).
 *
 * Rules:
 *   • buyNowCTR > 5 %   → quickBuy = true
 *   • totalCTR   < 2 %  → stickyVariant = "B"
 */
function buildUIOverrides({ impressions, buyCTR, totalCTR }) {
  if (impressions < 100) return {};

  const overrides = {};
  if (buyCTR  > 5) overrides.quickBuy      = true;
  if (totalCTR < 2) overrides.stickyVariant = "B";
  return overrides;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * buildInsights(row)
 *
 * @param {object} row  — raw ProductAnalytics record from Prisma
 * @returns {object}    — fully-enriched analytics object
 */
export function buildInsights(row) {
  const impressions = row.stickyImpressions ?? 0;
  const addClicks   = row.stickyAddClicks   ?? 0;
  const buyClicks   = row.stickyBuyClicks   ?? 0;
  const views       = row.views             ?? 0;
  const orders      = row.orders            ?? 0;
  const clicks      = row.clicks            ?? 0;
  const ctaClicks   = row.ctaClicks         ?? 0;

  // Raw percentage numbers (0–100) for comparisons
  const addCTR   = rawPct(addClicks,              impressions);
  const buyCTR   = rawPct(buyClicks,              impressions);
  const totalCTR = rawPct(addClicks + buyClicks,  impressions);

  const recommendations = buildRecommendations({ impressions, addClicks, buyClicks, addCTR, buyCTR, totalCTR });
  const uiOverrides     = buildUIOverrides({ impressions, buyCTR, totalCTR });

  return {
    // ── Raw counters ────────────────────────────────────────────────────────
    clicks,
    orders,
    views,
    ctaClicks,
    stickyImpressions: impressions,
    stickyAddClicks:   addClicks,
    stickyBuyClicks:   buyClicks,

    // ── Formatted CTR strings ───────────────────────────────────────────────
    stickyCTR:     fmtPct(addClicks,             impressions),   // add-to-cart / impressions
    buyNowCTR:     fmtPct(buyClicks,             impressions),   // buy-now / impressions
    totalCTR:      fmtPct(addClicks + buyClicks, impressions),   // all sticky clicks / impressions
    conversionCTR: fmtPct(orders,                views),         // orders / page views

    // ── Behavior insight ────────────────────────────────────────────────────
    preferredAction: preferredAction(addClicks, buyClicks),
    engagementLevel: engagementLevel(impressions, totalCTR),

    // ── Recommendations ─────────────────────────────────────────────────────
    recommendations,                               // full array
    recommendation: recommendations[0]?.message ?? null,  // primary (string | null)

    // ── Power Mode: UIControl overrides ────────────────────────────────────
    uiOverrides,
  };
}
