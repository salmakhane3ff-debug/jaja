/**
 * src/lib/controllers/adTrackingController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/track/click        → record a campaign click (public)
 * POST /api/track/conversion   → record a conversion + revenue (public)
 * GET  /api/track/stats        → aggregated campaign stats (admin)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  recordClick,
  recordConversion,
  getStats,
} from '../services/adTrackingService.js';
import { badRequest, notFound, serverError } from '../utils/apiResponse.js';

// ── POST /api/track/click ─────────────────────────────────────────────────────

export async function recordClickHandler(req) {
  try {
    const body = await req.json();

    if (!body.campaignId?.trim()) return badRequest('campaignId is required');

    const result = await recordClick(body.campaignId);
    return Response.json(result);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return notFound(err.message);
    console.error('AdTracking click error:', err);
    return serverError('Failed to record click');
  }
}

// ── POST /api/track/conversion ────────────────────────────────────────────────

export async function recordConversionHandler(req) {
  try {
    const body = await req.json();

    if (!body.campaignId?.trim()) return badRequest('campaignId is required');

    const revenue = parseFloat(body.revenue) || 0;
    const result  = await recordConversion(body.campaignId, revenue);
    return Response.json(result);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return notFound(err.message);
    console.error('AdTracking conversion error:', err);
    return serverError('Failed to record conversion');
  }
}

// ── GET /api/track/stats ──────────────────────────────────────────────────────

export async function getCampaignStatsHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId') || null;

    if (!campaignId) return badRequest('campaignId query parameter is required');

    const stats = await getStats(campaignId);
    return Response.json(stats);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return notFound(err.message);
    console.error('AdTracking stats error:', err);
    return serverError('Failed to fetch campaign stats');
  }
}
