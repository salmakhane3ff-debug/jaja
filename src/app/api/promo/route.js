/**
 * /api/promo
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  ?code=<CODE>   → validate promo code and return discount info (public)
 *      ?admin=true    → list all promos (admin — requires real auth)
 * POST               → create promo (admin)
 * PATCH              → update promo by id (admin)
 * DELETE             → delete promo by id (admin)
 *
 * NOTE: The admin panel should prefer /api/admin/promo which is the canonical
 * admin endpoint. This route is kept for backwards compatibility.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getPromoHandler,
  createPromoHandler,
  updatePromoHandler,
  deletePromoHandler,
} from '@/lib/controllers/promoController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

// GET: ?admin=true requires real auth; ?code=xxx validation is public (checkout)
export function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('admin') === 'true') {
    return withAdminAuth(getPromoHandler)(req);
  }
  return getPromoHandler(req);
}

// Admin-only mutations
export const POST   = withAdminAuth(createPromoHandler);
export const PATCH  = withAdminAuth(updatePromoHandler);
export const DELETE = withAdminAuth(deletePromoHandler);
