/**
 * src/lib/services/duplicateService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Duplicate Listings Detector — data access. REVIEW ONLY: nothing here deletes
 * or mutates a product. The only write is the admin's "Ignore".
 *
 * PERFORMANCE CONTRACT: products are never compared pairwise, and the catalogue
 * is never loaded into memory. Each signal is a blocking key computed per row;
 * Postgres groups by it (GROUP BY … HAVING count(*) > 1) and returns ONLY the
 * groups. Cost is one scan/index-group per signal — O(n log n) in the DB —
 * against O(n²) for a naive compare-everything-to-everything pass. Full product
 * rows are then fetched for the members of surviving groups only.
 *
 * V1 is deterministic/equality-only — no pg_trgm, no extensions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';
import { mapProduct } from '../utils/mappers.js';
import { getStoreSettings } from './settingsService.js';
import {
  SQL_TITLE_KEY, SQL_NORMALIZED_TITLE_KEY, PRICE_BUCKET_SIZE,
  mergeSignalGroups, attachProducts, buildIgnoreIndex, rejectIgnored,
  filterGroups, fingerprintOf,
} from '../duplicates.js';

// Safety valve: a catalogue with pathological data could group into a huge
// number of clusters. The admin reviews groups by hand, so cap what we hydrate
// and tell the UI the list was truncated rather than melting the page.
const MAX_GROUPS = 500;

// First image URL, tolerating BOTH shapes the codebase stores: a plain URL
// string, or an object with a .url (the product detail page reads
// `images[0]?.url || images[0]`).
const SQL_FIRST_IMAGE_URL = `
  CASE
    WHEN jsonb_typeof(images) <> 'array' OR jsonb_array_length(images) = 0 THEN NULL
    WHEN jsonb_typeof(images->0) = 'string' THEN images->>0
    WHEN jsonb_typeof(images->0) = 'object' THEN images->0->>'url'
    ELSE NULL
  END`;

// …reduced to a bare filename, so the same asset behind a different CDN host or
// with a cache-busting query string still groups.
const SQL_FIRST_IMAGE_KEY = `
  lower(regexp_replace(regexp_replace(${SQL_FIRST_IMAGE_URL}, '[?#].*$', ''), '^.*/', ''))`;

// Collections signature: order- and case-insensitive. The CASE guard is not
// decoration — jsonb_array_elements_text RAISES on a non-array, which would fail
// the whole query instead of skipping one bad row, and Postgres does not promise
// AND short-circuits around a sub-select.
const SQL_COLLECTIONS_SIG = `
  CASE WHEN jsonb_typeof(collections) = 'array' THEN (
    SELECT string_agg(DISTINCT lower(btrim(e)), '|' ORDER BY lower(btrim(e)))
      FROM jsonb_array_elements_text(collections) AS e
     WHERE btrim(e) <> ''
  ) ELSE NULL END`;

// One round-trip: every signal's groups, tagged, as (signal, key, ids[]).
// Each branch is an independent aggregate over products — none of them join
// products to products, which is what keeps this linear rather than quadratic.
const GROUPS_SQL = `
WITH base AS (
  SELECT id, title, sku, barcode, brand, status, collections, images,
         COALESCE("salePrice", "regularPrice") AS price,
         ${SQL_TITLE_KEY}            AS title_key,
         ${SQL_NORMALIZED_TITLE_KEY} AS normalized_key,
         ${SQL_FIRST_IMAGE_KEY}      AS image_key,
         ${SQL_COLLECTIONS_SIG}      AS collections_sig
    FROM products
)
-- HIGH: identical title
SELECT 'title'::text AS signal, title_key AS key, array_agg(id ORDER BY id) AS ids
  FROM base WHERE title_key <> '' GROUP BY title_key HAVING count(*) > 1
UNION ALL
-- HIGH: identical SKU (empty excluded — the Duplicate button blanks it)
SELECT 'sku', btrim(sku), array_agg(id ORDER BY id)
  FROM base WHERE sku IS NOT NULL AND btrim(sku) <> '' GROUP BY btrim(sku) HAVING count(*) > 1
UNION ALL
-- HIGH: identical barcode
SELECT 'barcode', btrim(barcode), array_agg(id ORDER BY id)
  FROM base WHERE barcode IS NOT NULL AND btrim(barcode) <> '' GROUP BY btrim(barcode) HAVING count(*) > 1
UNION ALL
-- MEDIUM: normalized title ("Lampe (Copy)" == "lampe")
SELECT 'normalized', normalized_key, array_agg(id ORDER BY id)
  FROM base WHERE normalized_key <> '' GROUP BY normalized_key HAVING count(*) > 1
UNION ALL
-- MEDIUM: same first image filename
SELECT 'image', image_key, array_agg(id ORDER BY id)
  FROM base WHERE image_key IS NOT NULL AND image_key <> '' GROUP BY image_key HAVING count(*) > 1
UNION ALL
-- LOW: same brand AND same collections AND similar price.
-- Conjunction on purpose: "same brand" alone would collapse an entire brand into
-- one meaningless group. Price is bucketed into bands so near-equal prices meet.
SELECT 'attributes',
       lower(btrim(brand)) || '|' || collections_sig || '|' || floor(price / $1::numeric)::text,
       array_agg(id ORDER BY id)
  FROM base
 WHERE brand IS NOT NULL AND btrim(brand) <> ''
   AND collections_sig IS NOT NULL
   AND price IS NOT NULL AND price >= 0
 GROUP BY lower(btrim(brand)), collections_sig, floor(price / $1::numeric)
HAVING count(*) > 1`;

