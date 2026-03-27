/**
 * /api/feedback
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    ?productId=<uuid>   → approved/published feedback for a product (public)
 *        ?featured=true      → featured feedback for homepage slider (public)
 *        ?admin=true         → all feedback regardless of status (admin only)
 *        ?status=<status>    → filter by status when admin=true
 * POST                       → submit new feedback (public)
 *                              if ?admin=true → admin creates feedback manually
 * PUT                        → approve | reject | schedule | update | verify (admin)
 * DELETE                     → delete feedback (admin)
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

// Public reads
export const GET = getFeedbackHandler;

// POST: admin create (protected) or public submit
export async function POST(req) {
  const { searchParams } = new URL(req.url);
  const isAdmin = searchParams.get('admin') === 'true';

  if (isAdmin) {
    return withAdminAuth(adminCreateFeedbackHandler)(req);
  }
  return submitFeedbackHandler(req);
}

// Admin-only mutations
export const PUT    = withAdminAuth(updateFeedbackHandler);
export const DELETE = withAdminAuth(deleteFeedbackHandler);
