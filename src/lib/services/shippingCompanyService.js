/**
 * src/lib/services/shippingCompanyService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD for the `shipping_companies` table.
 *
 * paymentType is stored as a Prisma enum (COD | COD_DEPOSIT | PREPAID).
 * The map helper serialises it to lowercase so the checkout page can compare
 * with === "cod" / "cod_deposit" / "prepaid" exactly as in Project A.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise a paymentType string to the Prisma enum value. */
function toPaymentTypeEnum(raw) {
  if (!raw) return 'COD';
  const map = {
    cod:         'COD',
    COD:         'COD',
    cod_deposit: 'COD_DEPOSIT',
    COD_DEPOSIT: 'COD_DEPOSIT',
    prepaid:     'PREPAID',
    PREPAID:     'PREPAID',
  };
  return map[raw] ?? 'COD';
}

/** Serialise a DB row for API consumers. */
function mapCompany(c) {
  if (!c) return null;
  return {
    _id:          c.id,
    ...c,
    // Lowercase paymentType so checkout comparisons (=== "cod") keep working
    paymentType:  c.paymentType.toLowerCase(),
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Return all active shipping companies ordered by sortOrder asc, then name.
 * Public — called by checkout Step 1.
 */
export async function getActiveShippingCompanies() {
  const rows = await prisma.shippingCompany.findMany({
    where:   { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(mapCompany);
}

/**
 * Return every shipping company (active + inactive) for the admin panel.
 */
export async function getAllShippingCompanies() {
  const rows = await prisma.shippingCompany.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(mapCompany);
}

/**
 * Create a new shipping company.
 * @param {object} data
 */
export async function createShippingCompany(data) {
  const row = await prisma.shippingCompany.create({
    data: {
      name:         data.name,
      logo:         data.logo         ?? null,
      description:  data.description  ?? null,
      deliveryTime: data.deliveryTime ?? null,
      price:        parseFloat(data.price)   || 0,
      isFree:       Boolean(data.isFree),
      paymentType:  toPaymentTypeEnum(data.paymentType),
      deposit:      parseFloat(data.deposit) || 0,
      isActive:     data.isActive !== undefined ? Boolean(data.isActive) : true,
      sortOrder:    parseInt(data.sortOrder, 10) || 0,
    },
  });
  return mapCompany(row);
}

/**
 * Update an existing shipping company by id.
 * Only the fields present in `data` are updated.
 * @param {string} id
 * @param {object} data
 */
export async function updateShippingCompany(id, data) {
  const patch = {};

  if (data.name         !== undefined) patch.name         = data.name;
  if (data.logo         !== undefined) patch.logo         = data.logo;
  if (data.description  !== undefined) patch.description  = data.description;
  if (data.deliveryTime !== undefined) patch.deliveryTime = data.deliveryTime;
  if (data.price        !== undefined) patch.price        = parseFloat(data.price) || 0;
  if (data.isFree       !== undefined) patch.isFree       = Boolean(data.isFree);
  if (data.paymentType  !== undefined) patch.paymentType  = toPaymentTypeEnum(data.paymentType);
  if (data.deposit      !== undefined) patch.deposit      = parseFloat(data.deposit) || 0;
  if (data.isActive     !== undefined) patch.isActive     = Boolean(data.isActive);
  if (data.sortOrder    !== undefined) patch.sortOrder    = parseInt(data.sortOrder, 10) || 0;

  try {
    const row = await prisma.shippingCompany.update({ where: { id }, data: patch });
    return mapCompany(row);
  } catch (err) {
    if (err.code === 'P2025') return null; // record not found
    throw err;
  }
}

/**
 * Delete a shipping company by id.
 * Returns the deleted row, or null if not found.
 * @param {string} id
 */
export async function deleteShippingCompany(id) {
  try {
    const row = await prisma.shippingCompany.delete({ where: { id } });
    return mapCompany(row);
  } catch (err) {
    if (err.code === 'P2025') return null;
    throw err;
  }
}
