/**
 * src/lib/duplicates.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure logic for the Duplicate Listings Detector. No DB, no React — testable
 * with plain Node.
 *
 * DESIGN: detection NEVER compares products pairwise. Every signal is a *blocking
 * key* computed per row; products sharing a key form a candidate group. Postgres
 * does the grouping (GROUP BY … HAVING count(*) > 1), so cost is O(n log n) in
 * the database and this module only ever sees the resulting groups — never the
 * catalogue.
 *
 * The SQL_* constants below are the expressions the service groups by; the JS
 * functions beside them mirror the same rules for tests and display. They are
 * deliberately adjacent: if you change one, change the other.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Confidence ────────────────────────────────────────────────────────────────

export const CONFIDENCE = { HIGH: "high", MEDIUM: "medium", LOW: "low" };
const RANK = { high: 3, medium: 2, low: 1 };

// Every deterministic signal. V1 is equality-only: no fuzzy matching, no
// PostgreSQL extensions (no pg_trgm), so this runs on a stock database.
export const SIGNALS = {
  title:      { confidence: CONFIDENCE.HIGH,   reason: "identical_title" },
  sku:        { confidence: CONFIDENCE.HIGH,   reason: "identical_sku" },
  barcode:    { confidence: CONFIDENCE.HIGH,   reason: "identical_barcode" },
  normalized: { confidence: CONFIDENCE.MEDIUM, reason: "normalized_title" },
  image:      { confidence: CONFIDENCE.MEDIUM, reason: "same_first_image" },
  attributes: { confidence: CONFIDENCE.LOW,    reason: "same_brand_collections_price" },
};

export const CONFIDENCE_ORDER = [CONFIDENCE.HIGH, CONFIDENCE.MEDIUM, CONFIDENCE.LOW];

// A group's confidence is its STRONGEST signal: an identical SKU stays "high"
// even when a weak signal also matched. Unknown signals are ignored, never
// silently promoted.
export function confidenceOf(signals) {
  let best = null;
  for (const s of signals || []) {
    const meta = SIGNALS[s];
    if (!meta) continue;
    if (!best || RANK[meta.confidence] > RANK[best]) best = meta.confidence;
  }
  return best;
}

export function reasonsOf(signals) {
  return (signals || []).filter((s) => SIGNALS[s]).map((s) => SIGNALS[s].reason);
}

// ── Blocking keys ─────────────────────────────────────────────────────────────

export const PRICE_BUCKET_SIZE = 10; // MAD — "similar price" band for the low tier

// Identical title (high). Case- and whitespace-insensitive only.
export const SQL_TITLE_KEY = `lower(btrim(title))`;
export function titleKey(title) {
  return typeof title === "string" ? title.trim().toLowerCase() : "";
}

// Normalized title (medium): drops the "(Copy)" the admin's Duplicate button
// appends, and folds punctuation so "Lampe LED - 5W" == "lampe led 5w".
export const SQL_NORMALIZED_TITLE_KEY =
  `lower(btrim(regexp_replace(regexp_replace(title, '\\(\\s*copy\\s*\\)', ' ', 'gi'), '[^[:alnum:]]+', ' ', 'g')))`;
export function normalizedTitleKey(title) {
  if (typeof title !== "string") return "";
  return title
    .replace(/\(\s*copy\s*\)/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

// SKU / barcode (high). Empty strings MUST NOT group: the Duplicate button sets
// sku:"", so without this every copied product would "match" every other one.
export function referenceKey(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// First image (medium). `images` holds URL strings OR {url} objects — the detail
// page reads `images[0]?.url || images[0]` — so both shapes are handled here.
export function firstImageUrl(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  const first = images[0];
  if (typeof first === "string") return first.trim() || null;
  if (first && typeof first === "object" && typeof first.url === "string") return first.url.trim() || null;
  return null;
}

// Filename only: the same asset reached through a different CDN host or with a
// cache-busting query string is still the same asset.
export function firstImageFilename(images) {
  const url = firstImageUrl(images);
  if (!url) return null;
  const withoutQuery = url.split("?")[0].split("#")[0];
  const name = withoutQuery.split("/").filter(Boolean).pop();
  return name ? name.toLowerCase() : null;
}

// Collections signature (low): order-insensitive, case-insensitive.
export function collectionsSignature(collections) {
  if (!Array.isArray(collections)) return null;
  const cleaned = [...new Set(
    collections.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim().toLowerCase())
  )].sort();
  return cleaned.length ? cleaned.join("|") : null;
}

export function priceBucket(price, size = PRICE_BUCKET_SIZE) {
  // Reject absent values explicitly: Number(null) and Number("") are BOTH 0, so
  // a priceless product would otherwise land in bucket 0 and group with products
  // that genuinely cost nothing.
  if (price === null || price === undefined || price === "") return null;
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n / size);
}

// ── Group identity ────────────────────────────────────────────────────────────

// Canonical, order-independent identity of a group's member set. Also the
// DuplicateIgnore.groupKey, so ignoring is per member-set.
export function groupKeyOf(ids) {
  return [...new Set((ids || []).filter(Boolean))].sort().join("|");
}

// Identifies the *state* of the members. Built from updatedAt, so editing ANY
// product in an ignored group changes the fingerprint and the group resurfaces.
export function fingerprintOf(members) {
  return (members || [])
    .map((m) => {
      const at = m.updatedAt instanceof Date ? m.updatedAt.toISOString() : String(m.updatedAt ?? "");
      return `${m.id}:${at}`;
    })
    .sort()
    .join("|");
}

// ── Grouping ──────────────────────────────────────────────────────────────────

/**
 * Fold the per-signal SQL groups into review groups.
 *
 * Groups are keyed by MEMBER SET, not by signal: one pair found by both
 * `title` and `image` becomes ONE group listing both reasons. Sets that merely
 * overlap stay separate — "this pair shares a title" and "this trio shares an
 * image" are genuinely different findings, and merging them transitively would
 * let a weak signal drag unrelated products into a high-confidence group.
 *
 * @param {{signal: string, key: string, ids: string[]}[]} signalGroups
 */
