/**
 * /api/products/[id]
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/products/:id → single product by Prisma UUID (with currencySymbol)
 *
 * Canonical plural route — delegates to the shared productController.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getProductByIdHandler } from '@/lib/controllers/productController';

export const GET = getProductByIdHandler;
