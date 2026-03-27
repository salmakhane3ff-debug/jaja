/**
 * /api/invoice/[id]
 * ─────────────────────────────────────────────────────────────────────────────
 * GET → return invoice by primary key (public — powers the /invoice/[id] page)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getInvoiceByIdHandler } from '@/lib/controllers/invoiceController';

// Public — the printable receipt page fetches this without auth
export const GET = getInvoiceByIdHandler;
