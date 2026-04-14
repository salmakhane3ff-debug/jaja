/**
 * /api/reviews
 * ─────────────────────────────────────────────────────────────────────────────
 * POST               → submit review (public — rate-limited)
 * GET  ?productId=   → approved reviews for that product (public)
 *      ?admin=true   → all reviews for admin panel (admin — requires auth)
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
import { rateLimit }     from '@/lib/rateLimit';

// Public submit — rate-limited to prevent spam
export async function POST(req) {
  const limited = rateLimit(req, 'reviews', { max: 10, windowMs: 60_000 });
  if (limited) return limited;
  return createReviewHandler(req);
}

// GET: admin view (?admin=true) requires real auth; public product fetch does not
export function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('admin') === 'true') {
    return withAdminAuth(getReviewsHandler)(req);
  }
  return getReviewsHandler(req);
}

// Admin only — moderation actions
export const PATCH  = withAdminAuth(updateReviewHandler);
export const DELETE = withAdminAuth(deleteReviewHandler);
