/**
 * src/lib/data/products.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side data access for products.
 * Called directly from Server Components — no HTTP self-fetch.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getProductById, getAllProducts, getProductsPage } from "@/lib/services/productService";

/**
 * Fetch a single product by its UUID for use in Server Components.
 * Returns null when not found.
 */
export async function fetchProductById(id) {
  if (!id) return null;
  try {
    return await getProductById(id);
  } catch {
    return null;
  }
}

/**
 * Fetch all active products for use in Server Components.
 */
export async function fetchAllProducts() {
  try {
    return await getAllProducts(null);
  } catch {
    return [];
  }
}

/**
 * Fetch ONE page of the active product feed (keyset pagination) for use in
 * Server Components — the /products first page is rendered from this, so the
 * initial 16 products stay fully server-rendered and indexable.
 *
 * On failure returns an empty page rather than throwing: the products page then
 * renders its normal empty state instead of a 500.
 */
export async function fetchProductsPage(opts) {
  try {
    return await getProductsPage(opts);
  } catch (err) {
    console.error("[data/products] feed page failed:", err?.message ?? err);
    return { items: [], nextCursor: null, hasMore: false, total: 0 };
  }
}
