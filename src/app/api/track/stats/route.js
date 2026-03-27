/**
 * /api/track/stats
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  ?campaignId=<slug>  → aggregated AdStatsDaily totals for that campaign
 *
 * Admin only — returns click / conversion / revenue / cost / CVR / ROI.
 * Used by the campaigns detail view in the admin panel.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getCampaignStatsHandler } from '@/lib/controllers/adTrackingController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const GET = withAdminAuth(getCampaignStatsHandler);
