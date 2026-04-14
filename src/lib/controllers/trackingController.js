/**
 * src/lib/controllers/trackingController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/track   → record a tracking event (public, no auth required)
 * GET  /api/track   → admin stats dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  trackEvent,
  getEventCounts,
  getUniqueSessionCount,
  getTrafficSources,
  getConversionFunnel,
  getRecentEvents,
} from '../services/trackingService.js';
import { badRequest, serverError } from '../utils/apiResponse.js';

// ── POST /api/track ───────────────────────────────────────────────────────────

/**
 * Record a tracking event.
 * Body: { event, sessionId?, productId?, landingPageId?, orderId?,
 *         utmSource?, affiliateId?, campaignSource?, referer?, extraData? }
 * IP and User-Agent are captured from the request headers automatically.
 */
export async function recordEventHandler(req) {
  try {
    const body = await req.json();

    if (!body?.event) {
      return badRequest('event name is required');
    }

    // Capture network context from headers
    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null;
    const userAgent = req.headers.get('user-agent') || null;
    const referer   = body.referer || req.headers.get('referer') || null;

    await trackEvent({
      event:          body.event,
      sessionId:      body.sessionId      || null,
      affiliateId:    body.affiliateId    || null,
      productId:      body.productId      || null,
      landingPageId:  body.landingPageId  || null,
      orderId:        body.orderId        || null,
      campaignSource: body.campaignSource || null,
      utmSource:      body.utmSource      || body.utm_source || null,
      ipAddress,
      userAgent,
      referer,
      extraData:      body.extraData      || null,
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error('Tracking POST error:', err);
    return serverError('Failed to record event');
  }
}

// ── GET /api/track ────────────────────────────────────────────────────────────

/**
 * Admin analytics dashboard.
 * Query params:
 *   startDate  – ISO date string (optional)
 *   endDate    – ISO date string (optional)
 *   view       – "counts" | "sources" | "funnel" | "recent" (default: "counts")
 *   limit      – max rows for "recent" view (default: 100)
 *   event      – filter by event name for "recent" view
 */
export async function getStatsHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || null;
    const endDate   = searchParams.get('endDate')   || null;
    const view      = searchParams.get('view')      || 'counts';
    const limitRaw  = parseInt(searchParams.get('limit') || '100', 10);
    const limit     = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 500) : 100;
    const event     = searchParams.get('event')     || null;

    const range = { startDate, endDate };

    switch (view) {
      case 'sources':
        return Response.json(await getTrafficSources(range));

      case 'funnel':
        return Response.json(await getConversionFunnel(range));

      case 'recent':
        return Response.json(await getRecentEvents({ limit, event }));

      default: {
        // "counts" — summary dashboard
        const [counts, sessions, sources, funnel] = await Promise.all([
          getEventCounts(range),
          getUniqueSessionCount(range),
          getTrafficSources(range),
          getConversionFunnel(range),
        ]);
        return Response.json({ counts, sessions, sources, funnel });
      }
    }
  } catch (err) {
    console.error('Tracking GET error:', err);
    return serverError('Failed to fetch tracking stats');
  }
}
