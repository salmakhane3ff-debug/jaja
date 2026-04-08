/**
 * /api/products
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    ?status=Active|Inactive|all  → array of products (with currencySymbol)
 * POST   { ...productFields }          → create product
 * PUT    { _id, ...updateFields }      → update product by _id
 * DELETE { _id }                       → delete product by _id
 *
 * Canonical plural route — delegates to the shared productController.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getProductsHandler,
  createProductHandler,
  updateProductHandler,
  deleteProductHandler,
} from '@/lib/controllers/productController';

export const GET    = getProductsHandler;
export const POST   = createProductHandler;
export const PUT    = updateProductHandler;
export const DELETE = deleteProductHandler;
