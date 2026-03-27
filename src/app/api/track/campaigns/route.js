/**
 * /api/track/campaigns
 * ─────────────────────────────────────────────────────────────────────────────
 * GET              → all campaigns (admin)
 *     ?stats=true  → campaigns with aggregated AdStatsDaily totals (admin)
 * POST             → create campaign (admin)
 * PATCH            → update campaign by id (admin)
 * DELETE           → delete campaign + cascade AdStatsDaily rows (admin)
 *
 * All methods require admin authentication.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getCampaignsHandler,
  createCampaignHandler,
  updateCampaignHandler,
  deleteCampaignHandler,
} from '@/lib/controllers/campaignController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const GET    = withAdminAuth(getCampaignsHandler);
export const POST   = withAdminAuth(createCampaignHandler);
export const PATCH  = withAdminAuth(updateCampaignHandler);
export const DELETE = withAdminAuth(deleteCampaignHandler);
