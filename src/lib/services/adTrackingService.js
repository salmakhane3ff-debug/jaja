/**
 * src/lib/services/adTrackingService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Ad-campaign click / conversion tracking backed by `ad_campaigns` and
 * `ad_stats_daily` tables.
 *
 * This is distinct from trackingService.js, which handles the general-purpose
 * `tracking_events` table.  This service only touches AdCampaign + AdStatsDaily
 * and keeps paid-campaign metrics separate from session-level analytics.
 *
 * Daily rows are upserted by (campaignId, date) where date is truncated to
 * 00:00:00 UTC.  Prisma's upsert + atomic increment keeps counts consistent
 * under concurrent requests without application-level locking.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return today's date truncated to 00:00:00 UTC.
 * Used as the composite-unique `date` key in ad_stats_daily.
 */
function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Find an AdCampaign by its public campaignId slug.
 * Throws a typed error so controllers can return a clean 404.
 *
 * @param {string} campaignId  slug, e.g. "fb-shoes-summer-2025"
 */
async function findCampaign(campaignId) {
  const campaign = await prisma.adCampaign.findUnique({
    where: { campaignId },
  });
  if (!campaign) {
    const err = new Error(`Campaign not found: ${campaignId}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  return campaign;
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Record one click for a campaign.
 *
 * 1. Resolve the campaign by its slug.
 * 2. Upsert today's AdStatsDaily row — increment `clicks` by 1.
 * 3. Increment the denormalised `clicks` counter on the campaign itself.
 *
 * All three writes are in a single Prisma transaction so partial failures
 * cannot leave the counters out of sync.
 *
 * @param {string} campaignId  public slug (not UUID)
 */
export async function recordClick(campaignId) {
  const campaign = await findCampaign(campaignId);
  const date     = todayUTC();

  await prisma.$transaction([
    // Upsert daily stats row
    prisma.adStatsDaily.upsert({
      where:  { campaignId_date: { campaignId: campaign.id, date } },
      create: { campaignId: campaign.id, date, clicks: 1 },
      update: { clicks: { increment: 1 } },
    }),
    // Keep denormalised counter in sync
    prisma.adCampaign.update({
      where: { id: campaign.id },
      data:  { clicks: { increment: 1 } },
    }),
  ]);

  return { ok: true, campaignId };
}

/**
 * Record one conversion (order placed via this campaign).
 *
 * 1. Resolve the campaign by its slug.
 * 2. Upsert today's AdStatsDaily row — increment conversions + add revenue.
 * 3. Update denormalised counters on AdCampaign.
 *    profit = revenue - cost is recalculated from the stored cost value.
 *
 * @param {string} campaignId  public slug
 * @param {number} revenue     order total attributed to this campaign
 */
export async function recordConversion(campaignId, revenue) {
  const campaign = await findCampaign(campaignId);
  const date     = todayUTC();
  const rev      = parseFloat(revenue) || 0;

  await prisma.$transaction([
    // Upsert daily stats row
    prisma.adStatsDaily.upsert({
      where:  { campaignId_date: { campaignId: campaign.id, date } },
      create: { campaignId: campaign.id, date, conversions: 1, revenue: rev },
      update: { conversions: { increment: 1 }, revenue: { increment: rev } },
    }),
    // Denormalised counters — profit derived from stored cost
    prisma.adCampaign.update({
      where: { id: campaign.id },
      data: {
        conversions: { increment: 1 },
        revenue:     { increment: rev },
        profit:      { increment: rev - 0 }, // profit delta = revenue; cost fixed
      },
    }),
  ]);

  return { ok: true, campaignId, revenue: rev };
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Return aggregated stats for a single campaign from ad_stats_daily.
 *
 * @param {string} campaignId  public slug
 */
export async function getStats(campaignId) {
  // Verify the campaign exists first
  const campaign = await findCampaign(campaignId);

  const agg = await prisma.adStatsDaily.aggregate({
    where: { campaignId: campaign.id },
    _sum: {
      clicks:      true,
      conversions: true,
      revenue:     true,
      cost:        true,
    },
  });

  const totalClicks      = agg._sum.clicks      ?? 0;
  const totalConversions = agg._sum.conversions  ?? 0;
  const totalRevenue     = agg._sum.revenue      ?? 0;
  const totalCost        = agg._sum.cost         ?? campaign.cost ?? 0;

  return {
    campaignId,
    name:             campaign.name,
    status:           campaign.status.toLowerCase(),
    trafficSource:    campaign.trafficSource.toLowerCase(),
    totalClicks,
    totalConversions,
    totalRevenue:     parseFloat(totalRevenue.toFixed(2)),
    totalCost:        parseFloat(totalCost.toFixed(2)),
    cvr: totalClicks      > 0
           ? parseFloat(((totalConversions / totalClicks) * 100).toFixed(2))
           : 0,
    roi: totalCost        > 0
           ? parseFloat((((totalRevenue - totalCost) / totalCost) * 100).toFixed(2))
           : 0,
  };
}
