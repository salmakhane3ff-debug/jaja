/**
 * src/lib/services/spinWheelService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks spin wheel events in the `spin_events` table.
 *
 * Spin wheel config (segments, trigger settings, etc.) is stored separately
 * in the `settings` table via settingsService (type = "spin-wheel").
 *
 * Lifecycle of a spin event:
 *   1. User spins → createSpinEvent()
 *   2. User clicks "copy code" → markPromoCopied()
 *   3. User completes checkout with promo → markSpinOrdered()
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

// ── Helper ────────────────────────────────────────────────────────────────────

function mapEvent(e) {
  if (!e) return null;
  return {
    _id: e.id,
    ...e,
  };
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Record a new spin.
 * Called client-side immediately after the wheel stops.
 *
 * @param {object} data
 * @param {string} [data.sessionId]  browser session token (dedup guard)
 * @param {string} [data.prize]      winning segment label
 * @param {string} [data.prizeType]  "none" | "promo" | "text" | "product"
 * @param {string} [data.promoCode]  generated discount code (prizeType = "promo")
 * @param {string} [data.ipAddress]
 * @param {string} [data.userAgent]
 */
export async function createSpinEvent(data) {
  const row = await prisma.spinEvent.create({
    data: {
      sessionId: data.sessionId ?? null,
      prize:     data.prize     ?? null,
      prizeType: data.prizeType ?? 'none',
      promoCode: data.promoCode ?? null,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
    },
  });
  return mapEvent(row);
}

/**
 * Mark that the user copied their promo code.
 * Identified by sessionId — update the most recent matching spin.
 *
 * @param {string} sessionId
 */
export async function markPromoCopied(sessionId) {
  // Find the latest spin for this session
  const spin = await prisma.spinEvent.findFirst({
    where:   { sessionId },
    orderBy: { createdAt: 'desc' },
  });
  if (!spin) return null;

  const row = await prisma.spinEvent.update({
    where: { id: spin.id },
    data:  { copied: true },
  });
  return mapEvent(row);
}

/**
 * Mark that an order was placed using this spin's promo code.
 * Links the orderId so we can trace spin → order.
 *
 * @param {string} promoCode
 * @param {string} orderId
 */
export async function markSpinOrdered(promoCode, orderId) {
  // Find the spin that generated this promo code (most recent, not yet ordered)
  const spin = await prisma.spinEvent.findFirst({
    where:   { promoCode, ordered: false },
    orderBy: { createdAt: 'desc' },
  });
  if (!spin) return null;

  const row = await prisma.spinEvent.update({
    where: { id: spin.id },
    data:  { ordered: true, orderId },
  });
  return mapEvent(row);
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Return aggregate stats for the admin dashboard.
 * Counts are computed in a single DB round-trip via groupBy/aggregate.
 */
export async function getSpinStats() {
  const [total, copied, ordered] = await Promise.all([
    prisma.spinEvent.count(),
    prisma.spinEvent.count({ where: { copied: true } }),
    prisma.spinEvent.count({ where: { ordered: true } }),
  ]);

  // Recent 50 spins for the admin events table
  const recent = await prisma.spinEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take:    50,
  });

  return {
    total,
    copied,
    ordered,
    recent: recent.map(mapEvent),
  };
}
