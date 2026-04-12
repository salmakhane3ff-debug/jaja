/**
 * src/lib/services/productService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All product CRUD operations via Prisma.
 * Every method returns a frontend-compatible shape (with `_id` and currency).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma               from '../prisma.js';
import { mapProduct }       from '../utils/mappers.js';
import { getStoreSettings } from './settingsService.js';

// ── Known Prisma product columns ──────────────────────────────────────────────
// This explicit whitelist prevents Prisma from throwing "Unknown argument"
// errors when the admin form sends extra keys (profit, etc.).
const PRODUCT_COLUMNS = new Set([
  'title', 'description', 'shortDescription',
  'regularPrice', 'salePrice', 'costPerItem',
  'images', 'variants', 'collections',
  'sku', 'barcode', 'stockQuantity', 'stockStatus',
  'brand', 'supplier', 'tags', 'productLabel',
  'isActive', 'status',
  'rating', 'ratingsCount', 'reviewsCount',
  'limitedTimeDeal',
  'landingPageId',
  // ── Redirect & payment control (new) ──────────────────────────────────────
  'redirectMode', 'redirectUrl',
  'allowCOD', 'allowPrepaid',
  // ── Page builder sections ──────────────────────────────────────────────────
  'sections',
  // ── Per-product conversion / scarcity ─────────────────────────────────────
  'conversionEnabled', 'conversionSold', 'conversionStock',
  // ── Bundle & Save offers ───────────────────────────────────────────────────
  'bundles',
  // feedbackCount is intentionally excluded — incremented by the feedback system
]);

// Float columns: nullable (?) → store null on empty; non-nullable → omit on empty
const FLOAT_NULLABLE  = new Set(['regularPrice', 'salePrice', 'costPerItem']);
const FLOAT_REQUIRED  = new Set(['rating']);

// Int columns: nullable (?) → store null on empty; non-nullable → omit on empty
const INT_NULLABLE    = new Set(['stockQuantity', 'conversionSold', 'conversionStock']);
const INT_REQUIRED    = new Set(['ratingsCount', 'reviewsCount']);

// Boolean columns — accept true/false/1/0/"true"/"false" from form inputs
const BOOL_FIELDS     = new Set(['isActive', 'allowCOD', 'allowPrepaid', 'conversionEnabled']);

/**
 * Strip everything that should not be written directly:
 *   - MongoDB/Prisma ID aliases    (_id, id)
 *   - Computed display fields      (currencySymbol, storeCurrency)
 *   - Auto-managed timestamps      (createdAt, updatedAt)
 *   - Feedback-system counter      (feedbackCount)
 *   - Derived/display-only fields  (profit, etc.)
 *   - Any key not in PRODUCT_COLUMNS
 *
 * Also coerces string values from HTML inputs to the correct Prisma types:
 *   Float columns → parseFloat, null when empty / NaN
 *   Int columns   → parseInt,   null when empty / NaN
 *
 * `rating`, `ratingsCount`, `reviewsCount` are KEPT — the admin sets them.
 */
