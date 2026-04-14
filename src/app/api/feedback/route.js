/**
 * /api/feedback
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    ?productId=  → approved feedback for a product (public)
 *        ?featured=   → featured feedback for homepage (public)
 *        ?admin=true  → all feedback (admin — requires auth)
 * POST               → submit feedback (public — rate-limited)
 *        ?admin=true  → admin creates feedback manually (admin — requires auth)
 * PUT                → approve | reject | schedule | update (admin)
 * DELETE             → delete feedback (admin)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getFeedbackHandler,
  submitFeedbackHandler,
  adminCreateFeedbackHandler,
  updateFeedbackHandler,
  deleteFeedbackHandler,
} from '@/lib/controllers/feedbackController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { rateLimit }     from '@/lib/rateLimit';

// GET: admin view requires real auth; public reads do not
export function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('admin') === 'true') {
    return withAdminAuth(getFeedbackHandler)(req);
  }
  return getFeedbackHandler(req);
}

// POST: admin create (protected) or public submit (rate-limited)
export async function POST(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('admin') === 'true') {
    return withAdminAuth(adminCreateFeedbackHandler)(req);
  }
  const limited = rateLimit(req, 'feedback', { max: 10, windowMs: 60_000 });
  if (limited) return limited;
  return submitFeedbackHandler(req);
}

// Admin-only mutations
export const PUT    = withAdminAuth(updateFeedbackHandler);
export const DELETE = withAdminAuth(deleteFeedbackHandler);
