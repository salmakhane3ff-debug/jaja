/**
 * src/lib/productImport/normalize.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SOURCE-AGNOSTIC page-metadata readers + the normalized result shape.
 *
 * Nothing here knows about Mercari. A source adapter (mercari.js) decides WHICH
 * of these readers to trust and in what order; this module only knows how to
 * pull structured product metadata out of a returned HTML document:
 *
 *   • JSON-LD  <script type="application/ld+json"> … "@type":"Product"
 *   • Open Graph / product meta tags
 *   • Next.js __NEXT_DATA__ embedded state
 *
 * Deliberately NOT extracted anywhere in this file: seller, seller username,
 * seller profile, ratings, reviews, shipping. V1 imports title, price and
 * images only, so those fields are never even read off the page.
 *
 * Regex-based on purpose: the project has no HTML parser dependency, and the
 * only things read are <script> blocks and <meta> tags.
 *
 * No React, no DOM, no I/O → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Hard ceiling on imported images — an admin reviews these by hand. */
export const MAX_IMAGES = 10;

// ── Small text helpers ───────────────────────────────────────────────────────

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" };

/** Decode the handful of entities that realistically appear in a title. */
export function decodeEntities(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, ent) => {
    const key = ent.toLowerCase();
    if (NAMED[key] !== undefined) return NAMED[key];
    if (key.startsWith('#x')) {
      const n = parseInt(key.slice(2), 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    if (key.startsWith('#')) {
      const n = parseInt(key.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return m;
  });
}

/** Collapse whitespace and trim; returns '' for anything unusable. */
export function cleanText(value) {
  if (typeof value !== 'string') return '';
  return decodeEntities(value).replace(/\s+/g, ' ').trim();
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────

/**
 * Every JSON-LD object in the document whose @type is Product.
 * Tolerates arrays, @graph wrappers and individually malformed blocks.
 */
export function parseJsonLdProducts(html) {
  const out = [];
  if (typeof html !== 'string') return out;

  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let parsed;
    try { parsed = JSON.parse(m[1].trim()); }
    catch { continue; }                                   // one bad block never breaks the rest
    collectProducts(parsed, out);
  }
  return out;
}

function collectProducts(node, out, depth = 0) {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) { node.forEach((n) => collectProducts(n, out, depth + 1)); return; }
  if (typeof node !== 'object') return;

  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => String(t).toLowerCase() === 'product')) out.push(node);

  if (node['@graph']) collectProducts(node['@graph'], out, depth + 1);
}

/** The first offer on a JSON-LD Product (offers may be an object or an array). */
export function firstOffer(product) {
  const offers = product?.offers;
  if (!offers) return null;
  const list = Array.isArray(offers) ? offers : [offers];
  return list.find((o) => o && typeof o === 'object') || null;
}

// ── Meta tags ────────────────────────────────────────────────────────────────

/**
 * All <meta> tags as { key: content }, keyed by `property` or `name`
 * (og:title, product:price:amount, twitter:image, …). First wins.
 */
export function parseMetaTags(html) {
  const out = {};
  if (typeof html !== 'string') return out;

  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = attr(tag, 'property') || attr(tag, 'name') || attr(tag, 'itemprop');
    const content = attr(tag, 'content');
    if (!key || content === null) continue;
    const k = key.toLowerCase();
    if (out[k] === undefined) out[k] = cleanText(content);
  }
  return out;
}

/** Every og:image / twitter:image value, in document order (og:image repeats). */
export function parseMetaImages(html) {
  const out = [];
  if (typeof html !== 'string') return out;

  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
    if (key !== 'og:image' && key !== 'og:image:secure_url' && key !== 'twitter:image') continue;
    const content = attr(tag, 'content');
    if (content) out.push(cleanText(content));
  }
  return out;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? null;
}

// ── __NEXT_DATA__ ────────────────────────────────────────────────────────────

/** The parsed __NEXT_DATA__ payload, or null when absent/malformed. */
export function parseNextData(html) {
  if (typeof html !== 'string') return null;
  const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try { return JSON.parse(m[1].trim()); } catch { return null; }
}

/**
 * Depth-limited search for the first object that owns every key in `keys`.
 * Used as the last-resort reader when a page ships state but no JSON-LD.
 */
export function findObjectWithKeys(root, keys, maxDepth = 8) {
  const seen = new Set();
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > maxDepth) return null;
    if (seen.has(node)) return null;
    seen.add(node);

    if (!Array.isArray(node) && keys.every((k) => node[k] !== undefined && node[k] !== null)) return node;

    for (const v of Array.isArray(node) ? node : Object.values(node)) {
      const hit = walk(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  return walk(root, 0);
}

// ── Price ────────────────────────────────────────────────────────────────────

/**
 * Coerce a scraped price into { amount:number, currency:string } or null.
 * Currency is NEVER guessed — an absent/unrecognisable code yields null so the
 * caller can flag it for manual review instead of silently assuming USD.
 */
export function normalizePrice(rawAmount, rawCurrency) {
  const amount = toAmount(rawAmount);
  if (amount === null) return null;

  const currency = String(rawCurrency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { amount, currency: null };
  return { amount, currency };
}

/** "$1,234.50" / "1234.5" / 1234.5 → 1234.5 ; anything else → null. */
export function toAmount(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== 'string') return null;

  // Strip currency symbols/letters and thousands separators, keep one decimal point.
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '');
  // Guard the empty case explicitly: "free" strips to "" and Number('') is 0,
  // which would silently import a price of zero.
  if (!/\d/.test(cleaned)) return null;
  const n = Number(cleaned.replace(/,/g, '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ── Images ───────────────────────────────────────────────────────────────────

/**
 * Filter + de-duplicate candidate image URLs.
 *
 * Duplicates are judged on origin + pathname, so the same photo requested at
 * two sizes (…/photo_1.jpg?w=240 and ?w=1200) counts once — CDNs vary the query
 * string constantly and would otherwise import the same picture repeatedly.
 *
 * @param {string[]} urls
 * @param {{allowedHosts?:string[], max?:number}} opts
 */
export function dedupeImages(urls, { allowedHosts = null, max = MAX_IMAGES } = {}) {
  const seen = new Set();
  const out = [];
  const allow = allowedHosts ? allowedHosts.map((h) => h.toLowerCase()) : null;

  for (const raw of Array.isArray(urls) ? urls : []) {
    if (typeof raw !== 'string' || raw.trim() === '') continue;

    let u;
    try { u = new URL(raw.trim()); } catch { continue; }
    if (u.protocol !== 'https:') continue;

    const host = u.hostname.toLowerCase();
    if (allow && !allow.includes(host)) continue;

    const key = `${u.origin}${u.pathname}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(u.toString());
    if (out.length >= max) break;
  }
  return out;
}

// ── Result shape ─────────────────────────────────────────────────────────────

/**
 * The normalized import result every source adapter produces.
 * `images` here are still SOURCE urls — the route replaces them with our own
 * media URLs after the ingest step. Nothing downstream ever persists a source
 * image URL as a product image.
 */
export function normalizeResult({ source, sourceUrl, title, price, imageUrls, warnings = [] }) {
  return {
    source:    String(source || 'unknown'),
    sourceUrl: String(sourceUrl || ''),
    title:     cleanText(title || ''),
    price:     price && typeof price === 'object' ? price : null,
    imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
    warnings:  Array.isArray(warnings) ? warnings.filter(Boolean) : [],
  };
}
