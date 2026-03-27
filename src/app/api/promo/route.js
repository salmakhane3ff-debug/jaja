/**
 * /api/promo
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    ?code=<CODE>   → validate promo code and return discount info (public)
 *        ?admin=true    → list all promos (admin)
 * POST               → create promo (admin)
 * PATCH              → update promo by id (admin)
 * DELETE             → delete promo by id (admin)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getPromoHandler,
  createPromoHandler,
  updatePromoHandler,
  deletePromoHandler,
} from '@/lib/controllers/promoController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

// Public — checkout Step 1 validates codes without auth
export const GET = getPromoHandler;

// Admin-only mutations
export const POST   = withAdminAuth(createPromoHandler);
export const PATCH  = withAdminAuth(updatePromoHandler);
export const DELETE = withAdminAuth(deletePromoHandler);
