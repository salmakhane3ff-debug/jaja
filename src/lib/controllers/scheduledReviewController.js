/**
 * src/lib/controllers/scheduledReviewController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    /api/scheduled-reviews  → all scheduled reviews (admin)
 * POST   /api/scheduled-reviews  → create scheduled review (admin)
 * PATCH  /api/scheduled-reviews  → reset scheduled review (admin)
 * DELETE /api/scheduled-reviews  → delete scheduled review (admin)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  createScheduledReview,
  getScheduledReviews,
  resetScheduledReview,
  deleteScheduledReview,
} from '../services/scheduledReviewService.js';
import { badRequest, notFound, serverError } from '../utils/apiResponse.js';

// ── GET /api/scheduled-reviews ────────────────────────────────────────────────

export async function getScheduledReviewsHandler(_req) {
  try {
    const rows = await getScheduledReviews();
    return Response.json(rows);
  } catch (err) {
    console.error('ScheduledReview GET error:', err);
    return serverError('Failed to fetch scheduled reviews');
  }
}

// ── POST /api/scheduled-reviews ───────────────────────────────────────────────

export async function createScheduledReviewHandler(req) {
  try {
    const body = await req.json();

    if (!body.name?.trim())    return badRequest('name is required');
    if (!body.message?.trim()) return badRequest('message is required');
    if (!body.rating)          return badRequest('rating is required');

    const review = await createScheduledReview(body);
    return Response.json(review, { status: 201 });
  } catch (err) {
    console.error('ScheduledReview POST error:', err);
    return serverError('Failed to create scheduled review');
  }
}

// ── PATCH /api/scheduled-reviews ─────────────────────────────────────────────

export async function resetScheduledReviewHandler(req) {
  try {
    const body = await req.json();
    const id   = body._id || body.id;

    if (!id) return badRequest('id is required');

    const review = await resetScheduledReview(id);
    if (!review) return notFound('Scheduled review not found');

    return Response.json(review);
  } catch (err) {
    console.error('ScheduledReview PATCH error:', err);
    return serverError('Failed to reset scheduled review');
  }
}

// ── DELETE /api/scheduled-reviews ─────────────────────────────────────────────

export async function deleteScheduledReviewHandler(req) {
  try {
    const body = await req.json();
    const id   = body._id || body.id;

    if (!id) return badRequest('id is required');

    const deleted = await deleteScheduledReview(id);
    if (!deleted) return notFound('Scheduled review not found');

    return Response.json({ message: 'Scheduled review deleted', _id: id });
  } catch (err) {
    console.error('ScheduledReview DELETE error:', err);
    return serverError('Failed to delete scheduled review');
  }
}
