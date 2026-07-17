/**
 * /api/products
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    ?status=Active|Inactive|all  → array of products (with currencySymbol)   [public]
 * POST   { ...productFields }          → create product                            [admin]
 * PUT    { _id, ...updateFields }      → update product by _id                     [admin]
 * DELETE { _id }                       → delete product by _id                     [admin]
 *
 * Canonical plural route — delegates to the shared productController.
 *
 * AUTH: the Edge middleware protects /admin *pages*, but its matcher excludes
 * /api entirely, so these exports are the ONLY gate in front of product writes.
 * Every write is therefore wrapped in withAdminAuth (401 without a valid
 * auth_token cookie, 403 when the token's role is not ADMIN) — matching the 44
 * other admin API routes. Do not unwrap one to "fix" a caller: an unwrapped
 * write here lets anyone create, rewrite, or hard-delete any product, and delete
 * also destroys the product's images in storage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getProductsHandler,
  createProductHandler,
  updateProductHandler,
  deleteProductHandler,
} from '@/lib/controllers/productController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

// Public — the storefront, cart, checkout, wishlist and homepage all read this.
export const GET    = getProductsHandler;

// Admin only. The admin UI calls these from /admin pages, where the browser
// already holds the auth_token cookie and sends it on same-origin fetches.
export const POST   = withAdminAuth(createProductHandler);
export const PUT    = withAdminAuth(updateProductHandler);
export const DELETE = withAdminAuth(deleteProductHandler);