const MEMBER_SELECT = {
  id: true, title: true, images: true, sku: true, barcode: true, brand: true,
  collections: true, regularPrice: true, salePrice: true,
  status: true, createdAt: true, updatedAt: true,
};

/**
 * Detect duplicate groups.
 *
 * @param {object}  opts
 * @param {string?} opts.confidence  "high" | "medium" | "low"
 * @param {string?} opts.collection  case-insensitive collection filter
 * @param {string?} opts.brand       case-insensitive brand filter
 * @param {string?} opts.status      e.g. "Active" | "Inactive"
 * @returns {Promise<{groups: object[], total: number, truncated: boolean}>}
 */
export async function getDuplicateGroups({ confidence = null, collection = null, brand = null, status = null } = {}) {
  // 1. Group in SQL. Returns groups only — never the catalogue.
  const rows = await prisma.$queryRawUnsafe(GROUPS_SQL, PRICE_BUCKET_SIZE);

  // 2. Fold per-signal groups into review groups keyed by member set.
  const merged = mergeSignalGroups(rows.map((r) => ({ signal: r.signal, key: r.key, ids: r.ids })));
  const truncated = merged.length > MAX_GROUPS;
  const capped = truncated ? merged.slice(0, MAX_GROUPS) : merged;
  if (capped.length === 0) return { groups: [], total: 0, truncated: false };

  // 3. Hydrate ONLY the members of surviving groups.
  const memberIds = [...new Set(capped.flatMap((g) => g.productIds))];
  const [members, storeSettings, ignores] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: memberIds } }, select: MEMBER_SELECT }),
    getStoreSettings(),
    prisma.duplicateIgnore.findMany({ select: { groupKey: true, fingerprint: true } }),
  ]);

  const byId = new Map(members.map((p) => [p.id, p]));

  // 4. Drop groups dissolved by deletes, then ignored-and-unchanged groups, then filter.
  let groups = attachProducts(capped, byId);
  groups = rejectIgnored(groups, buildIgnoreIndex(ignores));
  groups = filterGroups(groups, { confidence, collection, brand, status });

  return {
    groups: groups.map((g) => ({
      groupKey:    g.groupKey,
      confidence:  g.confidence,
      reasons:     g.reasons,
      matchedKeys: g.matchedKeys,
      fingerprint: fingerprintOf(g.products),   // echoed back by Ignore
      products:    g.products.map((p) => mapProduct(p, storeSettings)),
    })),
    total: groups.length,
    truncated,
  };
}

/**
 * Ignore a group. Idempotent by construction: groupKey is UNIQUE and this is an
 * upsert (INSERT … ON CONFLICT DO UPDATE), so repeated or concurrent clicks can
 * never create a second Ignore record — they just refresh the fingerprint.
 */
export async function ignoreDuplicateGroup({ groupKey, fingerprint, productIds = [] }) {
  return prisma.duplicateIgnore.upsert({
    where:  { groupKey },
    update: { fingerprint, productIds },
    create: { groupKey, fingerprint, productIds },
  });
}
