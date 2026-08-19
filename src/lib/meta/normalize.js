/**
 * src/lib/meta/normalize.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURE normalisation for Meta payloads — user_data PII, monetary values and
 * ecommerce contents. No crypto, no DB, no DOM: hashing happens server-side in
 * capi.js, and this module only decides WHAT the canonical value is.
 *
 * Meta requires PII to be normalised BEFORE hashing (lower-cased, trimmed,
 * punctuation stripped for phones). Getting that wrong does not error — it
 * silently produces a hash that matches nothing, which is why the previous
 * `phone.replace(/\D/g,'')` was a real defect: a Moroccan `0612345678` hashed
 * as "0612345678" while Meta stores "212612345678".
 *
 * No React, no DB, no I/O → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The store prices exclusively in Moroccan dirham. One canonical literal. */
export const STORE_CURRENCY = 'MAD';

/** Morocco's calling code, and the local trunk prefix that replaces it. */
const MA_CC = '212';

// ── Phone ────────────────────────────────────────────────────────────────────

/**
 * Normalise a phone number to digits-only E.164 (no `+`), as Meta expects.
 *
 * Handles the forms this checkout actually receives:
 *   0612345678      → 212612345678   (national, trunk 0 replaced by 212)
 *   06 12 34 56 78  → 212612345678   (separators stripped)
 *   612345678       → 212612345678   (9-digit mobile, trunk 0 omitted)
 *   +212612345678   → 212612345678   (already international)
 *   00212612345678  → 212612345678   (00 international prefix)
 *   212612345678    → 212612345678   (unchanged)
 *   +33612345678    → 33612345678    (foreign — 212 is NOT prepended)
 *
 * Returns null for anything too short to be a real number, so an empty or junk
 * value is never hashed and sent.
 *
 * @param {string} raw
 * @returns {string|null}
 */
export function normalizePhone(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Remember whether the caller told us this is already international BEFORE
  // stripping, so a foreign number is never given a Moroccan country code.
  let international = false;
  if (s.startsWith('+')) { international = true; s = s.slice(1); }

  s = s.replace(/\D/g, '');
  if (!s) return null;

  if (s.startsWith('00')) { international = true; s = s.slice(2); }

  // Already Moroccan international.
  if (s.startsWith(MA_CC) && s.length >= 11 && s.length <= 12) return s;

  if (!international) {
    // National form: 0XXXXXXXXX (10 digits) → drop the trunk 0, add 212.
    if (s.length === 10 && s.startsWith('0')) return MA_CC + s.slice(1);
    // Mobile typed without the trunk 0: 6XXXXXXXX / 7XXXXXXXX (9 digits).
    if (s.length === 9 && /^[5-7]/.test(s)) return MA_CC + s;
  }

  // Anything else is treated as already carrying its own country code — never
  // guess, never prepend. Below 8 digits it cannot be a real number.
  return s.length >= 8 ? s : null;
}

// ── Email ────────────────────────────────────────────────────────────────────

/**
 * Trim + lower-case an email, rejecting anything that is obviously not one.
 * Deliberately permissive on the local part: the goal is to avoid hashing
 * garbage, not to validate deliverability.
 */
export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s)) return null;
  return s;
}

// ── Names / place ────────────────────────────────────────────────────────────

/** Lower-cased, punctuation-free single name token. */
export function normalizeName(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return s || null;
}

/** Split a full name into { fn, ln }. Either half may be null. */
export function splitFullName(raw) {
  if (typeof raw !== 'string') return { fn: null, ln: null };
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { fn: null, ln: null };
  if (parts.length === 1) return { fn: normalizeName(parts[0]), ln: null };
  return { fn: normalizeName(parts[0]), ln: normalizeName(parts[parts.length - 1]) };
}

/** City / state: lower-cased, spaces and punctuation removed (Meta's rule). */
export function normalizeCity(raw) {
  return normalizeName(raw);
}

/** ISO-3166 alpha-2, lower-cased. Defaults to Morocco for this store. */
export function normalizeCountry(raw, fallback = 'ma') {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const s = raw.trim().toLowerCase();
  return /^[a-z]{2}$/.test(s) ? s : fallback;
}

