/**
 * src/lib/feedbackDisplay.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURE helper for ONE feedback setting: which reviews a product page shows.
 *
 *   'currentProduct' → only feedback linked to the product being viewed
 *   'allProducts'    → every publishable review in the store
 *
 * BACKWARD COMPATIBILITY: the established behaviour in this codebase is
 * current-product-only — `product.jsx` has always passed `productId` to
 * FeedbackSection, which fetches `/api/feedback?productId=…` and filters at the
 * database level. So a missing/invalid setting resolves to 'currentProduct',
 * leaving existing stores byte-for-byte unchanged after deploy.
 *
 * This helper ONLY chooses the data source. Moderation/visibility rules stay in
 * feedbackService.getPublicFeedback (APPROVED, or SCHEDULED whose publishAt has
 * passed) and are never bypassed.
 *
 * No React, no DOM, no I/O → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const PRODUCT_FEEDBACK_SOURCES = Object.freeze(['currentProduct', 'allProducts']);

/** The value used when nothing is saved yet — preserves existing behaviour. */
export const DEFAULT_PRODUCT_FEEDBACK_SOURCE = 'currentProduct';

/**
 * Read the setting off a feedback-settings object.
 * @param {object|null} settings  the `feedback-settings` row (may be partial)
 * @returns {'currentProduct'|'allProducts'}
 */
export function resolveProductFeedbackSource(settings) {
  const v = settings && typeof settings === 'object' ? settings.productFeedbackSource : null;
  return PRODUCT_FEEDBACK_SOURCES.includes(v) ? v : DEFAULT_PRODUCT_FEEDBACK_SOURCE;
}

/**
 * The productId a product page should FILTER the feedback list by.
 * `null` means "do not filter" → the API returns every publishable review.
 *
 * NOTE: this is the FETCH filter only. The review FORM keeps the real productId
 * so newly submitted feedback stays linked to the product being viewed.
 *
 * @param {object|null} settings
 * @param {string|null} productId  the product currently displayed
 * @returns {string|null}
 */
export function feedbackFilterProductId(settings, productId) {
  if (resolveProductFeedbackSource(settings) === 'allProducts') return null;
  return productId || null;
}
