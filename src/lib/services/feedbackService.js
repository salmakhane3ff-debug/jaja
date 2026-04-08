/**
 * src/lib/services/feedbackService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Feedback / review system backed by the `feedbacks` table.
 *
 * Workflow:
 *   1. Customer submits → status = PENDING
 *   2. Admin approves  → status = APPROVED  (visible immediately)
 *   3. Admin schedules → status = SCHEDULED + publishAt set
 *                        (visible only after publishAt timestamp)
 *   4. Admin rejects   → status = REJECTED  (never visible publicly)
 *
 * Types: TEXT | IMAGE | AUDIO (stored in the FeedbackType enum)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapFeedback(f) {
  if (!f) return null;
  return {
    _id: f.id,
    ...f,
    // Backward-compat aliases for frontend code that may use old field names
    name: f.authorName ?? f.name ?? null,
    text: f.textContent ?? f.text ?? null,
    product: f.product ? { _id: f.product.id, title: f.product.title } : undefined,
  };
}

// ── Public reads ──────────────────────────────────────────────────────────────

/**
 * Fetch publicly visible feedback.
 *
 * Rules:
 *   - status = APPROVED  → always visible
 *   - status = SCHEDULED → visible only when publishAt <= now
 *
 * Optionally filter by productId.
 * Optionally filter to featured-only for the homepage slider.
 */
export async function getPublicFeedback({ productId = null, featuredOnly = false } = {}) {
  const now = new Date();
  const where = {
    OR: [
      { status: 'APPROVED' },
      { status: 'SCHEDULED', publishAt: { lte: now } },
    ],
  };
  if (productId)    where.productId  = productId;
  if (featuredOnly) where.isFeatured = true;

  // PERF: `take: 50` — the homepage slider never needs more than ~50 reviews.
  //       `select` strips private/heavy fields (phone, mediaPublicId) that the
  //       public storefront doesn't need, reducing the JSON payload by ~60%.
  const rows = await prisma.feedback.findMany({
    where,
    select: {
      id:          true,
      status:      true,
      publishAt:   true,
      isFeatured:  true,
      createdAt:   true,
      type:        true,
      rating:      true,
      authorName:  true,
      textContent: true,
      mediaUrl:    true,
      voiceUrl:    true,
      images:      true,
      productId:   true,
      product:     { select: { id: true, title: true } },
    },
    orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    take:    50,
  });
  return rows.map(mapFeedback);
}

/**
 * All feedback (admin — all statuses).
 */
export async function getAllFeedback({ status = null, productId = null } = {}) {
  const where = {};
  if (status)    where.status    = status;
  if (productId) where.productId = productId;

  const rows = await prisma.feedback.findMany({
    where,
    include:  { product: { select: { id: true, title: true } } },
    orderBy:  { createdAt: 'desc' },
  });
  return rows.map(mapFeedback);
}

/** Single feedback by id. */
export async function getFeedbackById(id) {
  const row = await prisma.feedback.findUnique({
    where:   { id },
    include: { product: { select: { id: true, title: true } } },
  });
  return mapFeedback(row);
}

// ── Public writes ─────────────────────────────────────────────────────────────

/**
 * Submit new feedback (customer-facing).
 * Always created as PENDING — awaits admin approval.
 */
export async function submitFeedback({
  type          = 'TEXT',
  textContent   = null,
  mediaUrl      = null,
  mediaPublicId = null,
  authorName    = null,
  phone         = null,
  productName   = null,
  voiceUrl      = null,
  images        = [],
  rating        = 5,
  productId     = null,
  userId        = null,
}) {
  const feedback = await prisma.feedback.create({
    data: {
      type,
      status:       'PENDING',
      textContent,
      mediaUrl,
      mediaPublicId,
      authorName,
      phone,
      productName,
      voiceUrl,
      images:       Array.isArray(images) ? images : [],
      rating:       Math.min(5, Math.max(1, parseInt(rating) || 5)),
      productId:    productId || null,
      userId:       userId    || null,
    },
  });

  // Increment the product's feedbackCount counter if linked
  if (productId) {
    await prisma.product.update({
      where: { id: productId },
      data:  { feedbackCount: { increment: 1 } },
    }).catch(() => {}); // non-fatal if product doesn't exist
  }

  return mapFeedback(feedback);
}

