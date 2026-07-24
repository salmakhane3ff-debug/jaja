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
import { startOfBusinessDay, businessDayStarts, UGC_DEFAULT_TIMEZONE } from '../ugcTime.js';

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
export async function getUgcStats(affiliateId, db = prisma, tz = UGC_DEFAULT_TIMEZONE) {
  const startOfToday = startOfBusinessDay(new Date(), tz); // business-day boundary (configured TZ)

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
 * Cheap "live" snapshot for the dashboard's short poll: the affiliate's most-recent
 * earning id/time (to detect NEW earnings safely) plus today/total aggregates.
 * Business-day boundary uses the configured TZ.
 */
export async function getUgcLive(affiliateId, db = prisma, tz = UGC_DEFAULT_TIMEZONE) {
  const startOfToday = startOfBusinessDay(new Date(), tz);
  const [last, todayAgg, totalAgg] = await Promise.all([
    db.ugcEarning.findFirst({
      where: { affiliateId, status: BALANCE_ELIGIBLE_STATUS },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    }),
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
    lastEarningId: last?.id ?? null,
    lastEarningAt: last?.createdAt ?? null,
    todayEarnings: serializeAmount(todayAgg._sum.amount ?? 0),
    todaySales:    todayAgg._sum.generatedSales ?? 0,
    totalEarnings: serializeAmount(totalAgg._sum.amount ?? 0),
    totalSales:    totalAgg._sum.generatedSales ?? 0,
  };
}

/**
 * Day-over-day earnings trend, in whole percent. PURE + crash-safe — never returns
 * Infinity/NaN.
 *   • yesterday > 0            → round(((today − yesterday) / yesterday) × 100)
 *   • yesterday 0 & today > 0  → null  (caller renders "Nouveau")
 *   • both 0                   → 0     (unchanged)
 * @returns {number|null}
 */
export function earningsTrendPercent(today, yesterday) {
  const t = Number(today);
  const y = Number(yesterday);
  const tt = Number.isFinite(t) ? t : 0;
  const yy = Number.isFinite(y) ? y : 0;
  if (yy === 0) return tt > 0 ? null : 0;
  const pct = ((tt - yy) / yy) * 100;
  return Number.isFinite(pct) ? Math.round(pct) : 0;
}

/**
 * Performance status from the day-over-day trend. PURE.
 *   • HOT     — today ≥ yesterday AND trend ≥ +20%  (a brand-new earner, trend=null, counts as HOT)
 *   • Stable  — trend in [-10%, +20%)
 *   • Cooling — trend < -10%
 * @returns {'HOT'|'Stable'|'Cooling'}
 */
export function performanceStatus(trendPercent, today = 0, yesterday = 0) {
  const t = Number(today) || 0;
  const y = Number(yesterday) || 0;
  if (trendPercent === null) return t > 0 ? 'HOT' : 'Stable';   // "Nouveau" positive earner
  const p = Number.isFinite(trendPercent) ? trendPercent : 0;
  if (p >= 20 && t >= y) return 'HOT';
  if (p < -10) return 'Cooling';
  return 'Stable';
}

/**
 * PER-VIDEO stats from the SAME ledger, grouped by `ugcVideoId`. Read-only; no
 * frontend calculation, no duplication of the affiliate-wide totals — this reads
 * the exact same `ugc_earnings` rows the engine writes, just grouped.
 *
 * Day boundaries use the module's existing UTC convention (generationDate is the
 * UTC day bucket; see getUgcStats). "Yesterday" is [startOfYesterday, startOfToday).
 * The trend compares today-vs-yesterday only — never lifetime totals, which only grow.
 *
 * Also returns (all derived from the SAME ledger — no schema change):
 *   • last7DaysEarnings — 7 daily earnings (oldest→newest UTC day, zero-filled)
 *   • rank              — 1-based rank by today's earnings (desc; total as tiebreak)
 *   • performanceStatus — HOT | Stable | Cooling
 *
 * @returns {Promise<Record<string, {
 *   todayEarnings:number, todaySales:number,
 *   yesterdayEarnings:number, yesterdaySales:number,
 *   totalEarnings:number, totalSales:number,
 *   earningsTrendPercent:number|null, salesDifference:number,
 *   last7DaysEarnings:number[], rank:number, performanceStatus:string}>>}
 *   keyed by ugcVideoId (earnings are 2dp-rounded Numbers, same as getUgcStats).
 *   Videos with no earnings simply don't appear.
 */
export async function getUgcStatsByVideo(affiliateId, db = prisma, tz = UGC_DEFAULT_TIMEZONE) {
  // Business-day buckets in the configured TZ (oldest→newest, [6]=today).
  const days = businessDayStarts(new Date(), tz, 7);
  const startOfToday = days[6];
  const startOfYesterday = days[5];
  const start7 = days[0];
  const dayMs = days.map((d) => d.getTime());

  const group = (where) => db.ugcEarning.groupBy({
    by: ['ugcVideoId'],
    where: { affiliateId, status: BALANCE_ELIGIBLE_STATUS, ...where },
    _sum: { amount: true, generatedSales: true },
  });

  const [todayRows, yesterdayRows, totalRows, dailyRows] = await Promise.all([
    group({ generationDate: { gte: startOfToday } }),
    group({ generationDate: { gte: startOfYesterday, lt: startOfToday } }),
    group({}),
    // Per (video, business day) over the last 7 days → the sparkline series.
    db.ugcEarning.groupBy({
      by: ['ugcVideoId', 'generationDate'],
      where: { affiliateId, status: BALANCE_ELIGIBLE_STATUS, generationDate: { gte: start7 } },
      _sum: { amount: true },
    }),
  ]);

  const map = {};
  const ensure = (id) => (map[id] ||= {
    todayEarnings: serializeAmount(0), todaySales: 0,
    yesterdayEarnings: serializeAmount(0), yesterdaySales: 0,
    totalEarnings: serializeAmount(0), totalSales: 0,
    earningsTrendPercent: 0, salesDifference: 0,
    last7DaysEarnings: [0, 0, 0, 0, 0, 0, 0], rank: 0, performanceStatus: 'Stable',
  });
  for (const r of totalRows) {
    const e = ensure(r.ugcVideoId);
    e.totalEarnings = serializeAmount(r._sum.amount ?? 0);
    e.totalSales = r._sum.generatedSales ?? 0;
  }
  for (const r of yesterdayRows) {
    const e = ensure(r.ugcVideoId);
    e.yesterdayEarnings = serializeAmount(r._sum.amount ?? 0);
    e.yesterdaySales = r._sum.generatedSales ?? 0;
  }
  for (const r of todayRows) {
    const e = ensure(r.ugcVideoId);
    e.todayEarnings = serializeAmount(r._sum.amount ?? 0);
    e.todaySales = r._sum.generatedSales ?? 0;
  }
  // Sparkline: match each row's business-day bucket to its slot (0=oldest, 6=today).
  // generationDate is stored as the exact business-day start instant, so we match
  // by equality against the computed day starts (robust across TZ/DST).
  for (const r of dailyRows) {
    const e = ensure(r.ugcVideoId);
    const gd = r.generationDate instanceof Date ? r.generationDate : new Date(r.generationDate);
    const idx = dayMs.indexOf(gd.getTime());
    if (idx >= 0 && idx <= 6) e.last7DaysEarnings[idx] = serializeAmount(r._sum.amount ?? 0);
  }
  for (const e of Object.values(map)) {
    e.earningsTrendPercent = earningsTrendPercent(e.todayEarnings, e.yesterdayEarnings);
    e.salesDifference = (e.todaySales || 0) - (e.yesterdaySales || 0);
    e.performanceStatus = performanceStatus(e.earningsTrendPercent, e.todayEarnings, e.yesterdayEarnings);
  }
  // Rank active videos by today's earnings (desc), lifetime total as tiebreak.
  Object.entries(map)
    .sort((a, b) => (b[1].todayEarnings - a[1].todayEarnings) || (b[1].totalEarnings - a[1].totalEarnings))
    .forEach(([id], i) => { map[id].rank = i + 1; });

  return map;
}
