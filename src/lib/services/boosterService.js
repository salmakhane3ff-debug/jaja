/**
 * src/lib/services/boosterService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Starter Booster purchases — paid with the EXISTING affiliate balance or via
 * the existing manual (bank-transfer) payment flow. NO separate wallet:
 *
 *   • BALANCE: inside ONE Serializable transaction the balance is re-read
 *     (registered providers, same as payouts) and the purchase row is created
 *     with status ACTIVE. The booster_purchase balance provider derives the
 *     deduction from that same row, so the charge and the activation are one
 *     atomic write — the user can never be charged without receiving the
 *     booster, and never activated without the charge.
 *   • CARD: the row is created PENDING; an admin validates it (idempotent,
 *     conditional update gated on PENDING — same pattern as deposit review).
 *
 * Duplicate protection: unless the admin enables `allowStacking`, an affiliate
 * cannot hold two PENDING/ACTIVE purchases of the same package (checked inside
 * the same transaction as the insert).
 *
 * Packages are admin-configured (settings row `booster-packages`) — nothing is
 * hardcoded and the module ships DISABLED with an empty catalogue.
 * DB and balance reader are injectable for unit tests.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';
import { getAffiliateBalance, getTopupAvailable } from './affiliateSystemService.js';
import { toDecimal, serializeAmount } from '../balance/composeBalance.js';
import { normalizeSimConfig } from '../boosterSimulation.js';

export const BOOSTER_STATUS = { PENDING: 'PENDING', ACTIVE: 'ACTIVE', REJECTED: 'REJECTED' };
export const BOOSTER_METHODS = ['BALANCE', 'CARD'];
const MAX_PRICE = 1_000_000;

const err = (code, message) => Object.assign(new Error(message), { code });
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// ── Package configuration (admin-managed, never hardcoded) ────────────────────
export function normalizeBoosterConfig(raw = {}) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const packages = (Array.isArray(c.packages) ? c.packages : [])
    .filter((p) => p && typeof p === 'object')
    .map((p, i) => ({
      id:          String(p.id || `pkg${i + 1}`).trim(),
      name:        String(p.name || '').trim(),
      price:       Math.min(MAX_PRICE, Math.max(0, num(p.price, 0))),
      description: String(p.description || '').trim(),
      emoji:       String(p.emoji || '🚀').trim() || '🚀',
      active:      p.active !== false,
      // ── Presentation metadata (additive, admin-editable, never hardcoded) ──
      // Drives the package cards + the progress dashboard. 0 = "not configured",
      // and the UI then hides that line instead of inventing a value.
      durationDays: Math.max(0, Math.round(num(p.durationDays, 0))),
      targetSales:  Math.max(0, Math.round(num(p.targetSales, 0))),
      dailyMin:     Math.max(0, Math.round(num(p.dailyMin, 0))),
      dailyMax:     Math.max(0, Math.round(num(p.dailyMax, 0))),
    }))
    .map((p) => (p.dailyMin > p.dailyMax && p.dailyMax > 0
      ? { ...p, dailyMin: p.dailyMax, dailyMax: p.dailyMin } : p)) // swap if inverted
    .filter((p) => p.name && p.price > 0)
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))); // unique ids
  return {
    enabled:       c.enabled === true,   // ships OFF until the admin opts in
    allowStacking: c.allowStacking === true,
    packages,
    // DEMO simulation engine settings (see boosterSimulation.js).
    simulation:    normalizeSimConfig(c.simulation),
  };
}

export async function getBoosterConfig(db = prisma) {
  const row = await db.setting.findUnique({ where: { id: 'booster-packages' } }).catch(() => null);
  return normalizeBoosterConfig(row?.data);
}

/** Packages visible to affiliates (active only). */
export function publicBoosterPackages(config) {
  return (config?.packages || []).filter((p) => p.active);
}

