/**
 * /api/invoice
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    ?orderId=<id>   → invoice linked to that order (admin)
 *        ?admin=true     → all invoices (admin)
 * POST                   → create invoice (called from checkout — no auth required
 *                          because it fires client-side immediately after order
 *                          creation, before the user is redirected to /success)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getInvoiceHandler,
  createInvoiceHandler,
} from '@/lib/controllers/invoiceController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

// Admin reads
export const GET = withAdminAuth(getInvoiceHandler);

// Public POST — checkout fires this without an auth token
/**
 * ⚠️ TEMPORARY PUBLIC SECURITY EXCEPTION — tracked in scripts/routeAuth.test.mjs
 *
 * Why it is currently public:
 *   Checkout creates the invoice from the customer's browser right after the
 *   order is placed; the customer has no admin session to present.
 *
 * Known risk:
 *   Unauthenticated invoice creation. Anyone can POST arbitrary invoice payloads —
 *   junk/spam rows, unbounded resource growth, and fabricated invoice records that
 *   the admin invoice list will display as real. There is no rate limit here.
 *
 * Required follow-up fix:
 *   Generate the invoice server-side inside createOrder() (which already resolves
 *   every financial value from the database), and drop this public write.
 *
 * Hardening applied (Batch #2, endpoint unchanged):
 *   createInvoiceHandler is now rate-limited and requires orderId to reference a
 *   REAL order, so invoices can no longer be spammed for fabricated/non-existent
 *   orders. Money figures are untouched (kept byte-identical to the caller).
 */
export const POST = createInvoiceHandler;
