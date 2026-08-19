/**
 * src/lib/meta/idempotency.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SERVER-AUTHORITATIVE guard: one order produces at most one delivered Meta
 * Purchase, no matter how many times the success page is refreshed, reopened,
 * shared, retried or re-rendered.
 *
 * WHY NOT localStorage: the previous guard was `localStorage["fb_purchase_<id>"]`,
 * which is per-browser. Admin order pages and abandoned-recovery messages build
 * /checkout/success?orderId=… links, so an admin opening one — or the customer
 * opening it on a second device — fired Purchase again.
 *
 * WHY NO MIGRATION: this reuses the existing generic `Setting` table, whose `id`
 * is a String PRIMARY KEY. `create()` on an existing id raises P2002, which is
 * an atomic compare-and-set — exactly what a claim needs, with no schema change.
 * The rows are keyed `meta-purchase:<orderId>`; settingsService only ever reads
 * by exact id and nothing enumerates the table, so they are invisible to the
 * admin settings UI.
 *
 * THE BEMOB PRINCIPLE, NOT BEMOB'S FIELDS: success is recorded ONLY after Meta
 * accepts the request, so a failed delivery stays retryable. `bemobConversionSentAt`
 * and `bemobConversionStatus` are never read or written here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

/** Settings-row key space. Namespaced so it can never collide with a real setting. */
export const KEY_PREFIX = 'meta-purchase:';

/** A claim older than this is assumed dead (crashed request) and may be retaken. */
export const STALE_CLAIM_MS = 60_000;

export const CLAIM = Object.freeze({
  CLAIMED: 'claimed',            // caller owns delivery, proceed
  ALREADY_SENT: 'already_sent',  // a previous attempt succeeded — do nothing
  IN_FLIGHT: 'in_flight',        // another request is delivering right now
  ERROR: 'error',                // storage unavailable — caller decides
});

export function purchaseKey(orderId) {
  const id = String(orderId ?? '').trim();
  return id ? `${KEY_PREFIX}${id}` : null;
}

/**
 * Decide what to do with an existing claim record. Pure, so the retry policy is
 * testable without a database.
 *
 * @param {object|null} record  the stored `data` blob
 * @param {number} now
 */
export function evaluateExistingClaim(record, now = Date.now()) {
  if (!record || typeof record !== 'object') return CLAIM.CLAIMED;   // corrupt → retry
  if (record.status === 'sent') return CLAIM.ALREADY_SENT;
  if (record.status === 'sending') {
    const startedAt = Number(record.at) || 0;
    return now - startedAt > STALE_CLAIM_MS ? CLAIM.CLAIMED : CLAIM.IN_FLIGHT;
  }
  // 'failed' or anything else → a fresh attempt is legitimate.
  return CLAIM.CLAIMED;
}

/**
 * Atomically claim delivery for one order.
 *
 * @returns {Promise<{status:string}>} CLAIM.* — only CLAIMED may proceed to send.
 */
export async function claimPurchase(orderId, deps = {}) {
  const db = deps.prisma || prisma;
  const key = purchaseKey(orderId);
  if (!key) return { status: CLAIM.ERROR };

  const now = deps.now ?? Date.now();

  try {
    await db.setting.create({ data: { id: key, data: { status: 'sending', at: now } } });
    return { status: CLAIM.CLAIMED };            // we created it → we own it
  } catch (err) {
    if (err?.code !== 'P2002') {
      console.error('[meta] claim failed for order', orderId, ':', err?.message ?? err);
      return { status: CLAIM.ERROR };
    }
  }

  // The row already exists — decide whether this attempt may take it over.
  try {
    const row = await db.setting.findUnique({ where: { id: key } });
    const decision = evaluateExistingClaim(row?.data, now);
    if (decision !== CLAIM.CLAIMED) return { status: decision };

    await db.setting.update({ where: { id: key }, data: { data: { status: 'sending', at: now } } });
    return { status: CLAIM.CLAIMED };
  } catch (err) {
    console.error('[meta] claim takeover failed for order', orderId, ':', err?.message ?? err);
    return { status: CLAIM.ERROR };
  }
}

/** Record a SUCCESSFUL delivery. Only ever called after Meta returned 2xx. */
export async function markPurchaseSent(orderId, info = {}, deps = {}) {
  const db = deps.prisma || prisma;
  const key = purchaseKey(orderId);
  if (!key) return false;
  try {
    await db.setting.update({
      where: { id: key },
      data: { data: { status: 'sent', at: deps.now ?? Date.now(), received: Number(info.received) || 0 } },
    });
    return true;
  } catch (err) {
    console.error('[meta] could not record sent state for order', orderId, ':', err?.message ?? err);
    return false;
  }
}

/**
 * Record a FAILED delivery so the next legitimate attempt can retry.
 * `reason` is a fixed code from capi.js — never an upstream body, never PII.
 */
export async function markPurchaseFailed(orderId, reason, deps = {}) {
  const db = deps.prisma || prisma;
  const key = purchaseKey(orderId);
  if (!key) return false;
  try {
    await db.setting.update({
      where: { id: key },
      data: { data: { status: 'failed', at: deps.now ?? Date.now(), reason: String(reason || 'unknown') } },
    });
    return true;
  } catch (err) {
    console.error('[meta] could not record failed state for order', orderId, ':', err?.message ?? err);
    return false;
  }
}

/** Current delivery state, for diagnostics. Never used as the claim itself. */
export async function readPurchaseState(orderId, deps = {}) {
  const db = deps.prisma || prisma;
  const key = purchaseKey(orderId);
  if (!key) return null;
  try {
    const row = await db.setting.findUnique({ where: { id: key } });
    return row?.data ?? null;
  } catch {
    return null;
  }
}
