/**
 * src/lib/productSearch.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Token semantics for the storefront product search.
 *
 * THE BUG THIS FIXES: the feed wrapped the WHOLE raw query in one LIKE pattern
 *     `%${q}%`   →   title ILIKE '%iPhone Apple%'
 * so matching depended on the words appearing contiguously, in the typed order.
 * "iPhone Apple" therefore returned 0 rows even though "Apple iPhone 14 128GB
 * Red" exists, because that exact substring is nowhere in the title.
 *
 * The rule now is token-based and order-independent:
 *
 *     every query token must appear SOMEWHERE in the searchable text
 *
 * The searchable text is the SAME three columns the feed already searched —
 * title, shortDescription, description — concatenated, so a token may be
 * satisfied by any of them. No new field is searched: brand, sku and tags stay
 * out, exactly as before.
 *
 * This module holds the pure half (tokenising + escaping + the reference
 * predicate). The SQL in productService.js applies the identical rule in
 * Postgres, and the tests assert both agree.
 *
 * No React, no DB, no I/O → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Delimiter used to hand the token list to Postgres as ONE bound scalar.
 *
 * A single text parameter keeps the feed statement fully STATIC (one prepared
 * plan, every user value still bound, no driver-specific array encoding). U+0001
 * is a control character that cannot be typed into a search box, and tokenize()
 * strips control characters anyway, so it can never collide with a real token.
 */
export const TOKEN_DELIMITER = '\u0001';

/** Defensive ceiling: a pathological query must not produce 500 LIKE tests. */
export const MAX_TOKENS = 12;

/**
 * Split a raw query into search tokens.
 *
 * Lower-cased (matching is case-insensitive), whitespace-collapsed, control
 * characters removed, de-duplicated, and capped. Returns [] for anything with
 * no usable token, which callers treat as "no search filter".
 *
 * @param {string} q
 * @returns {string[]}
 */
export function tokenize(q) {
  if (typeof q !== 'string') return [];
  const cleaned = q
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .toLowerCase();
  if (!cleaned) return [];

  const out = [];
  for (const raw of cleaned.split(/\s+/)) {
    if (!raw) continue;
    if (!out.includes(raw)) out.push(raw);
    if (out.length >= MAX_TOKENS) break;
  }
  return out;
}

/**
 * Escape LIKE wildcards so a literal % or _ typed into the box stays literal.
 * Backslash is escaped first — it is LIKE's default escape character.
 */
export function escapeLike(token) {
  return String(token ?? '').replace(/([\\%_])/g, '\\$1');
}

/**
 * The single bound parameter the feed SQL receives: escaped tokens joined by
 * TOKEN_DELIMITER, or null when there is nothing to search for (which switches
 * the search predicate off entirely).
 *
 * @param {string} q
 * @returns {string|null}
 */
export function searchParam(q) {
  const tokens = tokenize(q);
  if (tokens.length === 0) return null;
  return tokens.map(escapeLike).join(TOKEN_DELIMITER);
}

/**
 * The searchable text for one product — the same three fields the SQL
 * concatenates, in the same order.
 */
export function searchableText(product) {
  if (!product || typeof product !== 'object') return '';
  return [product.title, product.shortDescription, product.description]
    .map((v) => (typeof v === 'string' ? v : ''))
    .join(' ')
    .toLowerCase();
}

/**
 * Reference predicate — the exact rule the SQL implements.
 *
 * Order-independent: every token must be present, anywhere, in any order.
 * An empty query matches everything (no filter applied).
 */
export function matchesQuery(product, q) {
  const tokens = tokenize(q);
  if (tokens.length === 0) return true;
  const text = searchableText(product);
  return tokens.every((tok) => text.includes(tok));
}

/** Filter a list with the same rule. Never mutates the input. */
export function filterByQuery(products, q) {
  const list = Array.isArray(products) ? products : [];
  const tokens = tokenize(q);
  if (tokens.length === 0) return list.slice();
  return list.filter((p) => matchesQuery(p, q));
}
