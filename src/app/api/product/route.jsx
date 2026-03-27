/**
 * /api/product
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    ?status=Active|Inactive|all  → array of products (with currencySymbol)
 * POST   { ...productFields }          → create product
 * PUT    { _id, ...updateFields }      → update product by _id
 * DELETE { _id }                       → delete product by _id
 *
 * Response shape is identical to the original MongoDB implementation so the
 * existing frontend requires zero changes.
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
