/**
 * src/lib/productImport/mercari.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Mercari source adapter for the manual product-URL importer.
 *
 * A source adapter is a plain descriptor — id, the page hosts it accepts, the
 * CDN hosts its images may come from, and an `extract(html, url)` that turns a
 * fetched document into { title, price, imageUrls, warnings }. Adding another
 * marketplace later means adding one more descriptor to the registry in
 * index.js; the API route and the admin UI never change.
 *
 * WHERE MERCARI PUTS THE DATA (in the order we trust it):
 *   1. JSON-LD  — <script type="application/ld+json"> with "@type":"Product",
 *      carrying name, image[] and offers{price, priceCurrency, availability}.
 *      This is the only fully structured source, so it wins.
 *   2. Open Graph / product meta — og:title, og:image (repeated once per photo),
 *      product:price:amount + product:price:currency. Present even on pages
 *      whose JSON-LD is missing or truncated.
 *   3. __NEXT_DATA__ — the Next.js state blob. Last resort: its shape is
 *      internal and can change without notice, so it only fills gaps.
 *
 * V1 SCOPE: title, price, images. Seller name, seller profile, ratings,
 * reviews and shipping are never read, in any of the three paths.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  parseJsonLdProducts, firstOffer, parseMetaTags, parseMetaImages,
  parseNextData, findObjectWithKeys, normalizePrice, dedupeImages, cleanText,
  MAX_IMAGES,
} from './normalize.js';

/** Listing hosts. Exact matches only — see validateUrl in security.js. */
export const MERCARI_PAGE_HOSTS = Object.freeze(['mercari.com', 'www.mercari.com']);

/** CDN hosts Mercari serves listing photos from. Anything else is dropped. */
export const MERCARI_IMAGE_HOSTS = Object.freeze([
  'static.mercdn.net',
  'assets.mercari-shops-static.com',
  'about.mercari.com',
]);

/** Availability strings that mean the listing is gone / already sold. */
const GONE = ['soldout', 'sold_out', 'outofstock', 'out_of_stock', 'discontinued'];

/**
 * Pull the V1 fields out of a fetched Mercari listing document.
 *
 * Never throws: a page that cannot be understood returns empty fields plus
 * warnings, and the caller decides whether that is a partial or failed import.
 *
 * @param {string} html
 * @param {string} finalUrl
 * @returns {{title:string, price:{amount:number,currency:string|null}|null,
 *            imageUrls:string[], unavailable:boolean, warnings:string[]}}
 */
export function extractMercari(html, finalUrl = '') {
  const warnings = [];
  let title = '';
  let price = null;
  let images = [];
  let unavailable = false;

  // ── 1. JSON-LD Product ────────────────────────────────────────────────────
  const products = parseJsonLdProducts(html);
  const product = products[0] || null;
  if (product) {
    title = cleanText(product.name);
    const offer = firstOffer(product);
    if (offer) {
      price = normalizePrice(offer.price ?? offer.lowPrice, offer.priceCurrency);
      const avail = String(offer.availability || '').toLowerCase();
      if (GONE.some((g) => avail.includes(g))) unavailable = true;
    }
    images = imageList(product.image);
  }

  // ── 2. Open Graph / product meta ──────────────────────────────────────────
  const meta = parseMetaTags(html);
  if (!title) title = meta['og:title'] || meta['twitter:title'] || '';
  if (!price) {
    price = normalizePrice(
      meta['product:price:amount'] ?? meta['og:price:amount'],
      meta['product:price:currency'] ?? meta['og:price:currency'],
    );
  }
  if (images.length === 0) images = parseMetaImages(html);
  if (!unavailable) {
    const avail = String(meta['product:availability'] || meta['og:availability'] || '').toLowerCase();
    if (GONE.some((g) => avail.includes(g))) unavailable = true;
  }

  // ── 3. __NEXT_DATA__ (gap filler only) ────────────────────────────────────
  if (!title || !price || images.length === 0) {
    const next = parseNextData(html);
    if (next) {
      const item = findObjectWithKeys(next, ['name', 'price']) ||
                   findObjectWithKeys(next, ['title', 'price']);
      if (item) {
        if (!title) title = cleanText(item.name || item.title || '');
        if (!price) price = normalizePrice(item.price, item.currency ?? item.priceCurrency);
        if (images.length === 0) images = imageList(item.photos ?? item.images ?? item.thumbnails);
      }
    }
  }

  // Titles on marketplace pages carry a site suffix; strip it, keep the product.
  title = stripSiteSuffix(title);

  const imageUrls = dedupeImages(images, { allowedHosts: MERCARI_IMAGE_HOSTS, max: MAX_IMAGES });

  if (!title) warnings.push('TITLE_MISSING');
  if (!price) warnings.push('PRICE_MISSING');
  else if (!price.currency) warnings.push('CURRENCY_MISSING');
  if (imageUrls.length === 0) warnings.push('IMAGES_MISSING');

  return { title, price, imageUrls, unavailable, warnings };
}

/** Accepts a string, an array, or ImageObject(s); returns plain URL strings. */
function imageList(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((v) => {
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object') return v.url || v.contentUrl || v.uri || v.src || '';
      return '';
    })
    .filter(Boolean);
}

/** "Nice Jacket | Mercari" / "… - Mercari" → "Nice Jacket". */
function stripSiteSuffix(t) {
  return cleanText(String(t || '').replace(/\s*[|\-–—]\s*Mercari\s*$/i, ''));
}

/** The descriptor consumed by the source registry. */
export const mercariSource = Object.freeze({
  id: 'mercari',
  label: 'Mercari',
  pageHosts: MERCARI_PAGE_HOSTS,
  imageHosts: MERCARI_IMAGE_HOSTS,
  extract: extractMercari,
});
