/**
 * src/lib/services/invoiceService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD for the `invoices` table.
 *
 * Invoice is created once at checkout completion (all payment types: cod,
 * bank_transfer, cod_deposit) and displayed as a printable receipt at
 * /invoice/[id].
 *
 * items is stored as Json? — treated as [] when null in the application layer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

// ── Helper ────────────────────────────────────────────────────────────────────

function mapInvoice(inv) {
  if (!inv) return null;
  return {
    _id: inv.id,
    ...inv,
    // Guarantee items is always an array for consumers
    items: Array.isArray(inv.items) ? inv.items : [],
    // Include nested order relation when present
    order: inv.order ? { _id: inv.order.id, ...inv.order } : undefined,
  };
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Create a new invoice.
 * Called at the end of checkout immediately after the order is created.
 *
 * @param {object} data
 * @param {string}  data.invoiceNumber
 * @param {string}  [data.orderId]
 * @param {string}  data.customerName
 * @param {string}  [data.customerPhone]
 * @param {string}  [data.customerCity]
 * @param {string}  [data.shippingCompany]
 * @param {string}  [data.paymentMethod]   "cod" | "bank_transfer" | "cod_deposit"
 * @param {Array}   [data.items]           line-item snapshots
 * @param {number}  [data.subtotal]
 * @param {number}  [data.shippingCost]
 * @param {number}  [data.promoDiscount]
 * @param {number}  [data.total]
 * @param {number}  [data.deposit]
 */
export async function createInvoice(data) {
  const row = await prisma.invoice.create({
    data: {
      invoiceNumber:   data.invoiceNumber,
      orderId:         data.orderId         ?? null,
      customerName:    data.customerName,
      customerPhone:   data.customerPhone   ?? null,
      customerCity:    data.customerCity    ?? null,
      shippingCompany: data.shippingCompany ?? null,
      paymentMethod:   data.paymentMethod   ?? null,
      items:           Array.isArray(data.items) ? data.items : null,
      subtotal:        parseFloat(data.subtotal)      || 0,
      shippingCost:    parseFloat(data.shippingCost)  || 0,
      promoDiscount:   parseFloat(data.promoDiscount) || 0,
      total:           parseFloat(data.total)         || 0,
      deposit:         parseFloat(data.deposit)       || 0,
    },
    include: { order: true },
  });
  return mapInvoice(row);
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Return a single invoice by its primary key (UUID).
 * Includes the related order row.
 *
 * @param {string} id
 */
export async function getInvoiceById(id) {
  const row = await prisma.invoice.findUnique({
    where:   { id },
    include: { order: true },
  });
  return mapInvoice(row);
}

/**
 * Return the invoice linked to a specific order (one-to-one).
 *
 * @param {string} orderId
 */
export async function getInvoiceByOrderId(orderId) {
  const row = await prisma.invoice.findUnique({
    where:   { orderId },
    include: { order: true },
  });
  return mapInvoice(row);
}

/**
 * Return all invoices ordered by creation date, newest first.
 * Used by the admin orders panel.
 */
export async function getAllInvoices() {
  const rows = await prisma.invoice.findMany({
    orderBy: { createdAt: 'desc' },
    include: { order: true },
  });
  return rows.map(mapInvoice);
}
