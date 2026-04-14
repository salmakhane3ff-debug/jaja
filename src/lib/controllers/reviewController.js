/**
 * src/lib/controllers/reviewController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * POST   /api/reviews                → create review (public)
 * GET    /api/reviews?productId=<id> → approved reviews for product (public)
 *        /api/reviews?admin=true     → all reviews for admin panel (admin)
 * PATCH  /api/reviews                → update review status (admin)
 * DELETE /api/reviews                → delete review (admin)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  createReview,
  getApprovedReviews,
  getAllReviews,
  updateReviewStatus,
  deleteReview,
} from '../services/reviewService.js';
import { badRequest, notFound, serverError } from '../utils/apiResponse.js';
import { sanitizeText } from '../utils/sanitize.js';

// ── POST /api/reviews ─────────────────────────────────────────────────────────

export async function createReviewHandler(req) {
  try {
    const body = await req.json();

    if (!body.name?.trim())    return badRequest('name is required');
    if (!body.message?.trim()) return badRequest('message is required');
    if (!body.rating)          return badRequest('rating is required');

    const rating = parseInt(body.rating, 10);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return badRequest('rating must be an integer between 1 and 5');
    }

    const review = await createReview({
      ...body,
      rating,
      name:    sanitizeText(body.name,    100),
      message: sanitizeText(body.message, 1000),
      phone:   sanitizeText(body.phone,   30),
    });
    return Response.json(review, { status: 201 });
  } catch (err) {
    console.error('Review POST error:', err);
    return serverError('Failed to submit review');
  }
}

// ── GET /api/reviews ──────────────────────────────────────────────────────────

export async function getReviewsHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId') || null;
    const isAdmin   = searchParams.get('admin') === 'true';

    if (isAdmin) {
      const rows = await getAllReviews();
      return Response.json(rows);
    }

    if (!productId) return badRequest('productId or admin=true query parameter is required');

    const rows = await getApprovedReviews(productId);
    return Response.json(rows);
  } catch (err) {
    console.error('Review GET error:', err);
    return serverError('Failed to fetch reviews');
  }
}

// ── PATCH /api/reviews ────────────────────────────────────────────────────────

export async function updateReviewHandler(req) {
  try {
    const body = await req.json();
    const id     = body._id || body.id;
    const status = body.status;

    if (!id)     return badRequest('id is required');
    if (!status) return badRequest('status is required');

    const review = await updateReviewStatus(id, status);
    if (!review) return notFound('Review not found');

    return Response.json(review);
  } catch (err) {
    console.error('Review PATCH error:', err);
    return serverError('Failed to update review');
  }
}

// ── DELETE /api/reviews ───────────────────────────────────────────────────────

export async function deleteReviewHandler(req) {
  try {
    const body = await req.json();
    const id = body._id || body.id;

    if (!id) return badRequest('id is required');

    const deleted = await deleteReview(id);
    if (!deleted) return notFound('Review not found');

    return Response.json({ message: 'Review deleted', _id: id });
  } catch (err) {
    console.error('Review DELETE error:', err);
    return serverError('Failed to delete review');
  }
}
