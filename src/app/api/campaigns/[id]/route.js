/**
 * /api/campaigns/[id]
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    — single campaign
 * PUT    — update campaign fields
 * DELETE — delete campaign
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from "@/lib/prisma";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const campaign = await prisma.trackingCampaign.findUnique({ where: { id } });
    if (!campaign) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ campaign });
  } catch (err) {
    console.error("[campaigns/:id GET]", err?.message ?? err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id }  = await params;
    const body    = await request.json();
    const { name, landingUrl, source, costModel, defaultCost, isActive, notes } = body;

    const data = {};
    if (name        !== undefined) data.name        = name;
    if (landingUrl  !== undefined) data.landingUrl  = landingUrl;
    if (source      !== undefined) data.source      = source;
    if (costModel   !== undefined) data.costModel   = costModel;
    if (defaultCost !== undefined) data.defaultCost = parseFloat(defaultCost) || 0;
    if (isActive    !== undefined) data.isActive    = Boolean(isActive);
    if (notes       !== undefined) data.notes       = notes;

    const campaign = await prisma.trackingCampaign.update({ where: { id }, data });
    return Response.json({ campaign });
  } catch (err) {
    console.error("[campaigns/:id PUT]", err?.message ?? err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await prisma.trackingCampaign.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[campaigns/:id DELETE]", err?.message ?? err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