function sanitiseInput(body) {
  const result = {};
  for (const [key, value] of Object.entries(body ?? {})) {
    if (!PRODUCT_COLUMNS.has(key)) continue;

    if (FLOAT_NULLABLE.has(key)) {
      // Optional Float — null is valid; Prisma accepts it
      const n = parseFloat(value);
      result[key] = isNaN(n) ? null : n;
    } else if (FLOAT_REQUIRED.has(key)) {
      // Non-nullable Float — omit key on empty so Prisma uses column default
      const n = parseFloat(value);
      if (!isNaN(n)) result[key] = n;
    } else if (INT_NULLABLE.has(key)) {
      // Optional Int — null is valid
      const n = parseInt(value, 10);
      result[key] = isNaN(n) ? null : n;
    } else if (INT_REQUIRED.has(key)) {
      // Non-nullable Int — omit key on empty so Prisma uses column default
      const n = parseInt(value, 10);
      if (!isNaN(n)) result[key] = n;
    } else if (BOOL_FIELDS.has(key)) {
      // Boolean — accept actual booleans AND form strings ("true"/"false"/1/0)
      if (typeof value === 'boolean') {
        result[key] = value;
      } else if (value === 'true' || value === '1' || value === 1) {
        result[key] = true;
      } else if (value === 'false' || value === '0' || value === 0) {
        result[key] = false;
      }
      // undefined/null → omit so Prisma keeps column default
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all products, optionally filtered by status.
 *
 * statusFilter behaviour:
 *   undefined / null → only "Active" products (default, matches old behaviour)
 *   "all"            → every product regardless of status
 *   anything else    → filter by that exact status string
 */
export async function getAllProducts(statusFilter) {
  let where = {};
  if (!statusFilter) {
    where.status = 'Active';
  } else if (statusFilter !== 'all') {
    where.status = statusFilter;
  }

  // PERF: `select` for list view — strips large fields not needed in product cards:
  //   description (~2 KB/product), sections (~5 KB), variants (array), barcode,
  //   costPerItem (private), supplier (private), landingPageId.
  //   For a 100-product catalogue this reduces JSON from ~4.8 MB → ~200 KB.
  //   getProductById() still fetches ALL columns for the detail page.
  const LIST_SELECT = {
    id: true, title: true, shortDescription: true,
    regularPrice: true, salePrice: true,
    images: true, collections: true,
    sku: true, stockStatus: true, stockQuantity: true,
    productLabel: true, tags: true, brand: true,
    rating: true, ratingsCount: true, reviewsCount: true,
    isActive: true, status: true,
    redirectMode: true, redirectUrl: true,
    limitedTimeDeal: true,
    allowCOD: true, allowPrepaid: true,
    conversionEnabled: true, conversionSold: true, conversionStock: true,
    bundles: true,
    createdAt: true,
  };

  const [products, storeSettings] = await Promise.all([
    prisma.product.findMany({ where, select: LIST_SELECT, orderBy: { createdAt: 'desc' } }),
    getStoreSettings(),
  ]);

  return products.map((p) => mapProduct(p, storeSettings));
}

/**
 * Fetch a set of products by their Prisma UUIDs.
 * Used by the cart page so it only downloads the products it needs instead of
 * fetching the entire catalogue and filtering client-side.
 *
 * WHY: Cart page was fetching ALL products (~4 MB JSON) then filtering 2-3 matches
 *      in the browser. This replaces that with a targeted query returning only the
 *      products in the cart (typically < 10 KB).
 */
export async function getProductsByIds(ids) {
  if (!ids?.length) return [];

  const LIST_SELECT = {
    id: true, title: true, shortDescription: true,
    regularPrice: true, salePrice: true,
    images: true, collections: true,
    sku: true, stockStatus: true, stockQuantity: true,
    productLabel: true, tags: true, brand: true,
    rating: true, ratingsCount: true, reviewsCount: true,
    isActive: true, status: true,
    redirectMode: true, redirectUrl: true,
    limitedTimeDeal: true,
    allowCOD: true, allowPrepaid: true,
    conversionEnabled: true, conversionSold: true, conversionStock: true,
    bundles: true,
    createdAt: true,
  };

  const [products, storeSettings] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: ids } }, select: LIST_SELECT }),
    getStoreSettings(),
  ]);

  return products.map((p) => mapProduct(p, storeSettings));
}

/**
 * Fetch a single product by its Prisma UUID.
 * Returns null if not found.
 */
export async function getProductById(id) {
  const [product, storeSettings] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    getStoreSettings(),
  ]);
  if (!product) return null;
  return mapProduct(product, storeSettings);
}

// ── Writes ────────────────────────────────────────────────────────────────────

/** Create a new product. Returns the mapped product with `_id`. */
export async function createProduct(body) {
  const data = sanitiseInput(body);
  const product = await prisma.product.create({ data });
  const storeSettings = await getStoreSettings();
  return mapProduct(product, storeSettings);
}

/**
 * Update a product by its Prisma UUID.
 * Returns null if not found.
 */
export async function updateProduct(id, body) {
  const data = sanitiseInput(body);
  try {
    const product = await prisma.product.update({ where: { id }, data });
    const storeSettings = await getStoreSettings();
    return mapProduct(product, storeSettings);
  } catch (err) {
    if (err.code === 'P2025') return null; // record not found
    throw err;
  }
}

/** Delete a product by its Prisma UUID. Returns true on success, false if not found. */
export async function deleteProduct(id) {
  try {
    await prisma.product.delete({ where: { id } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return false;
    throw err;
  }
}
