/**
 * src/lib/ugcEarnings.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure primitives for the crash-safe UGC earnings engine. No DB here — these are
 * the deterministic building blocks the engine and the earnings service use.
 *
 * CRASH-SAFETY MODEL (refinement #3) — three independent layers:
 *   1. Advisory lock  — one instance runs a cycle at a time (engine, dedicated
 *                       connection, released in finally).
 *   2. DB transaction — each earning is inserted atomically; a crash mid-write
 *                       commits nothing (no partial/inconsistent row).
 *   3. Idempotency key — `ugcVideoId:generationPeriod` is UNIQUE and DETERMINISTIC:
 *                       re-running the same period recomputes the SAME key, so a
 *                       duplicate insert violates the constraint and is skipped.
 *
 * The generated SALES COUNT is random, but idempotency keys on the PERIOD, not the
 * amount — so a retry after a committed write finds the existing row and does
 * nothing (the first count stands); a retry after a crash-before-commit inserts
 * once. Either way: never a duplicate, never an inconsistent earning.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Prisma } from '../generated/prisma/index.js';
const Decimal = Prisma.Decimal;

export const UGC_GRANULARITY = Object.freeze({ DAILY: 'daily', HOURLY: 'hourly' });

// recordUgcEarning() returns one of these structured results (refinement #3) —
// never a bare boolean — so callers can log/branch precisely:
//   created    → a new earning row was inserted this call
//   duplicate  → the idempotency key already existed (expected suppression)
//   skipped    → nothing to generate (e.g. 0 sales, engine disabled for this row)
//   error      → an unexpected failure (reason set)
export const UGC_EARNING_STATUS = Object.freeze({
  CREATED:   'created',
  DUPLICATE: 'duplicate',
  SKIPPED:   'skipped',
  ERROR:     'error',
});

/**
 * Build the structured result object. `amount` is serialized to a STRING (never a
 * lossy Number) to keep the money value Decimal-faithful across the boundary.
 * @returns {{status:string, amount:string|null, idempotencyKey:string|null, reason?:string}}
 */
export function buildEarningResult({ status, amount = null, idempotencyKey = null, reason = null } = {}) {
  if (!Object.values(UGC_EARNING_STATUS).includes(status)) {
    throw Object.assign(new Error(`Invalid earning result status: ${status}`), { code: 'UGC_BAD_RESULT' });
  }
  return {
    status,
    amount: amount == null ? null : String(amount),
    idempotencyKey: idempotencyKey || null,
    ...(reason ? { reason } : {}),
  };
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * Deterministic period identifier for a date (UTC). Same date + granularity ⇒
 * same string, so it is a stable idempotency bucket independent of wall-clock jitter.
 *
 * CONTRACT: the engine uses UTC-DAY granularity, giving exactly one earning per
 * RUNNING video per UTC calendar day (the period is part of the UNIQUE idempotency
 * key). The HOURLY option exists for future use ONLY — switching the engine to it,
 * or to a non-UTC timezone, is a MONEY-PATH MIGRATION (new key space, risk of
 * re-paying settled periods), never a plain config change.
 */
export function generationPeriod(date, granularity = UGC_GRANULARITY.DAILY) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw Object.assign(new Error('Invalid date for generationPeriod'), { code: 'UGC_BAD_DATE' });
  }
  const base = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return granularity === UGC_GRANULARITY.HOURLY ? `${base}T${pad(d.getUTCHours())}` : base;
}

/** The UTC day-bucket Date for the ledger's aggregate-ready `generationDate`. */
export function generationDateOf(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw Object.assign(new Error('Invalid date for generationDate'), { code: 'UGC_BAD_DATE' });
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Deterministic, unique-per-(video,period) idempotency key. */
export function buildIdempotencyKey(ugcVideoId, generationPeriod) {
  if (!ugcVideoId || !generationPeriod) {
    throw Object.assign(new Error('Missing ugcVideoId or generationPeriod'), { code: 'UGC_BAD_KEY' });
  }
  return `${ugcVideoId}:${generationPeriod}`;
}

/** Random integer sales count in [min, max]. RNG is injectable for deterministic tests. */
export function pickGeneratedSales(min, max, rng = Math.random) {
  const lo = Math.floor(Number(min));
  const hi = Math.floor(Number(max));
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || hi < lo) {
    throw Object.assign(new Error('Invalid sales range'), { code: 'UGC_BAD_RANGE' });
  }
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/**
 * Decimal-safe earning amount = generatedSales × commissionPerSale, HALF_UP 2dp.
 * commissionPerSale is the SNAPSHOT captured at generation time.
 * @returns {Decimal}
 */
export function computeEarningAmount(generatedSales, commissionPerSale) {
  const sales = Number(generatedSales);
  if (!Number.isInteger(sales) || sales < 0) {
    throw Object.assign(new Error('generatedSales must be a non-negative integer'), { code: 'UGC_BAD_SALES' });
  }
  let commission;
  try {
    commission = new Decimal(commissionPerSale);
  } catch {
    throw Object.assign(new Error('Invalid commissionPerSale'), { code: 'UGC_BAD_COMMISSION' });
  }
  if (!commission.isFinite() || commission.isNegative()) {
    throw Object.assign(new Error('commissionPerSale must be >= 0'), { code: 'UGC_BAD_COMMISSION' });
  }
  return commission.times(sales).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
