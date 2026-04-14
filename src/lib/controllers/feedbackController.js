/**
 * src/lib/controllers/feedbackController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    /api/feedback          → public: approved/scheduled feedback
 *                                  ?productId=xxx  filter by product
 *                                  ?featured=true  homepage slider only
 *                                  ?admin=true     all feedback (admin)
 * POST   /api/feedback          → public: submit new feedback (PENDING)
 *                                  admin: create feedback manually
 * PUT    /api/feedback          → admin: approve | reject | schedule | update | verify
 * DELETE /api/feedback          → admin: delete feedback
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getPublicFeedback,
  getAllFeedback,
  submitFeedback,
  createFeedbackByAdmin,
  approveFeedback,
  rejectFeedback,
  scheduleFeedback,
  toggleFeatured,
  verifyFeedback,
  updateFeedback,
  deleteFeedback,
} from '../services/feedbackService.js';
import { badRequest, notFound, serverError } from '../utils/apiResponse.js';
import { sanitizeText, sanitizeTextOrNull } from '../utils/sanitize.js';

// ── GET /api/feedback ─────────────────────────────────────────────────────────

export async function getFeedbackHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const productId    = searchParams.get('productId')  || null;
    const featuredOnly = searchParams.get('featured') === 'true';
    const isAdmin      = searchParams.get('admin')    === 'true';
    const statusFilter = searchParams.get('status')   || null;

    if (isAdmin) {
      const rows = await getAllFeedback({ status: statusFilter, productId });
      return Response.json(rows, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const rows = await getPublicFeedback({ productId, featuredOnly });

    // WHY: Public feedback is displayed on product pages and homepage. A 60-second
    // cache eliminates redundant DB queries when multiple visitors hit the same page
    // simultaneously (thundering herd on popular products).
    return Response.json(rows, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('Feedback GET error:', err);
    return serverError('Failed to fetch feedback');
  }
}

// ── POST /api/feedback ────────────────────────────────────────────────────────

export async function submitFeedbackHandler(req) {
  try {
    const body = await req.json();

    const rating = Math.min(5, Math.max(1, parseInt(body.rating, 10) || 5));

    const feedback = await submitFeedback({
      type:          body.type          || 'TEXT',
      textContent:   sanitizeTextOrNull(body.textContent || body.comment, 2000),
      mediaUrl:      body.mediaUrl      || null,
      mediaPublicId: body.mediaPublicId || null,
      authorName:    sanitizeTextOrNull(body.authorName || body.name, 100),
      phone:         sanitizeTextOrNull(body.phone, 30),
      productName:   sanitizeTextOrNull(body.productName, 200),
      voiceUrl:      body.voiceUrl      || null,
      images:        body.images        || [],
      rating,
      productId:     body.productId     || null,
      userId:        body.userId        || null,
    });

    return Response.json(feedback, { status: 201 });
  } catch (err) {
    console.error('Feedback POST error:', err);
    return serverError('Failed to submit feedback');
  }
}

// ── POST /api/feedback (admin create) ────────────────────────────────────────

export async function adminCreateFeedbackHandler(req) {
  try {
    const body = await req.json();

    if (!body.authorName && !body.name) {
      return badRequest('authorName is required');
    }

    const feedback = await createFeedbackByAdmin({
      type:        body.type        || 'TEXT',
      textContent: body.textContent || body.comment || null,
      authorName:  body.authorName  || body.name    || null,
      phone:       body.phone       || null,
      productName: body.productName || null,
      voiceUrl:    body.voiceUrl    || null,
      images:      body.images      || [],
      rating:      body.rating      || 5,
      productId:   body.productId   || null,
      status:      body.status      || 'PENDING',
      isVerified:  body.isVerified  ?? false,
      publishAt:   body.publishAt   || null,
    });

    return Response.json(feedback, { status: 201 });
  } catch (err) {
    console.error('Feedback admin POST error:', err);
    return serverError('Failed to create feedback');
  }
}

// ── PUT /api/feedback ─────────────────────────────────────────────────────────

/**
 * Admin actions:
 *   { _id, action: "approve" }
 *   { _id, action: "reject" }
 *   { _id, action: "schedule", publishAt: "2025-01-01T00:00:00Z" }
 *   { _id, action: "feature",  isFeatured: true|false }
 *   { _id, action: "verify",   isVerified: true|false }
 *   { _id, ...fields }   (generic update)
 */
export async function updateFeedbackHandler(req) {
  try {
    const body = await req.json();
    const { _id, id, action, ...rest } = body;
    const feedbackId = _id || id;

    if (!feedbackId) return badRequest('_id is required');

    let result;

    switch (action) {
      case 'approve':
        result = await approveFeedback(feedbackId);
        break;
      case 'reject':
        result = await rejectFeedback(feedbackId);
        break;
      case 'schedule':
        if (!rest.publishAt) return badRequest('publishAt is required for schedule action');
        result = await scheduleFeedback(feedbackId, rest.publishAt);
        break;
      case 'feature':
        result = await toggleFeatured(feedbackId, rest.isFeatured ?? true);
        break;
      case 'verify':
        result = await verifyFeedback(feedbackId, rest.isVerified ?? true);
        break;
      default:
        result = await updateFeedback(feedbackId, rest);
    }

    if (!result) return notFound('Feedback not found');
    return Response.json(result);
  } catch (err) {
    console.error('Feedback PUT error:', err);
    return serverError('Failed to update feedback');
  }
}

// ── DELETE /api/feedback ──────────────────────────────────────────────────────

export async function deleteFeedbackHandler(req) {
  try {
    const body = await req.json();
    const { _id, id } = body;
    const feedbackId = _id || id;

    if (!feedbackId) return badRequest('_id is required');

    const deleted = await deleteFeedback(feedbackId);
    if (!deleted) return notFound('Feedback not found');

    return Response.json({ message: 'Feedback deleted', _id: feedbackId });
  } catch (err) {
    console.error('Feedback DELETE error:', err);
    return serverError('Failed to delete feedback');
  }
}
