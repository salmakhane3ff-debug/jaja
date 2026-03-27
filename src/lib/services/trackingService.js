/**
 * src/lib/services/trackingService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side event tracking backed by the `tracking_events` table.
 *
 * Event names (open string — add any name the caller needs):
 *   "page_view"           – any page visit
 *   "product_view"        – PDP viewed
 *   "add_to_cart"         – item added to cart
 *   "checkout_started"    – checkout page opened
 *   "checkout_completed"  – order successfully placed
 *   "affiliate_click"     – affiliate referral link followed
 *
 * Attribution fields recorded per-event:
 *   sessionId, affiliateId, productId, landingPageId,
 *   orderId, campaignSource, utmSource,
 *   ipAddress, userAgent, referer, extraData (JSONB)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Persist a single tracking event.
 * All fields are optional except `event`.
 */
export async function trackEvent({
  event,
  sessionId     = null,
  affiliateId   = null,
  productId     = null,
  landingPageId = null,
  orderId       = null,
  campaignSource = null,
  utmSource     = null,
  ipAddress     = null,
  userAgent     = null,
  referer       = null,
  extraData     = null,
}) {
  if (!event) throw new Error('event name is required');

  return prisma.trackingEvent.create({
    data: {
      event,
      sessionId,
      affiliateId,
      productId,
      landingPageId,
      orderId,
      campaignSource: campaignSource || null,
      utmSource,
      ipAddress,
      userAgent,
      referer,
      extraData: extraData ?? undefined,
    },
  });
}

// ── Read — admin analytics ─────────────────────────────────────────────────────

/**
 * Count events grouped by event name within an optional date range.
 */
export async function getEventCounts({ startDate, endDate } = {}) {
  const where = buildDateWhere(startDate, endDate);

  const rows = await prisma.trackingEvent.groupBy({
    by:      ['event'],
    where,
    _count:  { _all: true },
    orderBy: { _count: { _all: 'desc' } },
  });

  return rows.map((r) => ({ event: r.event, count: r._count._all }));
}

/**
 * Count unique sessions within an optional date range.
 */
export async function getUniqueSessionCount({ startDate, endDate } = {}) {
  const where = { ...buildDateWhere(startDate, endDate), sessionId: { not: null } };

  const result = await prisma.trackingEvent.findMany({
    where,
    select:  { sessionId: true },
    distinct: ['sessionId'],
  });

  return result.length;
}

/**
 * Traffic-source breakdown (utmSource counts) within an optional date range.
 */
export async function getTrafficSources({ startDate, endDate } = {}) {
  const where = { ...buildDateWhere(startDate, endDate), utmSource: { not: null } };

  const rows = await prisma.trackingEvent.groupBy({
    by:      ['utmSource'],
    where,
    _count:  { _all: true },
    orderBy: { _count: { _all: 'desc' } },
  });

  return rows.map((r) => ({ source: r.utmSource, count: r._count._all }));
}

/**
 * Conversion funnel — counts per stage for a given date range.
 *
 * Returns:
 *   { page_view, product_view, add_to_cart, checkout_started, checkout_completed }
 */
export async function getConversionFunnel({ startDate, endDate } = {}) {
  const stages = [
    'page_view',
    'product_view',
    'add_to_cart',
    'checkout_started',
    'checkout_completed',
  ];

  const where = buildDateWhere(startDate, endDate);

  const counts = await Promise.all(
    stages.map((event) =>
      prisma.trackingEvent.count({ where: { ...where, event } })
    )
  );

  return Object.fromEntries(stages.map((stage, i) => [stage, counts[i]]));
}

/**
 * All events for a given sessionId — for session replay / debugging.
 */
export async function getEventsBySession(sessionId) {
  return prisma.trackingEvent.findMany({
    where:   { sessionId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Recent N events (default 100) for the admin log view.
 */
export async function getRecentEvents({ limit = 100, event = null } = {}) {
  const where = event ? { event } : {};
  return prisma.trackingEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take:    limit,
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildDateWhere(startDate, endDate) {
  if (!startDate && !endDate) return {};
  const createdAt = {};
  if (startDate) createdAt.gte = new Date(startDate);
  if (endDate)   createdAt.lte = new Date(endDate);
  return { createdAt };
}
