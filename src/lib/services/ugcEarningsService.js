/**
 * src/lib/services/ugcEarningsService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * UGC earnings ledger service. Isolated from affiliateSystemService: all UGC
 * money logic lives here. Exposes:
 *   • recordUgcEarning()        — crash-safe, idempotent earning insert
 *   • getUgcBalanceComponent()  — read-only balance provider (Decimal)
 *   • getUgcStats()             — dashboard stats (single, aggregate-ready boundary)
 * and registers the UGC balance provider into the balance registry on import.
 *
 * ── TRANSACTION ISOLATION FOR recordUgcEarning() (refinement #1) ──────────────
 * recordUgcEarning writes exactly ONE row (the append-only ledger; balances are
 * DERIVED, never incremented). A single-row INSERT is atomic on its own, so no
 * multi-statement transaction and NO elevated isolation level is required:
 *
 *   • Isolation level: the PostgreSQL/Prisma DEFAULT (READ COMMITTED). We do NOT
 *     use Serializable here — correctness does not depend on serializing reads
 *     against writes (there is no read-modify-write), it depends ONLY on the
 *     UNIQUE("idempotencyKey") constraint.
 *   • Exactly-once: two concurrent inserts with the same deterministic key
 *     (ugcVideoId:generationPeriod) race at the unique index — one commits, the
 *     other raises P2002 and is reported as an EXPECTED duplicate (suppressed,
 *     logged, not thrown).
 *   • Crash safety: because the insert is atomic, an unexpected termination
 *     leaves either a fully-committed earning or nothing — never a partial row.
 *     Re-running the same period recomputes the same key, so a committed earning
 *     is skipped (P2002) and a missing one is created. Combined with the engine's
 *     advisory lock (single runner) this cannot produce duplicate or inconsistent
 *     earnings.
 *
 * Contrast: affiliateSystemService.requestPayout() uses Serializable because it
 * DOES read-then-write (reads balance, then inserts a payout) and must serialize
 * concurrent withdrawals. recordUgcEarning has no such read-modify-write.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';
import { Prisma } from '../../generated/prisma/index.js';
import { registerBalanceProvider, BALANCE_PRIORITY } from '../balance/providerRegistry.js';
import { serializeAmount } from '../balance/composeBalance.js';
import {
  UGC_EARNING_STATUS, buildEarningResult,
  buildIdempotencyKey, computeEarningAmount,
} from '../ugcEarnings.js';

const Decimal = Prisma.Decimal;

// Ledger statuses that count toward the withdrawable balance.
const BALANCE_ELIGIBLE_STATUS = 'available';

/**
 * Insert one UGC earning, crash-safely and idempotently.
 * @param {object} p
 * @param {string} p.affiliateId
 * @param {string} p.ugcVideoId
 * @param {string} p.productId
 * @param {number} p.generatedSales
 * @param {number|string} p.commissionPerSale  snapshot at generation time
 * @param {string} p.generationPeriod
 * @param {Date}   p.generationDate
 * @param {object} [p.log]  optional cycle logger (earningGenerated/duplicateSuppressed/failure)
 * @param {*}      [p.db]   Prisma client (defaults to the shared client)
 * @returns {Promise<{status:string, amount:string|null, idempotencyKey:string|null, reason?:string}>}
 */
export async function recordUgcEarning(p) {
  const {
    affiliateId, ugcVideoId, productId, generatedSales, commissionPerSale,
    generationPeriod, generationDate, log, db = prisma,
  } = p || {};

  const idempotencyKey = buildIdempotencyKey(ugcVideoId, generationPeriod);

  // Nothing to record — not an error, an explicit skip.
  if (!(Number(generatedSales) > 0)) {
    return buildEarningResult({ status: UGC_EARNING_STATUS.SKIPPED, idempotencyKey, reason: 'no generated sales' });
  }

  const amount = computeEarningAmount(generatedSales, commissionPerSale); // Decimal, snapshot commission

  try {
    // Single atomic insert (see isolation note above). READ COMMITTED default.
    await db.ugcEarning.create({
      data: {
        affiliateId,
        ugcVideoId,
        productId,
        generatedSales: Number(generatedSales),
        commissionPerSale: new Decimal(commissionPerSale),
        amount,
        generationDate,
        generationPeriod,
        idempotencyKey,
        status: BALANCE_ELIGIBLE_STATUS,
      },
    });
    if (log && log.earningGenerated) log.earningGenerated({ ugcVideoId, affiliateId, amount, generatedSales, idempotencyKey });
    return buildEarningResult({ status: UGC_EARNING_STATUS.CREATED, amount, idempotencyKey });
  } catch (err) {
    if (err && err.code === 'P2002') {
      // Unique idempotencyKey → expected duplicate suppression, never an error.
      if (log && log.duplicateSuppressed) log.duplicateSuppressed({ ugcVideoId, idempotencyKey });
      return buildEarningResult({ status: UGC_EARNING_STATUS.DUPLICATE, idempotencyKey, reason: 'already generated for this period' });
    }
    if (log && log.failure) log.failure({ ugcVideoId, error: err });
    return buildEarningResult({ status: UGC_EARNING_STATUS.ERROR, idempotencyKey, reason: (err && err.message) || 'insert failed' });
  }
}