/** Postcode: digits and letters only, lower-cased. */
export function normalizeZip(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return s || null;
}

// ── Money ────────────────────────────────────────────────────────────────────

/**
 * Coerce a monetary value to a finite non-negative number rounded to 2dp.
 *
 * Accepts the formatted strings this codebase produces ("120 DH", "1 234,50")
 * because a string like that reaching Meta as `value` is silently dropped.
 * Returns null when there is no usable number — callers omit `value` rather
 * than sending 0, which would report a free purchase.
 */
export function toNumericValue(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) / 100 : null;
  }
  if (typeof raw !== 'string') return null;

  // Strip currency words/symbols and spaces, then normalise the decimal mark.
  let s = raw.replace(/[^\d.,-]/g, '').trim();
  if (!/\d/.test(s)) return null;
  // "1.234,50" → "1234.50" ; "1,234.50" → "1234.50" ; "120,50" → "120.50"
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = /,\d{3}\b/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }

  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

// ── Ecommerce contents ───────────────────────────────────────────────────────

/**
 * The canonical catalogue identifier for a product or order line.
 *
 * The storefront maps every Prisma row through mapProduct(), which exposes the
 * UUID as `_id`; order lines carry the same UUID as `productId`. Those are the
 * same value, and it is the only identifier present on every surface — slug and
 * SKU are optional. Everything (ViewContent, AddToCart, InitiateCheckout,
 * Purchase) therefore keys on it, so Meta sees one consistent content_id space.
 */
export function contentId(item) {
  if (!item || typeof item !== 'object') return null;
  const id = item.productId ?? item._id ?? item.id ?? null;
  const s = id === null || id === undefined ? '' : String(id).trim();
  return s || null;
}

/**
 * Build Meta `contents[]` from cart/order lines.
 * Lines with no usable identifier are dropped rather than sent as "".
 *
 * @returns {Array<{id:string, quantity:number, item_price:number}>}
 */
export function buildContents(items) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  for (const it of list) {
    const id = contentId(it);
    if (!id) continue;
    const qty = Math.max(1, Math.trunc(Number(it.quantity) || 1));
    const price = toNumericValue(it.price ?? it.salePrice ?? it.sellingPrice ?? it.item_price);
    out.push({ id, quantity: qty, ...(price === null ? {} : { item_price: price }) });
  }
  return out;
}

/** content_ids matching buildContents, in the same order, de-duplicated. */
export function buildContentIds(items) {
  const out = [];
  for (const c of buildContents(items)) if (!out.includes(c.id)) out.push(c.id);
  return out;
}

/** Total units across the lines. */
export function totalQuantity(items) {
  return buildContents(items).reduce((sum, c) => sum + c.quantity, 0);
}

/** Σ(item_price × quantity), or null when no line carries a price. */
export function contentsValue(items) {
  const contents = buildContents(items);
  let sum = 0, seen = false;
  for (const c of contents) {
    if (typeof c.item_price !== 'number') continue;
    seen = true;
    sum += c.item_price * c.quantity;
  }
  return seen ? Math.round(sum * 100) / 100 : null;
}

// ── fbc / fbp ────────────────────────────────────────────────────────────────

/** A `_fbp` cookie value looks like fb.1.<ms>.<random>. */
export function isValidFbp(v) {
  return typeof v === 'string' && /^fb\.\d\.\d+\.\d+$/.test(v.trim());
}

/** A `_fbc` cookie value looks like fb.1.<ms>.<fbclid>. */
export function isValidFbc(v) {
  return typeof v === 'string' && /^fb\.\d\.\d+\..+$/.test(v.trim());
}

/**
 * Derive an `fbc` value from an fbclid, in Meta's documented format.
 *
 * ONLY used when the click really carried an fbclid and the browser had not yet
 * written the `_fbc` cookie — never invented out of nothing, because a
 * fabricated fbc destroys attribution rather than improving it.
 *
 * @param {string} fbclid
 * @param {number} timestampMs  when the click was observed
 */
export function deriveFbc(fbclid, timestampMs) {
  if (typeof fbclid !== 'string' || !fbclid.trim()) return null;
  const ts = Number(timestampMs);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  return `fb.1.${Math.trunc(ts)}.${fbclid.trim()}`;
}
