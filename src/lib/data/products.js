/**
 * src/lib/data/products.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side data access for products.
 * Called directly from Server Components — no HTTP self-fetch.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getProductById, getAllProducts } from "@/lib/services/productService";

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
