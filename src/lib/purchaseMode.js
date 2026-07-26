/**
 * src/lib/purchaseMode.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure helpers for a product's purchase mode (Product.purchaseFlow). Shared by
 * the product page so the Add-to-Cart / Buy-Now gating is deterministic and
 * unit-testable. No React/DOM.
 *
 *   "checkout"   → Add to Cart + Buy Now (Buy Now → checkout)   [default]
 *   "inline_cod" → NO Add to Cart; Buy Now scrolls to the embedded COD form
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const PURCHASE_MODE = { CHECKOUT: 'checkout', INLINE_COD: 'inline_cod' };

/** True when the product submits COD directly on the page (no cart / checkout). */
export function isInlineCod(purchaseFlow) {
  return purchaseFlow === PURCHASE_MODE.INLINE_COD;
}

/** Add-to-Cart actions are shown ONLY in checkout mode. */
export function showAddToCart(purchaseFlow) {
  return !isInlineCod(purchaseFlow);
}

/** Buy Now is always available (checkout → redirect, inline_cod → scroll to form). */
export function showBuyNow() {
  return true;
}
