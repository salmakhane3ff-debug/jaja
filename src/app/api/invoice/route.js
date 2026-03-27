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
export const POST = createInvoiceHandler;