// ── Purchases ─────────────────────────────────────────────────────────────────
export async function listBoosterPurchases(affiliateId, db = prisma) {
  return db.affiliateBoosterPurchase.findMany({
    where: { affiliateId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Purchase a booster package.
 *
 * BALANCE payments consume the TOP-UP component FIRST, then earnings, and the
 * split is snapshotted on the row (paidFromTopup / paidFromEarnings) so the
 * attribution is fixed at purchase time — a later top-up can never retroactively
 * turn already-spent earnings back into withdrawable funds.
 *
 * @param {object} p { affiliateId, packageId, method: 'BALANCE'|'CARD' }
 * @param {object} [deps] { db, getBalance, getTopup } — injectable for tests
 * @returns {Promise<object>} the created purchase row
 */
export async function purchaseBooster({ affiliateId, packageId, method }, deps = {}) {
  const { db = prisma, getBalance = getAffiliateBalance, getTopup = getTopupAvailable } = deps;

  if (!BOOSTER_METHODS.includes(method)) throw err('INVALID_METHOD', 'Méthode de paiement invalide');

  const config = await getBoosterConfig(db);
  if (!config.enabled) throw err('BOOSTERS_DISABLED', 'Les boosters sont désactivés pour le moment');
  const pkg = publicBoosterPackages(config).find((p) => p.id === String(packageId || ''));
  if (!pkg) throw err('PACKAGE_NOT_FOUND', 'Pack introuvable ou inactif');

  // The whole decision (duplicate check → balance check → insert) runs in ONE
  // Serializable transaction: concurrent double-clicks or a balance that shrank
  // since the UI rendered are rejected at the moment of confirmation.
  return db.$transaction(async (tx) => {
    if (!config.allowStacking) {
      const dup = await tx.affiliateBoosterPurchase.findFirst({
        where: { affiliateId, packageId: pkg.id, status: { in: [BOOSTER_STATUS.PENDING, BOOSTER_STATUS.ACTIVE] } },
      });
      if (dup) throw err('ALREADY_OWNED', 'Vous avez déjà ce pack (actif ou en attente)');
    }

    if (method === 'BALANCE') {
      // Both reads happen inside the Serializable tx, so the split is computed
      // from the same consistent snapshot that authorizes the purchase.
      const [balance, topupAvail] = await Promise.all([
        getBalance(affiliateId, tx),
        getTopup(affiliateId, tx),
      ]);
      if (pkg.price > balance) throw err('INSUFFICIENT_BALANCE', 'Solde insuffisant');

      // Top-up first, remainder from earnings (Decimal — no float drift).
      const price = toDecimal(pkg.price);
      const topupCap = toDecimal(Math.max(0, Number(topupAvail) || 0));
      const fromTopup = topupCap.greaterThan(price) ? price : topupCap;
      const fromEarnings = price.minus(fromTopup);

      // ACTIVE row = charge + activation in one write (provider derives the deduction).
      return tx.affiliateBoosterPurchase.create({
        data: {
          affiliateId, packageId: pkg.id, packageName: pkg.name, price: pkg.price,
          paymentMethod: 'BALANCE', status: BOOSTER_STATUS.ACTIVE, activatedAt: new Date(),
          paidFromTopup:    serializeAmount(fromTopup),
          paidFromEarnings: serializeAmount(fromEarnings),
        },
      });
    }

    // CARD → pending manual validation (existing payment flow; no balance touch).
    return tx.affiliateBoosterPurchase.create({
      data: {
        affiliateId, packageId: pkg.id, packageName: pkg.name, price: pkg.price,
        paymentMethod: 'CARD', status: BOOSTER_STATUS.PENDING,
      },
    });
  }, { isolationLevel: 'Serializable' });
}

/**
 * Admin review of a CARD (PENDING) purchase — idempotent: the conditional
 * updateMany is gated on status=PENDING, so double-clicks/concurrent admins get
 * count 0 and nothing double-activates (same pattern as deposit review).
 */
export async function reviewBoosterPurchase(id, action, db = prisma) {
  if (!['approve', 'reject'].includes(action)) throw err('INVALID_ACTION', 'Action invalide');
  const next = action === 'approve'
    ? { status: BOOSTER_STATUS.ACTIVE, activatedAt: new Date() }
    : { status: BOOSTER_STATUS.REJECTED };
  const r = await db.affiliateBoosterPurchase.updateMany({
    where: { id, status: BOOSTER_STATUS.PENDING },
    data: next,
  });
  if (r.count !== 1) throw err('NOT_PENDING', 'Achat introuvable ou déjà traité');
  return db.affiliateBoosterPurchase.findUnique({ where: { id } });
}

/** Admin list (most recent first; the UI surfaces PENDING rows on top). */
export async function listAllBoosterPurchases(db = prisma, limit = 100) {
  return db.affiliateBoosterPurchase.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { affiliate: { select: { name: true, username: true } } },
  });
}
