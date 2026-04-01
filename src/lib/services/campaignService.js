/**
 * src/lib/services/campaignService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD for the `ad_campaigns` table plus aggregated stats from `ad_stats_daily`.
 *
 * CampaignSource enum: TIKTOK | INSTAGRAM | PUSH_ADS | NATIVE_ADS | DIRECT | OTHER
 * CampaignStatus enum: ACTIVE | PAUSED | ENDED
 *
 * Both enums are stored uppercase in Postgres but serialised to lowercase for
 * the frontend so existing === "active" / === "tiktok" comparisons keep working.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_MAP = {
  tiktok:     'TIKTOK',
  TIKTOK:     'TIKTOK',
  instagram:  'INSTAGRAM',
  INSTAGRAM:  'INSTAGRAM',
  push_ads:   'PUSH_ADS',
  PUSH_ADS:   'PUSH_ADS',
  native_ads: 'NATIVE_ADS',
  NATIVE_ADS: 'NATIVE_ADS',
  direct:     'DIRECT',
  DIRECT:     'DIRECT',
  other:      'OTHER',
  OTHER:      'OTHER',
};

const STATUS_MAP = {
  active: 'ACTIVE',
  ACTIVE: 'ACTIVE',
  paused: 'PAUSED',
  PAUSED: 'PAUSED',
  ended:  'ENDED',
  ENDED:  'ENDED',
};

function toSourceEnum(raw) {
  return SOURCE_MAP[raw] ?? 'OTHER';
}

function toStatusEnum(raw) {
  return STATUS_MAP[raw] ?? 'ACTIVE';
}

/** Serialise a DB row for API consumers (lowercase enums, _id alias). */
function mapCampaign(c) {
  if (!c) return null;
  return {
    _id:          c.id,
    ...c,
    trafficSource: c.trafficSource.toLowerCase(),
    status:        c.status.toLowerCase(),
    // Computed convenience field used by the campaigns admin page
    cvr:  c.clicks > 0 ? ((c.conversions / c.clicks) * 100).toFixed(2) : '0.00',
    roi:  c.cost   > 0 ? ((c.profit      / c.cost)   * 100).toFixed(2) : '0.00',
  };
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Create a new ad campaign.
 *
 * @param {object} data
 * @param {string}  data.campaignId    unique slug, e.g. "fb-shoes-summer-2025"
 * @param {string}  data.name          human-readable name
 * @param {string}  [data.trafficSource]
 * @param {string}  [data.status]
 * @param {number}  [data.cost]        total ad spend budget
 */
export async function createCampaign(data) {
  const row = await prisma.adCampaign.create({
    data: {
      campaignId:    data.campaignId,
      name:          data.name,
      trafficSource: toSourceEnum(data.trafficSource),
      status:        toStatusEnum(data.status),
      cost:          parseFloat(data.cost) || 0,
    },
  });
  return mapCampaign(row);
}

/**
 * Partial update of an ad campaign.
 * Only the fields present in `data` are written.
 *
 * @param {string} id  primary key (UUID)
 * @param {object} data
 */
export async function updateCampaign(id, data) {
  const patch = {};

  if (data.name          !== undefined) patch.name          = data.name;
  if (data.campaignId    !== undefined) patch.campaignId    = data.campaignId;
  if (data.trafficSource !== undefined) patch.trafficSource = toSourceEnum(data.trafficSource);
  if (data.status        !== undefined) patch.status        = toStatusEnum(data.status);
  if (data.cost          !== undefined) patch.cost          = parseFloat(data.cost) || 0;

  try {
    const row = await prisma.adCampaign.update({ where: { id }, data: patch });
    return mapCampaign(row);
  } catch (err) {
    if (err.code === 'P2025') return null; // record not found
    throw err;
  }
}

/**
 * Delete an ad campaign and cascade-delete its AdStatsDaily rows.
 *
 * @param {string} id  primary key (UUID)
 */
export async function deleteCampaign(id) {
  try {
    const row = await prisma.adCampaign.delete({ where: { id } });
    return mapCampaign(row);
  } catch (err) {
    if (err.code === 'P2025') return null;
    throw err;
  }
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Return all campaigns ordered by creation date, newest first.
 */
export async function getAllCampaigns() {
  const rows = await prisma.adCampaign.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mapCampaign);
}

/**
 * Return aggregated stats for a single campaign from `ad_stats_daily`.
 * Sums clicks and conversions across all daily rows for that campaign.
 *
 * @param {string} campaignId  the slug (not UUID) used in tracking URLs
 */
export async function getCampaignStats(campaignId) {
  const agg = await prisma.adStatsDaily.aggregate({
    where: { campaign: { campaignId } },
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
  const totalCost        = agg._sum.cost         ?? 0;

  return {
    campaignId,
    totalClicks,
    totalConversions,
    totalRevenue,
    totalCost,
    cvr: totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(2) : '0.00',
    roi: totalCost   > 0 ? (((totalRevenue - totalCost) / totalCost) * 100).toFixed(2) : '0.00',
  };
}

/**
 * Return all campaigns with their aggregated stats merged in.
 * Used by GET /api/track/campaigns?stats=true.
 *
 * PERF: Previously this ran 1 + N Prisma queries (one per campaign).
 *       Now it runs exactly 2 queries regardless of how many campaigns exist:
 *         1. getAllCampaigns()          → fetches all AdCampaign rows
 *         2. prisma.adStatsDaily.groupBy → sums stats for ALL campaigns at once
 *       Then stats are merged in memory via a Map lookup (O(1) per campaign).
 */
export async function getAllCampaignsWithStats() {
  const [campaigns, statRows] = await Promise.all([
    getAllCampaigns(),
    // Single aggregation across every campaign in one DB round-trip
    prisma.adStatsDaily.groupBy({
      by:  ['campaignId'],
      _sum: { clicks: true, conversions: true, revenue: true, cost: true },
    }),
  ]);

  // Build a Map keyed by AdCampaign.id (UUID) for O(1) lookups below
  const statsMap = new Map(
    statRows.map((row) => [row.campaignId, row._sum]),
  );

  return campaigns.map((c) => {
    const s           = statsMap.get(c.id) ?? {};
    const totalClicks      = s.clicks      ?? 0;
    const totalConversions = s.conversions ?? 0;
    const totalRevenue     = s.revenue     ?? 0;
    const totalCost        = s.cost        ?? 0;
    return {
      ...c,
      stats: {
        campaignId:       c.campaignId,
        totalClicks,
        totalConversions,
        totalRevenue,
        totalCost,
        cvr: totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(2) : '0.00',
        roi: totalCost   > 0 ? (((totalRevenue - totalCost) / totalCost) * 100).toFixed(2) : '0.00',
      },
    };
  });
}
