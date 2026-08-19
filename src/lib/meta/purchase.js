"use client";

/**
 * src/lib/meta/purchase.js
 * ─────────────────────────────────────────────────────────────────────────────
 * THE single client entry point for a Meta Purchase. Every checkout flow calls
 * this and nothing else — the success page, inline COD on a product page, and
 * the landing/offer order form all share it, so there is exactly one Purchase
 * implementation rather than a copy per flow.
 *
 * Two halves, one event:
 *   • browser pixel — fired through the canonical helper with eventID
 *   • CAPI          — a POST carrying ONLY the order id plus the _fbp/_fbc
 *                     cookies; the server loads the order and decides value,
 *                     contents, PII and eligibility itself
 *
 * Both use purchaseEventId(orderId), so Meta deduplicates them into one
 * conversion. Nothing here decides whether the order is "paid" — that is the
 * server's call (see lib/meta/events.js purchaseEligibility), which is why the
 * browser half is also gated on the same rule before firing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { metaTrack, hasSent } from './browser.js';
import { purchaseEventId, isPurchaseEligible } from './events.js';
import {
  STORE_CURRENCY, toNumericValue, buildContents, buildContentIds, totalQuantity,
} from './normalize.js';

/** Read a cookie without throwing in restricted contexts. */
function readCookie(name) {
  if (typeof document === 'undefined') return null;
  try {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Report a completed purchase to Meta.
 *
 * Safe to call more than once for the same order: the browser half is guarded
 * by the shared event id, and the server half is guarded by a database claim.
 *
 * @param {object} order  { _id|id, paymentMethod, status, paymentStatus, items[], total }
 * @returns {{fired: boolean, reason?: string, eventId?: string}}
 */
export function trackPurchase(order) {
  const orderId = order?._id ?? order?.id ?? null;
  const eventId = purchaseEventId(orderId);
  if (!eventId) return { fired: false, reason: 'no_order_id' };

  // Same rule the server applies, so a bank transfer awaiting verification does
  // not flash a browser Purchase that CAPI then refuses to confirm.
  if (!isPurchaseEligible(order)) return { fired: false, reason: 'not_eligible', eventId };

  const alreadyFired = hasSent(eventId);

  const items = Array.isArray(order.items) ? order.items : [];
  const value = toNumericValue(order.total ?? order.paymentTotal);
  const contents = buildContents(items);
  const ids = buildContentIds(items);

  metaTrack(
    'Purchase',
    {
      ...(value === null ? {} : { value }),
      currency: STORE_CURRENCY,
      ...(ids.length ? { content_ids: ids, content_type: 'product' } : {}),
      ...(contents.length ? { contents } : {}),
      num_items: totalQuantity(items),
      order_id: String(orderId),
    },
    { eventId },
  );

  // The CAPI half is fire-and-forget: the order is already safely created, so
  // checkout UI never waits on Meta. The server is idempotent, so calling it
  // again after a refresh is harmless.
  sendPurchaseToCapi(orderId);

  return { fired: !alreadyFired, eventId };
}

/**
 * POST the purchase to our own server, which owns the authoritative payload.
 * Deliberately sends no value, no contents and no PII — a crafted request must
 * not be able to invent revenue.
 */
export function sendPurchaseToCapi(orderId) {
  if (typeof window === 'undefined' || !orderId) return;
  try {
    fetch('/api/facebook/capi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,           // survives the navigation away from checkout
      body: JSON.stringify({
        event_name: 'Purchase',
        order_id: String(orderId),
        event_source_url: window.location.href,
        user_agent: navigator.userAgent,
        fbp: readCookie('_fbp'),
        fbc: readCookie('_fbc'),
      }),
    }).catch(() => {});
  } catch { /* tracking must never break a completed checkout */ }
}

/** Send the server-side ViewContent counterpart for a product page view. */
export function sendViewContentToCapi(productId, eventId) {
  if (typeof window === 'undefined' || !productId || !eventId) return;
  try {
    fetch('/api/facebook/capi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: 'ViewContent',
        product_id: String(productId),
        event_id: eventId,
        event_source_url: window.location.href,
        user_agent: navigator.userAgent,
        fbp: readCookie('_fbp'),
        fbc: readCookie('_fbc'),
      }),
    }).catch(() => {});
  } catch { /* non-fatal */ }
}
