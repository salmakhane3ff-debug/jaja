/**
 * src/lib/services/promoService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD + validation for the `promos` table.
 *
 * PromoType enum: PERCENT | FIXED
 * Serialised to lowercase in mapPromo so callers can compare with
 * === "percent" / === "fixed" exactly as in Project A.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise a type string to the Prisma enum value. */
function toPromoTypeEnum(raw) {
  if (!raw) return 'PERCENT';
  const map = {
    percent: 'PERCENT',
    PERCENT: 'PERCENT',
    fixed:   'FIXED',
    FIXED:   'FIXED',
  };
  return map[raw] ?? 'PERCENT';
}

/** Serialise a DB row for API consumers. */
function mapPromo(p) {
  if (!p) return null;
  return {
    _id: p.id,
    ...p,
    // Lowercase so checkout comparisons (=== "percent" / "fixed") keep working
    type: p.type.toLowerCase(),
  };
}

// ── Validation query ──────────────────────────────────────────────────────────

/**
 * Find a promo by code and validate it is currently usable.
 * Rules:
 *   - isActive must be true
 *   - expiresAt must be null or in the future
 *   - if maxUses is set, usedCount must be < maxUses
 *
 * Returns the mapped promo row, or null if not found / invalid.
 *
 * @param {string} code
 */
export async function getPromoByCode(code) {
  if (!code) return null;

  const promo = await prisma.promo.findUnique({
    where: { code: code.trim().toUpperCase() },
  });

  if (!promo) return null;
  if (!promo.isActive) return null;
  if (promo.expiresAt && promo.expiresAt < new Date()) return null;
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return null;

  return mapPromo(promo);
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * Return all promos for the admin panel, newest first.
 */
export async function getAllPromos() {
  const rows = await prisma.promo.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mapPromo);
}

/**
 * Create a new promo code.
 * @param {object} data
 */
export async function createPromo(data) {
  const row = await prisma.promo.create({
    data: {
      code:      data.code.trim().toUpperCase(),
      type:      toPromoTypeEnum(data.type),
      value:     parseFloat(data.value)    || 0,
      minOrder:  parseFloat(data.minOrder) || 0,
      maxUses:   data.maxUses !== undefined && data.maxUses !== null
                   ? parseInt(data.maxUses, 10)
                   : null,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      isActive:  data.isActive !== undefined ? Boolean(data.isActive) : true,
    },
  });
  return mapPromo(row);
}

/**
 * Update an existing promo by id.
 * Only fields present in `data` are updated.
 * @param {string} id
 * @param {object} data
 */
export async function updatePromo(id, data) {
  const patch = {};

  if (data.code      !== undefined) patch.code      = data.code.trim().toUpperCase();
  if (data.type      !== undefined) patch.type      = toPromoTypeEnum(data.type);
  if (data.value     !== undefined) patch.value     = parseFloat(data.value)    || 0;
  if (data.minOrder  !== undefined) patch.minOrder  = parseFloat(data.minOrder) || 0;
  if (data.maxUses   !== undefined) patch.maxUses   = data.maxUses !== null
                                                        ? parseInt(data.maxUses, 10)
                                                        : null;
  if (data.expiresAt !== undefined) patch.expiresAt = data.expiresAt
                                                        ? new Date(data.expiresAt)
                                                        : null;
  if (data.isActive  !== undefined) patch.isActive  = Boolean(data.isActive);

  try {
    const row = await prisma.promo.update({ where: { id }, data: patch });
    return mapPromo(row);
  } catch (err) {
    if (err.code === 'P2025') return null; // record not found
    throw err;
  }
}

/**
 * Delete a promo by id.
 * Returns the deleted row, or null if not found.
 * @param {string} id
 */
export async function deletePromo(id) {
  try {
    const row = await prisma.promo.delete({ where: { id } });
    return mapPromo(row);
  } catch (err) {
    if (err.code === 'P2025') return null;
    throw err;
  }
}

/**
 * Atomically increment usedCount for a promo code after a successful order.
 * Silently no-ops if the code does not exist.
 * @param {string} code
 */
export async function incrementPromoUsage(code) {
  if (!code) return;
  try {
    await prisma.promo.update({
      where: { code: code.trim().toUpperCase() },
      data:  { usedCount: { increment: 1 } },
    });
  } catch (err) {
    if (err.code === 'P2025') return; // code not found — ignore
    throw err;
  }
}
