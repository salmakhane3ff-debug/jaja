/**
 * src/lib/services/reviewService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD for the `reviews` table.
 *
 * status is stored as a Prisma enum (PENDING | APPROVED | REJECTED).
 * The map helper serialises it to lowercase so existing frontend comparisons
 * (=== "approved", === "pending") keep working without changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise incoming status string to Prisma enum value. */
function toStatusEnum(raw) {
  if (!raw) return 'PENDING';
  const map = {
    pending:  'PENDING',
    PENDING:  'PENDING',
    approved: 'APPROVED',
    APPROVED: 'APPROVED',
    rejected: 'REJECTED',
    REJECTED: 'REJECTED',
  };
  return map[raw] ?? 'PENDING';
}

/** Serialise a DB row for API consumers. */
function mapReview(r) {
  if (!r) return null;
  return {
    _id:    r.id,
    ...r,
    // Lowercase status so frontend === "approved" comparisons keep working
    status: r.status.toLowerCase(),
  };
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Create a new review submitted by a customer.
 * Always starts in PENDING status.
 *
 * @param {object} data
 * @param {string}  data.name
 * @param {string}  [data.phone]
 * @param {number}  data.rating        1–5
 * @param {string}  data.message
 * @param {string}  [data.productId]
 * @param {string}  [data.productTitle]
 */
export async function createReview(data) {
  const row = await prisma.review.create({
    data: {
      name:         data.name,
      phone:        data.phone        ?? null,
      rating:       parseInt(data.rating, 10) || 5,
      message:      data.message,
      productId:    data.productId    ?? null,
      productTitle: data.productTitle ?? null,
      status:       'PENDING',
    },
  });
  return mapReview(row);
}

/**
 * Update the status of a review (approve or reject).
 * Returns null if the review does not exist.
 *
 * @param {string} id
 * @param {string} status  "approved" | "rejected" | "pending"
 */
export async function updateReviewStatus(id, status) {
  try {
    const row = await prisma.review.update({
      where: { id },
      data:  { status: toStatusEnum(status) },
    });
    return mapReview(row);
  } catch (err) {
    if (err.code === 'P2025') return null; // record not found
    throw err;
  }
}

/**
 * Permanently delete a review.
 * Returns null if the review does not exist.
 *
 * @param {string} id
 */
export async function deleteReview(id) {
  try {
    const row = await prisma.review.delete({ where: { id } });
    return mapReview(row);
  } catch (err) {
    if (err.code === 'P2025') return null;
    throw err;
  }
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Return approved reviews for a specific product.
 * Used by the public product page.
 *
 * @param {string} productId
 */
export async function getApprovedReviews(productId) {
  const rows = await prisma.review.findMany({
    where:   { productId, status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mapReview);
}

/**
 * Return all reviews for the admin panel.
 * Includes every status, newest first.
 */
export async function getAllReviews() {
  const rows = await prisma.review.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mapReview);
}
