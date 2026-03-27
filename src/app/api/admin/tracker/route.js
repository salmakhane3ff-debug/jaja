/**
 * GET /api/admin/tracker
 * ─────────────────────────────────────────────────────────────────────────────
 * Aggregated click + conversion + funnel performance data.
 *
 * Query params:
 *   days    — lookback window (default: 30)
 *   source  — filter by sourceId (optional)
 *
 * Returns:
 *   summary     { totalClicks, cleanClicks, suspiciousClicks, totalConversions,
 *                 conversionRate, totalRevenue, totalCost, totalProfit,
 *                 epc, cpa, roi }
 *   bySources   [{ sourceId, clicks, conversions, revenue, cost, profit, ctr, epc }]
 *   byCampaign  [{ campaignId, ... cpa, roi }]
 *   byDevice    [{ device, clicks, conversions, convRate }]
 *   byOs        [{ os, clicks }]
 *   byBrowser   [{ browser, clicks }]
 *   byCountry   [{ country, clicks, conversions, revenue }]
 *   byCity      [{ city, clicks, conversions, revenue }]
 *   byIsp       [{ isp, clicks }]
 *   funnel      [{ step, count, dropOff }]
 *   recent      [last 50 clicks + converted flag]
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from "@/lib/prisma";

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || "unknown";
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

function round2(n) { return Math.round((n || 0) * 100) / 100; }

function buildGroupMetrics(clicksArr, allConversions) {
  const clickIds    = new Set(clicksArr.map((c) => c.clickId));
  const groupConvs  = allConversions.filter((c) => clickIds.has(c.clickId));
  const mainConvs   = groupConvs.filter((c) => c.type === "main");

  const clicks      = clicksArr.length;
  const conversions = new Set(mainConvs.map((c) => c.clickId)).size;
  const revenue     = round2(groupConvs.reduce((s, c) => s + (c.revenue || 0), 0));
  const cost        = round2(clicksArr.reduce((s, c) => s + (c.cpc || 0), 0));
  const profit      = round2(revenue - cost);
  const ctr         = clicks > 0 ? round2((conversions / clicks) * 100) : 0;
  const epc         = clicks > 0 ? round2(revenue / clicks) : 0;
  const cpa         = conversions > 0 ? round2(cost / conversions) : 0;
  const roi         = cost > 0 ? round2((profit / cost) * 100) : 0;
  const convRate    = clicks > 0 ? round2((conversions / clicks) * 100) : 0;

  return { clicks, conversions, revenue, cost, profit, ctr, epc, cpa, roi, convRate };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const days     = parseInt(searchParams.get("days") || "30", 10);
    const source   = searchParams.get("source")   || null;
    const campaign = searchParams.get("campaign") || null;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const clickWhere = { createdAt: { gte: since } };
    if (source)   clickWhere.sourceId   = source;
    if (campaign) clickWhere.campaignId = campaign;

    // ── Parallel fetch ────────────────────────────────────────────────────────
    const [clicks, conversions, funnelEvents] = await Promise.all([
      prisma.clickEvent.findMany({
        where:   clickWhere,
        orderBy: { createdAt: "desc" },
        take:    10000,
      }),
      prisma.conversionEvent.findMany({
        where:   { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take:    10000,
      }),
      prisma.funnelEvent.findMany({
        where:   { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take:    20000,
      }),
    ]);

    const convertedClickIds = new Set(conversions.map((c) => c.clickId));

    // ── Summary ───────────────────────────────────────────────────────────────
    const cleanClicks      = clicks.filter((c) => !c.isSuspicious);
    const suspiciousClicks = clicks.filter((c) => c.isSuspicious);
    const mainConversions  = conversions.filter((c) => c.type === "main");
    const uniqueConvIds    = new Set(mainConversions.map((c) => c.clickId));

    const totalClicks      = clicks.length;
    const totalConversions = uniqueConvIds.size;
    const totalRevenue     = round2(conversions.reduce((s, c) => s + (c.revenue || 0), 0));
    const totalCost        = round2(clicks.reduce((s, c) => s + (c.cpc || 0), 0));
    const totalProfit      = round2(totalRevenue - totalCost);
    const conversionRate   = totalClicks > 0 ? round2((totalConversions / totalClicks) * 100) : 0;
    const epc              = totalClicks > 0 ? round2(totalRevenue / totalClicks) : 0;
    const cpa              = totalConversions > 0 ? round2(totalCost / totalConversions) : 0;
    const roi              = totalCost > 0 ? round2((totalProfit / totalCost) * 100) : 0;

    // ── By Source ─────────────────────────────────────────────────────────────
    const bySources = Object.entries(groupBy(clicks, "sourceId"))
      .map(([sourceId, arr]) => ({ sourceId, ...buildGroupMetrics(arr, conversions) }))
      .sort((a, b) => b.clicks - a.clicks);

    // ── By Campaign ───────────────────────────────────────────────────────────
    const byCampaign = Object.entries(groupBy(clicks, "campaignId"))
      .map(([campaignId, arr]) => ({ campaignId, ...buildGroupMetrics(arr, conversions) }))
      .sort((a, b) => b.clicks - a.clicks);

    // ── By Device (with conv rate split) ──────────────────────────────────────
    const byDevice = Object.entries(groupBy(clicks, "device"))
      .map(([device, arr]) => {
        const m = buildGroupMetrics(arr, conversions);
        return { device, clicks: m.clicks, conversions: m.conversions, convRate: m.convRate, revenue: m.revenue };
      })
      .sort((a, b) => b.clicks - a.clicks);

    // ── By OS ─────────────────────────────────────────────────────────────────
    const byOs = Object.entries(groupBy(clicks, "os"))
      .map(([os, arr]) => ({ os, clicks: arr.length }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);

    // ── By Browser ────────────────────────────────────────────────────────────
    const byBrowser = Object.entries(groupBy(clicks, "browser"))
      .map(([browser, arr]) => ({ browser, clicks: arr.length }))
      .sort((a, b) => b.clicks - a.clicks);

    // ── By Country (heatmap data) ─────────────────────────────────────────────
    const byCountry = Object.entries(groupBy(clicks, "country"))
      .map(([country, arr]) => {
        const m = buildGroupMetrics(arr, conversions);
        return { country, clicks: m.clicks, conversions: m.conversions, revenue: m.revenue };
      })
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 20);

    // ── By City (top 20) ──────────────────────────────────────────────────────
    const byCity = Object.entries(groupBy(clicks, "city"))
      .map(([city, arr]) => {
        const m = buildGroupMetrics(arr, conversions);
        return { city, clicks: m.clicks, conversions: m.conversions, revenue: m.revenue };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);

    // ── By ISP (carrier) ──────────────────────────────────────────────────────
    const byIsp = Object.entries(groupBy(clicks, "isp"))
      .map(([isp, arr]) => ({ isp, clicks: arr.length }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);

    // ── Funnel analysis ───────────────────────────────────────────────────────
    const FUNNEL_STEPS = [
      "landing_view", "product_click", "add_to_cart",
      "checkout_start", "payment_selected", "conversion",
    ];
    const funnelByType = {};
    for (const e of funnelEvents) {
      funnelByType[e.eventType] = (funnelByType[e.eventType] || 0) + 1;
    }
    const landingViews = funnelByType["landing_view"] || totalClicks || 1;
    const funnel = FUNNEL_STEPS.map((step) => {
      const count = funnelByType[step] || (step === "conversion" ? totalConversions : 0);
      return {
        step,
        count,
        dropOff: landingViews > 0 ? round2((1 - count / landingViews) * 100) : null,
      };
    });

    // ── Recent clicks (last 50) ───────────────────────────────────────────────
    const recent = clicks.slice(0, 50).map((c) => ({
      ...c,
      converted: convertedClickIds.has(c.clickId),
    }));

    return Response.json({
      summary: {
        totalClicks,
        cleanClicks:      cleanClicks.length,
        suspiciousClicks: suspiciousClicks.length,
        totalConversions,
        conversionRate,
        totalRevenue,
        totalCost,
        totalProfit,
        epc,
        cpa,
        roi,
      },
      bySources,
      byCampaign,
      byDevice,
      byOs,
      byBrowser,
      byCountry,
      byCity,
      byIsp,
      funnel,
      recent,
    });
  } catch (err) {
    console.error("[admin/tracker]", err?.message ?? err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
