/**
 * /api/reviews
 * ─────────────────────────────────────────────────────────────────────────────
 * POST               → submit review (public — customers)
 * GET  ?productId=   → approved reviews for that product (public)
 *      ?admin=true   → all reviews for admin panel (admin)
 * PATCH              → update review status (admin)
 * DELETE             → delete review (admin)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  createReviewHandler,
  getReviewsHandler,
  updateReviewHandler,
  deleteReviewHandler,
} from '@/lib/controllers/reviewController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

// Public — customers submit reviews and product pages fetch approved ones
export const POST = createReviewHandler;
export const GET  = getReviewsHandler;

// Admin only — moderation actions
export const PATCH  = withAdminAuth(updateReviewHandler);
export const DELETE = withAdminAuth(deleteReviewHandler);
