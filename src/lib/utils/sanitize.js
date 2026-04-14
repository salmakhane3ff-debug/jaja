/**
 * src/lib/utils/sanitize.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Zero-dependency HTML/XSS sanitization helpers for plain-text fields.
 *
 * Use these on ANY user-supplied string before storing it in the database,
 * especially for fields that may be rendered in the admin panel or storefront.
 *
 * For rich-text HTML (blog posts, landing-page builder content) use a proper
 * allowlist sanitizer (e.g. DOMPurify on the render side) — these helpers
 * strip ALL tags and are only appropriate for plain-text fields.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Strip all HTML tags and trim whitespace.
 * Converts &, <, > entities to their text equivalents so the raw string
 * is safe to store and display without further escaping.
 *
 * @param {string|null|undefined} value
 * @param {number} [maxLength=500]
 * @returns {string}
 */
export function sanitizeText(value, maxLength = 500) {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, '')          // strip HTML tags
    .replace(/&lt;/gi,   '<')
    .replace(/&gt;/gi,   '>')
    .replace(/&amp;/gi,  '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/javascript:/gi, '')     // strip JS protocol
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize a plain-text field and enforce a max length.
 * Returns null when the input is empty or only whitespace.
 *
 * @param {string|null|undefined} value
 * @param {number} [maxLength=500]
 * @returns {string|null}
 */
export function sanitizeTextOrNull(value, maxLength = 500) {
  const s = sanitizeText(value, maxLength);
  return s.length > 0 ? s : null;
}

/**
 * Block prototype pollution keys at the top level of a plain object.
 * Returns a sanitized shallow copy with dangerous keys removed.
 *
 * @param {object} obj
 * @returns {object}
 */
const POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function blockPrototypePollution(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!POISON_KEYS.has(k)) clean[k] = v;
  }
  return clean;
}
