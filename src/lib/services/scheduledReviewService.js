/**
 * src/lib/services/scheduledReviewService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD for the `scheduled_reviews` table.
 *
 * Admin-authored reviews that auto-publish as real customer reviews at
 * `publishAt`. If `intervalHours` > 0 the review re-publishes every N hours
 * (a cron job updates `nextPublishAt` and resets `published`).
 *
 * `images` is stored as Json? — always returned as [] when null.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

// ── Helper ────────────────────────────────────────────────────────────────────

function mapScheduledReview(r) {
  if (!r) return null;
  return {
    _id: r.id,
    ...r,
    // Guarantee images is always an array for consumers
    images: Array.isArray(r.images) ? r.images : [],
  };
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Create a new scheduled review.
 *
 * @param {object}   data
 * @param {string}   data.name
 * @param {string}   [data.phone]
 * @param {number}   data.rating           1–5
 * @param {string}   data.message
 * @param {string[]} [data.images]         image URLs
 * @param {string}   [data.audio]          audio file URL
 * @param {string}   [data.productId]
 * @param {string}   [data.productTitle]
 * @param {string}   [data.publishAt]      ISO datetime string
 * @param {number}   [data.intervalHours]  0 = one-time, >0 = recurring
 */
export async function createScheduledReview(data) {
  const publishAt = data.publishAt ? new Date(data.publishAt) : null;

  const row = await prisma.scheduledReview.create({
    data: {
      name:          data.name,
      phone:         data.phone         ?? null,
      rating:        parseInt(data.rating, 10) || 5,
      message:       data.message,
      images:        Array.isArray(data.images) && data.images.length > 0
                       ? data.images
                       : null,
      audio:         data.audio         ?? null,
      productId:     data.productId     ?? null,
      productTitle:  data.productTitle  ?? null,
      publishAt,
      nextPublishAt: publishAt,
      intervalHours: parseInt(data.intervalHours, 10) || 0,
      published:     false,
    },
  });
  return mapScheduledReview(row);
}

/**
 * Reset a scheduled review so it will publish again on the next cron run.
 * Sets `published = false` — `nextPublishAt` is left for the cron to recalculate.
 *
 * @param {string} id
 */
export async function resetScheduledReview(id) {
  try {
    const row = await prisma.scheduledReview.update({
      where: { id },
      data:  { published: false },
    });
    return mapScheduledReview(row);
  } catch (err) {
    if (err.code === 'P2025') return null; // record not found
    throw err;
  }
}

/**
 * Permanently delete a scheduled review.
 *
 * @param {string} id
 */
export async function deleteScheduledReview(id) {
  try {
    const row = await prisma.scheduledReview.delete({ where: { id } });
    return mapScheduledReview(row);
  } catch (err) {
    if (err.code === 'P2025') return null;
    throw err;
  }
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Return all scheduled reviews for the admin panel, newest first.
 */
export async function getScheduledReviews() {
  const rows = await prisma.scheduledReview.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mapScheduledReview);
}
