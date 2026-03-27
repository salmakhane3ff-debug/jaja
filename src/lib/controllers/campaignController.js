/**
 * src/lib/controllers/campaignController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    /api/track/campaigns              → campaign list (admin)
 *        /api/track/campaigns?stats=true  → campaigns + aggregated stats (admin)
 * POST   /api/track/campaigns             → create campaign (admin)
 * PATCH  /api/track/campaigns             → update campaign by id (admin)
 * DELETE /api/track/campaigns             → delete campaign by id (admin)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  createCampaign,
  getAllCampaigns,
  getAllCampaignsWithStats,
  updateCampaign,
  deleteCampaign,
} from '../services/campaignService.js';
import { badRequest, notFound, serverError } from '../utils/apiResponse.js';

// ── GET /api/track/campaigns ──────────────────────────────────────────────────

export async function getCampaignsHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const withStats = searchParams.get('stats') === 'true';

    const rows = withStats
      ? await getAllCampaignsWithStats()
      : await getAllCampaigns();

    return Response.json(rows);
  } catch (err) {
    console.error('Campaign GET error:', err);
    return serverError('Failed to fetch campaigns');
  }
}

// ── POST /api/track/campaigns ─────────────────────────────────────────────────

export async function createCampaignHandler(req) {
  try {
    const body = await req.json();

    if (!body.campaignId?.trim()) return badRequest('campaignId is required');
    if (!body.name?.trim())       return badRequest('name is required');

    const campaign = await createCampaign(body);
    return Response.json(campaign, { status: 201 });
  } catch (err) {
    // Unique constraint on campaignId
    if (err.code === 'P2002') {
      return Response.json({ error: 'A campaign with this campaignId already exists' }, { status: 409 });
    }
    console.error('Campaign POST error:', err);
    return serverError('Failed to create campaign');
  }
}

// ── PATCH /api/track/campaigns ────────────────────────────────────────────────

export async function updateCampaignHandler(req) {
  try {
    const body = await req.json();
    const id = body._id || body.id;

    if (!id) return badRequest('id is required');

    const campaign = await updateCampaign(id, body);
    if (!campaign) return notFound('Campaign not found');

    return Response.json(campaign);
  } catch (err) {
    if (err.code === 'P2002') {
      return Response.json({ error: 'campaignId already in use by another campaign' }, { status: 409 });
    }
    console.error('Campaign PATCH error:', err);
    return serverError('Failed to update campaign');
  }
}

// ── DELETE /api/track/campaigns ───────────────────────────────────────────────

export async function deleteCampaignHandler(req) {
  try {
    const body = await req.json();
    const id = body._id || body.id;

    if (!id) return badRequest('id is required');

    const deleted = await deleteCampaign(id);
    if (!deleted) return notFound('Campaign not found');

    return Response.json({ message: 'Campaign deleted', _id: id });
  } catch (err) {
    console.error('Campaign DELETE error:', err);
    return serverError('Failed to delete campaign');
  }
}