/**
 * READ-ONLY balance provider: Σ available UgcEarning.amount for an affiliate.
 * Returns a Prisma.Decimal (stays Decimal through composition — no round-trip).
 * Pure read; never writes. Safe to run inside the payout Serializable transaction.
 */
export async function getUgcBalanceComponent(affiliateId, db = prisma) {
  const agg = await db.ugcEarning.aggregate({
    where: { affiliateId, status: BALANCE_ELIGIBLE_STATUS },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? new Decimal(0);
}

// Register the UGC balance provider (idempotent by source). Loading this module
// wires UGC earnings into the composed affiliate balance.
registerBalanceProvider({
  source: 'ugc_earning',
  priority: BALANCE_PRIORITY.UGC_EARNING,
  compute: getUgcBalanceComponent,
});

/**
 * Dashboard stats for UGC earnings. Single boundary: today it aggregates the
 * ledger; it can later read a daily-aggregate rollup with no change to callers.
 */
export async function getUgcStats(affiliateId, db = prisma) {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const [todayAgg, totalAgg] = await Promise.all([
    db.ugcEarning.aggregate({
      where: { affiliateId, status: BALANCE_ELIGIBLE_STATUS, generationDate: { gte: startOfToday } },
      _sum: { amount: true, generatedSales: true },
    }),
    db.ugcEarning.aggregate({
      where: { affiliateId, status: BALANCE_ELIGIBLE_STATUS },
      _sum: { amount: true, generatedSales: true },
    }),
  ]);

  return {
    todayEarnings: serializeAmount(todayAgg._sum.amount ?? 0),
    totalEarnings: serializeAmount(totalAgg._sum.amount ?? 0),
    todaySales:    todayAgg._sum.generatedSales ?? 0,
    totalSales:    totalAgg._sum.generatedSales ?? 0,
  };
}

/**
 * PER-VIDEO stats from the SAME ledger, grouped by `ugcVideoId`. Read-only; no
 * frontend calculation, no duplication of the affiliate-wide totals — this reads
 * the exact same `ugc_earnings` rows the engine writes, just grouped.
 *
 * @returns {Promise<Record<string, {todayEarnings:number, totalEarnings:number, todaySales:number, totalSales:number}>>}
 *          keyed by ugcVideoId (earnings are 2dp-rounded Numbers, same as getUgcStats).
 *          Videos with no earnings simply don't appear.
 */
export async function getUgcStatsByVideo(affiliateId, db = prisma) {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const [todayRows, totalRows] = await Promise.all([
    db.ugcEarning.groupBy({
      by: ['ugcVideoId'],
      where: { affiliateId, status: BALANCE_ELIGIBLE_STATUS, generationDate: { gte: startOfToday } },
      _sum: { amount: true, generatedSales: true },
    }),
    db.ugcEarning.groupBy({
      by: ['ugcVideoId'],
      where: { affiliateId, status: BALANCE_ELIGIBLE_STATUS },
      _sum: { amount: true, generatedSales: true },
    }),
  ]);

  const map = {};
  const ensure = (id) => (map[id] ||= { todayEarnings: serializeAmount(0), totalEarnings: serializeAmount(0), todaySales: 0, totalSales: 0 });
  for (const r of totalRows) {
    const e = ensure(r.ugcVideoId);
    e.totalEarnings = serializeAmount(r._sum.amount ?? 0);
    e.totalSales = r._sum.generatedSales ?? 0;
  }
  for (const r of todayRows) {
    const e = ensure(r.ugcVideoId);
    e.todayEarnings = serializeAmount(r._sum.amount ?? 0);
    e.todaySales = r._sum.generatedSales ?? 0;
  }
  return map;
}
