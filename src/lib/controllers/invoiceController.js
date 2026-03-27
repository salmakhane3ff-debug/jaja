/**
 * src/lib/controllers/invoiceController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    /api/invoice?orderId=<id>  → invoice for a given order (admin)
 *        /api/invoice?admin=true    → all invoices (admin)
 * POST   /api/invoice               → create invoice (called at checkout end)
 * GET    /api/invoice/[id]          → invoice by primary key (public — printable receipt)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  createInvoice,
  getInvoiceById,
  getInvoiceByOrderId,
  getAllInvoices,
} from '../services/invoiceService.js';
import { badRequest, notFound, serverError } from '../utils/apiResponse.js';

// ── GET /api/invoice ──────────────────────────────────────────────────────────

export async function getInvoiceHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId') || null;
    const isAdmin = searchParams.get('admin') === 'true';

    // Admin list — return all invoices
    if (isAdmin) {
      const rows = await getAllInvoices();
      return Response.json(rows);
    }

    // Lookup by orderId
    if (!orderId) return badRequest('orderId query parameter is required');

    const invoice = await getInvoiceByOrderId(orderId);
    if (!invoice) return notFound('Invoice not found for this order');

    return Response.json(invoice);
  } catch (err) {
    console.error('Invoice GET error:', err);
    return serverError('Failed to fetch invoice');
  }
}

// ── POST /api/invoice ─────────────────────────────────────────────────────────

export async function createInvoiceHandler(req) {
  try {
    const body = await req.json();

    if (!body.invoiceNumber?.trim()) return badRequest('invoiceNumber is required');
    if (!body.customerName?.trim())  return badRequest('customerName is required');

    const invoice = await createInvoice(body);
    return Response.json(invoice, { status: 201 });
  } catch (err) {
    // Unique constraint on invoiceNumber or orderId
    if (err.code === 'P2002') {
      return Response.json({ error: 'Invoice already exists for this order' }, { status: 409 });
    }
    console.error('Invoice POST error:', err);
    return serverError('Failed to create invoice');
  }
}

// ── GET /api/invoice/[id] ─────────────────────────────────────────────────────

export async function getInvoiceByIdHandler(req, context) {
  try {
    const { id } = await context.params;

    const invoice = await getInvoiceById(id);
    if (!invoice) return notFound('Invoice not found');

    return Response.json(invoice);
  } catch (err) {
    console.error('Invoice GET by ID error:', err);
    return serverError('Failed to fetch invoice');
  }
}