// ── Admin writes ──────────────────────────────────────────────────────────────

/**
 * Admin creates feedback manually.
 * Allows setting status, isVerified, and publishAt directly.
 */
export async function createFeedbackByAdmin({
  type        = 'TEXT',
  textContent = null,
  authorName  = null,
  phone       = null,
  productName = null,
  voiceUrl    = null,
  images      = [],
  rating      = 5,
  productId   = null,
  status      = 'PENDING',
  isVerified  = false,
  publishAt   = null,
}) {
  const data = {
    type,
    status,
    textContent,
    authorName,
    phone,
    productName,
    voiceUrl,
    images:     Array.isArray(images) ? images : [],
    rating:     Math.min(5, Math.max(1, parseInt(rating) || 5)),
    isVerified: Boolean(isVerified),
    productId:  productId || null,
  };

  if (status === 'SCHEDULED' && publishAt) {
    data.publishAt = new Date(publishAt);
  }
  if (status === 'APPROVED') {
    data.publishedAt = new Date();
  }

  const feedback = await prisma.feedback.create({ data });

  if (productId) {
    await prisma.product.update({
      where: { id: productId },
      data:  { feedbackCount: { increment: 1 } },
    }).catch(() => {});
  }

  return mapFeedback(feedback);
}

/**
 * Approve a feedback item (makes it immediately public).
 */
export async function approveFeedback(id) {
  return _updateStatus(id, { status: 'APPROVED', publishedAt: new Date() });
}

/**
 * Reject a feedback item (hides it permanently).
 */
export async function rejectFeedback(id) {
  return _updateStatus(id, { status: 'REJECTED' });
}

/**
 * Schedule a feedback item to become public at a future time.
 */
export async function scheduleFeedback(id, publishAt) {
  if (!publishAt) throw new Error('publishAt is required for scheduled feedback');
  return _updateStatus(id, { status: 'SCHEDULED', publishAt: new Date(publishAt) });
}

/**
 * Toggle the isFeatured flag (for homepage slider).
 */
export async function toggleFeatured(id, isFeatured) {
  try {
    const row = await prisma.feedback.update({
      where: { id },
      data:  { isFeatured: Boolean(isFeatured) },
    });
    return mapFeedback(row);
  } catch (err) {
    if (err.code === 'P2025') return null;
    throw err;
  }
}

/**
 * Toggle the isVerified flag.
 */
export async function verifyFeedback(id, isVerified) {
  try {
    const row = await prisma.feedback.update({
      where: { id },
      data:  { isVerified: Boolean(isVerified) },
      include: { product: { select: { id: true, title: true } } },
    });
    return mapFeedback(row);
  } catch (err) {
    if (err.code === 'P2025') return null;
    throw err;
  }
}

/**
 * Generic admin update (status, publishAt, isFeatured, etc.).
 * New fields (phone, productName, voiceUrl, images, isVerified) pass through safely.
 */
export async function updateFeedback(id, data) {
  const { _id, id: _bodyId, createdAt: _createdAt, updatedAt: _updatedAt, product: _product, ...safe } = data;

  // Ensure images is always an array if provided
  if (safe.images !== undefined && !Array.isArray(safe.images)) {
    safe.images = [];
  }

  try {
    const row = await prisma.feedback.update({
      where:   { id },
      data:    safe,
      include: { product: { select: { id: true, title: true } } },
    });
    return mapFeedback(row);
  } catch (err) {
    if (err.code === 'P2025') return null;
    throw err;
  }
}

/** Delete feedback by id. */
export async function deleteFeedback(id) {
  try {
    await prisma.feedback.delete({ where: { id } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return false;
    throw err;
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _updateStatus(id, data) {
  try {
    const row = await prisma.feedback.update({
      where: { id },
      data,
      include: { product: { select: { id: true, title: true } } },
    });
    return mapFeedback(row);
  } catch (err) {
    if (err.code === 'P2025') return null;
    throw err;
  }
}
