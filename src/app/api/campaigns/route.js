/**
 * /api/campaigns
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  — list all campaigns + aggregated stats from click/conversion events
 * POST — create a new campaign (auto-generates slug from name)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from "@/lib/prisma";

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .slice(0, 60);
}

function round2(n) { return Math.round((n || 0) * 100) / 100; }

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30", 10);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [campaigns, clicks, conversions] = await Promise.all([
      prisma.trackingCampaign.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.clickEvent.findMany({
        where:  { createdAt: { gte: since } },
        select: { clickId: true, campaignId: true, cpc: true, isSuspicious: true },
      }),
      prisma.conversionEvent.findMany({
        where:  { createdAt: { gte: since } },
        select: { clickId: true, revenue: true, cost: true, profit: true, type: true },
      }),
    ]);

    // Build a lookup: campaignSlug → stats
    const convByClickId = {};
    for (const c of conversions) {
      if (!convByClickId[c.clickId]) convByClickId[c.clickId] = [];
      convByClickId[c.clickId].push(c);
    }

    const statsMap = {};
    for (const click of clicks) {
      const slug = click.campaignId || "unknown";
      if (!statsMap[slug]) statsMap[slug] = { clicks: 0, suspiciousClicks: 0, convertedIds: new Set(), revenue: 0, cost: 0 };
      statsMap[slug].clicks++;
      if (click.isSuspicious) statsMap[slug].suspiciousClicks++;
      statsMap[slug].cost += click.cpc || 0;
      const convs = convByClickId[click.clickId] || [];
      for (const cv of convs) {
        statsMap[slug].revenue += cv.revenue || 0;
        if (cv.type === "main") statsMap[slug].convertedIds.add(click.clickId);
      }
    }

    const result = campaigns.map((c) => {
      const st = statsMap[c.slug] || { clicks: 0, suspiciousClicks: 0, convertedIds: new Set(), revenue: 0, cost: 0 };
      const clicks      = st.clicks;
      const conversions = st.convertedIds.size;
      const revenue     = round2(st.revenue);
      const cost        = round2(st.cost);
      const profit      = round2(revenue - cost);
      const roi         = cost > 0 ? round2((profit / cost) * 100) : 0;
      const epc         = clicks > 0 ? round2(revenue / clicks) : 0;
      const cpa         = conversions > 0 ? round2(cost / conversions) : 0;
      const convRate    = clicks > 0 ? round2((conversions / clicks) * 100) : 0;
      return {
        ...c,
        stats: { clicks, conversions, revenue, cost, profit, roi, epc, cpa, convRate, suspiciousClicks: st.suspiciousClicks },
      };
    });

    return Response.json({ campaigns: result, days });
  } catch (err) {
    console.error("[campaigns GET]", err?.message ?? err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, landingUrl, source, costModel, defaultCost, notes } = body;

    if (!name || !landingUrl) {
      return Response.json({ error: "name and landingUrl are required" }, { status: 400 });
    }

    // Generate a unique slug
    let baseSlug = slugify(name);
    let slug     = baseSlug;
    let attempt  = 0;
    while (true) {
      const existing = await prisma.trackingCampaign.findUnique({ where: { slug } });
      if (!existing) break;
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    const campaign = await prisma.trackingCampaign.create({
      data: {
        name,
        slug,
        landingUrl:  landingUrl.trim(),
        source:      source     || "other",
        costModel:   costModel  || "cpc",
        defaultCost: parseFloat(defaultCost) || 0,
        notes:       notes      || null,
      },
    });

    return Response.json({ campaign }, { status: 201 });
  } catch (err) {
    console.error("[campaigns POST]", err?.message ?? err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