export function mergeSignalGroups(signalGroups) {
  const byMembers = new Map();

  for (const g of signalGroups || []) {
    if (!g || !SIGNALS[g.signal]) continue;
    const ids = [...new Set((g.ids || []).filter(Boolean))].sort();
    if (ids.length < 2) continue;              // a group needs at least two products

    const groupKey = groupKeyOf(ids);
    let cluster = byMembers.get(groupKey);
    if (!cluster) {
      cluster = { groupKey, productIds: ids, signals: [], matchedKeys: {} };
      byMembers.set(groupKey, cluster);
    }
    if (!cluster.signals.includes(g.signal)) cluster.signals.push(g.signal);
    cluster.matchedKeys[g.signal] = g.key;
  }

  return [...byMembers.values()]
    .map((c) => ({
      ...c,
      confidence: confidenceOf(c.signals),
      reasons: reasonsOf(c.signals),
    }))
    .sort((a, b) =>
      RANK[b.confidence] - RANK[a.confidence] ||
      b.productIds.length - a.productIds.length ||
      a.groupKey.localeCompare(b.groupKey));
}

/**
 * Attach hydrated products and drop groups that no longer hold up.
 * Products deleted since grouping simply vanish from `products`; a group that
 * falls below two surviving members is no longer a duplicate and is dropped.
 */
export function attachProducts(groups, productsById) {
  const out = [];
  for (const g of groups || []) {
    const products = g.productIds.map((id) => productsById.get(id)).filter(Boolean);
    if (products.length < 2) continue;         // deleted product(s) dissolved the group
    out.push({ ...g, products, productIds: products.map((p) => p.id ?? p._id) });
  }
  return out;
}

// ── Ignore ────────────────────────────────────────────────────────────────────

export function buildIgnoreIndex(rows) {
  const map = new Map();
  for (const r of rows || []) map.set(r.groupKey, r.fingerprint);
  return map;
}

/**
 * A group is hidden only while it is BOTH ignored and unchanged. Once any member
 * is edited its updatedAt moves, the fingerprint no longer matches the stored
 * one, and the group comes back for review — exactly as required.
 */
export function isIgnored(group, ignoreIndex, fingerprint) {
  if (!ignoreIndex || !ignoreIndex.has(group.groupKey)) return false;
  return ignoreIndex.get(group.groupKey) === fingerprint;
}

export function rejectIgnored(groups, ignoreIndex) {
  return (groups || []).filter((g) => !isIgnored(g, ignoreIndex, fingerprintOf(g.products)));
}

// ── Filters ───────────────────────────────────────────────────────────────────

// A group matches when ANY member matches — filtering members instead would
// dissolve the very pairs the tool exists to show (e.g. an Active/Inactive pair
// under a status filter).
export function filterGroups(groups, { confidence, collection, brand, status } = {}) {
  return (groups || []).filter((g) => {
    if (confidence && g.confidence !== confidence) return false;
    if (brand && !g.products.some((p) => (p.brand || "").trim().toLowerCase() === brand.trim().toLowerCase())) return false;
    if (status && !g.products.some((p) => (p.status || "").trim().toLowerCase() === status.trim().toLowerCase())) return false;
    if (collection && !g.products.some((p) =>
      Array.isArray(p.collections) &&
      p.collections.some((c) => typeof c === "string" && c.trim().toLowerCase() === collection.trim().toLowerCase())
    )) return false;
    return true;
  });
}
