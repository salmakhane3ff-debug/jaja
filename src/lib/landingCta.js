/**
 * src/lib/landingCta.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure decision logic for a Landing Page "CTA Button" block. Shared by every CTA
 * surface (all in-page CTA blocks AND the sticky bar) so behaviour is identical
 * and testable regardless of how many CTA blocks a page has. No React/DOM.
 *
 * Priority (the admin's explicit URL ALWAYS wins):
 *   action "redirect" → a Custom URL is set → navigate to it
 *   action "scroll"   → empty Custom URL + an on-page order form exists
 *                       → smooth-scroll to the form (+ focus + highlight)
 *   action "buyNow"   → no URL and no form → the Buy Now (checkout) flow
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function resolveCtaAction({ hasOrderForm, buttonUrl } = {}) {
  if (buttonUrl && String(buttonUrl).trim()) return 'redirect';
  if (hasOrderForm) return 'scroll';
  return 'buyNow';
}

/**
 * A CTA button may be disabled ONLY on the real checkout (buyNow) path. When the
 * action is "scroll" or "redirect" it is NEVER disabled — so one CTA firing (and
 * flipping the shared `buying` flag) can never freeze another CTA instance.
 */
export function isCtaDisabled({ buttonUrl, hasOrderForm, buying, product } = {}) {
  if (resolveCtaAction({ hasOrderForm, buttonUrl }) !== 'buyNow') return false;
  return Boolean(buying) || !product;
}
