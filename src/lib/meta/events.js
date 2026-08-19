/**
 * src/lib/meta/events.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Event vocabulary, deterministic event IDs, and the rule that decides WHEN an
 * order counts as a Meta Purchase.
 *
 * DEDUPLICATION: Meta collapses a browser event and a server event when both
 * carry the same (event_name, event_id) within 48 h. That only works if the two
 * sides derive the id from the same stable input, so every id here is a pure
 * function of the order — never Date.now(), never Math.random(). The previous
 * code did this correctly for Purchase and is preserved.
 *
 * PURCHASE SEMANTICS: order creation does NOT mean "paid" for every payment
 * method in this store, and reporting a bank transfer as revenue the moment the
 * customer picks it inflates ROAS. The rule is encoded explicitly below and is
 * INDEPENDENT of the Bemob CONFIRMED trigger, which is untouched.
 *
 * No React, no DB, no I/O → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The only event names this integration will ever send. Used as an allow-list. */
export const EVENT_NAMES = Object.freeze([
  'PageView',
  'ViewContent',
  'AddToCart',
  'InitiateCheckout',
  'Purchase',
]);

export function isAllowedEvent(name) {
  return typeof name === 'string' && EVENT_NAMES.includes(name);
}

// ── Event IDs ────────────────────────────────────────────────────────────────

/**
 * The canonical Purchase event id. Browser and CAPI both call this with the
 * same order id, so both sides produce the identical string.
 *
 * Contains only the order UUID — no secret, no token, no PII.
 */
export function purchaseEventId(orderId) {
  const id = typeof orderId === 'string' ? orderId.trim() : String(orderId ?? '').trim();
  return id ? `purchase_${id}` : null;
}

/**
 * A deterministic id for a non-purchase event.
 *
 * `scope` is whatever makes the event unique within one page view — a product
 * id for ViewContent, a cart signature for InitiateCheckout. `nonce` is the
 * per-page-view token minted by the browser helper, so two genuine views of the
 * same product produce two different ids while a re-render produces one.
 */
export function scopedEventId(eventName, scope, nonce) {
  if (!isAllowedEvent(eventName)) return null;
  const parts = [eventName.toLowerCase(), String(scope ?? '').trim(), String(nonce ?? '').trim()]
    .filter(Boolean);
  return parts.length >= 2 ? parts.join('_') : null;
}

// ── Purchase eligibility ─────────────────────────────────────────────────────

/**
 * Payment methods this store treats as "the money is committed at order time".
 * Cash on delivery is the store's normal flow: the customer has ordered and the
 * courier collects on handover, so the conversion is real at creation.
 */
const COD_METHODS = Object.freeze(['cod']);

/**
 * Payment methods that are only a Purchase once payment is actually verified.
 * `bank_transfer` and `cod_deposit` both leave the order pending with a
 * "Complete Payment" call to action until an admin confirms the transfer.
 */
const PREPAID_METHODS = Object.freeze(['bank_transfer', 'cod_deposit']);

/** Normalised payment-method token ("COD" and "cod" are the same thing). */
export function paymentMethodKey(raw) {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

/**
 * Does this order qualify as a Meta Purchase right now?
 *
 * @param {object} order  { paymentMethod, status, paymentStatus }
 * @returns {{eligible: boolean, reason: string}}
 *
 * Reasons are stable strings so tests and logs can assert on them without
 * exposing any order data.
 */
export function purchaseEligibility(order) {
  if (!order || typeof order !== 'object') return { eligible: false, reason: 'no_order' };

  // Fake orders (affiliate motivation engine) are excluded from every external
  // integration, exactly as they already are from Bemob and CAPI.
  if (order.isFake === true || paymentMethodKey(order.orderSource) === 'fake') {
    return { eligible: false, reason: 'fake_order' };
  }

  const status = paymentMethodKey(order.status);
  if (status === 'cancelled' || status === 'failed') {
    return { eligible: false, reason: 'order_not_live' };
  }

  const paymentStatus = paymentMethodKey(order.paymentStatus);
  // Payment verified is sufficient for ANY method.
  if (paymentStatus === 'success' || paymentStatus === 'paid') {
    return { eligible: true, reason: 'payment_confirmed' };
  }
  // An admin-confirmed order is a real sale whatever the method.
  if (status === 'confirmed' || status === 'shipped' || status === 'delivered') {
    return { eligible: true, reason: 'order_confirmed' };
  }

  const method = paymentMethodKey(order.paymentMethod);
  if (COD_METHODS.includes(method)) {
    return { eligible: true, reason: 'cod_on_creation' };
  }
  if (PREPAID_METHODS.includes(method)) {
    return { eligible: false, reason: 'awaiting_payment' };
  }

  // Unknown method with nothing else to go on — do not claim revenue.
  return { eligible: false, reason: 'unknown_payment_method' };
}

/** Convenience boolean. */
export function isPurchaseEligible(order) {
  return purchaseEligibility(order).eligible;
}
