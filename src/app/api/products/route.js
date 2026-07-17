/**
 * /api/products
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    (no status) | ?status=Active | ?ids=…  → public product read
 * GET    ?status=all | ?status=Inactive | …     → privileged read              [admin]
 * POST   { ...productFields }          → create product                        [admin]
 * PUT    { _id, ...updateFields }      → update product by _id                 [admin]
 * DELETE { _id }                       → delete product by _id                 [admin]
 *
 * Canonical plural route — delegates to the shared productController.
 *
 * AUTH: the Edge middleware protects /admin *pages*, but its matcher excludes
 * /api entirely, so these exports are the ONLY gate in front of product writes
 * and privileged reads. Writes are wrapped unconditionally; GET is scoped per
 * request (see below). 401 without a valid auth_token cookie, 403 when the
 * token's role is not ADMIN — matching the 44 other admin API routes. Do not
 * unwrap one to "fix" a caller: an unwrapped write lets anyone create, rewrite,
 * or hard-delete any product, and delete also destroys its images in storage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getProductsHandler,
  createProductHandler,
  updateProductHandler,
  deleteProductHandler,
} from '@/lib/controllers/productController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { isPublicProductRead } from '@/lib/productReadScope';

// GET is scoped by query param rather than wrapped wholesale: the storefront,
// cart, checkout, wishlist and homepage must keep reading products anonymously,
// but `?status=all|Inactive|…` exposes unpublished catalogue data and needs an
// admin. The allowlist lives in productReadScope so it stays unit-testable.
export async function GET(req, context) {
  const status = new URL(req.url).searchParams.get('status');
  if (isPublicProductRead(status)) return getProductsHandler(req, context);
  return withAdminAuth(getProductsHandler)(req, context);
}

// Admin only. The admin UI calls these from /admin pages, where the browser
// already holds the auth_token cookie and sends it on same-origin fetches.
export const POST   = withAdminAuth(createProductHandler);
export const PUT    = withAdminAuth(updateProductHandler);
export const DELETE = withAdminAuth(deleteProductHandler);
