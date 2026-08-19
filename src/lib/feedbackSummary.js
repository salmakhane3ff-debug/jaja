/**
 * src/lib/feedbackSummary.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The tiny rating summary shown under a product title:  ★★★★★ 5 (18)
 *
 * WHY THIS EXISTS: the product header used to take its count from the feedback
 * SECTION at the bottom of the page, via onStatsLoaded. That meant "(18)"
 * could not appear until the section had downloaded every review — a payload
 * that reaches megabytes because customer-submitted photos are stored as base64
 * data URLs — so the number arrived seconds after the stars. The header now
 * asks for two numbers instead.
 *
 * It also fixes a quiet correctness bug: getPublicFeedback() caps at `take: 50`,
 * so a product with more than 50 reviews reported 50. A COUNT aggregate does not.
 *
 * WHICH reviews are counted is NOT decided here — the caller passes the product
 * id that feedbackFilterProductId() already resolved from `productFeedbackSource`,
 * so the summary always covers exactly the reviews the section lists.
 *
 * No React, no DOM, no I/O → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The only fields a rating summary may carry. Nothing heavy, ever. */
export const SUMMARY_FIELDS = Object.freeze(['avg', 'count']);

/** A zero summary — used before the fetch resolves and for empty results. */
export const EMPTY_SUMMARY = Object.freeze({ avg: 0, count: 0 });

/**
 * The stats URL for a given filter.
 *
 * @param {string|null} productId  the value feedbackFilterProductId() returned:
 *   a product id  → count only that product's reviews (currentProduct)
 *   null          → count every publishable review (allProducts)
 */
export function statsUrl(productId) {
  const id = typeof productId === 'string' ? productId.trim() : '';
  return id ? `/api/feedback/stats?productId=${encodeURIComponent(id)}` : '/api/feedback/stats';
}

/**
 * Coerce a stats response into exactly { avg, count }.
 * Any extra key on the wire is dropped, so a heavy field can never leak into
 * the header path even if the endpoint later grows one.
 */
export function normalizeSummary(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_SUMMARY };
  const avg = Number(raw.avg);
  const count = Number(raw.count);
  return {
    avg:   Number.isFinite(avg) && avg > 0 ? Math.round(avg * 10) / 10 : 0,
    count: Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0,
  };
}

/**
 * Round a DB average the way the header displays it (one decimal).
 * Shared by the endpoint so server and client never disagree.
 */
export function roundAverage(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 10) / 10;
}

/** True when the object carries only `avg` and `count`. Guards the payload. */
export function isSummaryShape(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const keys = Object.keys(obj).sort();
  return keys.length === SUMMARY_FIELDS.length &&
         keys.every((k, i) => k === [...SUMMARY_FIELDS].sort()[i]);
}
