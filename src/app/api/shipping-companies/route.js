/**
 * /api/shipping-companies
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    ?admin=true  → all companies incl. inactive (admin)
 *        (no params)  → active companies ordered by sortOrder (public/checkout)
 * POST               → create shipping company (admin)
 * PATCH              → update shipping company by id (admin)
 * DELETE             → delete shipping company by id (admin)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getShippingCompaniesHandler,
  createShippingCompanyHandler,
  updateShippingCompanyHandler,
  deleteShippingCompanyHandler,
} from '@/lib/controllers/shippingCompanyController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

// Public — checkout Step 1 fetches active companies without auth
export const GET = getShippingCompaniesHandler;

// Admin-only mutations
export const POST   = withAdminAuth(createShippingCompanyHandler);
export const PATCH  = withAdminAuth(updateShippingCompanyHandler);
export const DELETE = withAdminAuth(deleteShippingCompanyHandler);
