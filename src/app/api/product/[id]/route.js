/**
 * /api/product/[id]
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/product/:id → single product by Prisma UUID (with currencySymbol)
 *
 * Note: The old implementation validated MongoDB ObjectId format.
 * With PostgreSQL / Prisma the ID is a UUID string — any non-empty string
 * is a valid lookup key (Prisma returns null when not found, not an error).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getProductByIdHandler } from '@/lib/controllers/productController';

export const GET = getProductByIdHandler;
