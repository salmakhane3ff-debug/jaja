/**
 * /api/homepage-banner
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    → banners        [admin]
 * POST   → create banner  [admin]
 * PUT    → update banner  [admin]
 * DELETE → delete banner  [admin]
 *
 * AUTH: the Edge middleware matcher excludes /api, so these exports are the only
 * gate. Every method is admin-only, GET included — no page in the codebase reads
 * this route (dead-code removal is being reviewed separately).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getBannersHandler,
  createBannerHandler,
  updateBannerHandler,
  deleteBannerHandler,
} from '@/lib/controllers/homepageBannerController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const GET    = withAdminAuth(getBannersHandler);
export const POST   = withAdminAuth(createBannerHandler);
export const PUT    = withAdminAuth(updateBannerHandler);
export const DELETE = withAdminAuth(deleteBannerHandler);
