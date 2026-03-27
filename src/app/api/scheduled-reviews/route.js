/**
 * /api/scheduled-reviews
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    → all scheduled reviews (admin)
 * POST   → create scheduled review (admin)
 * PATCH  → reset scheduled review — sets published = false (admin)
 * DELETE → delete scheduled review (admin)
 *
 * All methods require admin authentication.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getScheduledReviewsHandler,
  createScheduledReviewHandler,
  resetScheduledReviewHandler,
  deleteScheduledReviewHandler,
} from '@/lib/controllers/scheduledReviewController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const GET    = withAdminAuth(getScheduledReviewsHandler);
export const POST   = withAdminAuth(createScheduledReviewHandler);
export const PATCH  = withAdminAuth(resetScheduledReviewHandler);
export const DELETE = withAdminAuth(deleteScheduledReviewHandler);
