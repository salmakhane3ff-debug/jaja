/**
 * /api/affiliate
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    ?id=<uuid>  → single affiliate stats (admin)
 * GET               → list all affiliates (admin)
 * POST              → create affiliate (admin)
 * PUT               → update affiliate (admin)
 * DELETE            → delete affiliate (admin)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getAffiliatesHandler,
  createAffiliateHandler,
  updateAffiliateHandler,
  deleteAffiliateHandler,
} from '@/lib/controllers/affiliateController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const GET    = withAdminAuth(getAffiliatesHandler);
export const POST   = withAdminAuth(createAffiliateHandler);
export const PUT    = withAdminAuth(updateAffiliateHandler);
export const DELETE = withAdminAuth(deleteAffiliateHandler);
