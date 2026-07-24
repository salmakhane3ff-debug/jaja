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

/** Deterministic, unique-per-(video,period) idempotency key (legacy daily engine). */
export function buildIdempotencyKey(ugcVideoId, generationPeriod) {
  if (!ugcVideoId || !generationPeriod) {
    throw Object.assign(new Error('Missing ugcVideoId or generationPeriod'), { code: 'UGC_BAD_KEY' });
  }
  return `${ugcVideoId}:${generationPeriod}`;
}

/**
 * Per-SALE idempotency key for the daily-target engine:
 *   sim:<videoId>:<businessDate>:<sequence>
 * `sequence` is the sale's 0-based index within the day (= generatedToday before
 * this sale), so it is unique per (video, business day) and monotonic. The
 * UgcEarning.idempotencyKey UNIQUE constraint is the final double-pay backstop.
 */
export function buildSimKey(ugcVideoId, businessDate, sequence) {
  if (!ugcVideoId || !businessDate || !Number.isInteger(sequence) || sequence < 0) {
    throw Object.assign(new Error('Invalid sim key inputs'), { code: 'UGC_BAD_KEY' });
  }
  return `sim:${ugcVideoId}:${businessDate}:${sequence}`;
}

/** Random integer in [min, max]. RNG injectable. Used for the daily target too. */
export function pickGeneratedSales(min, max, rng = Math.random) {
  const lo = Math.floor(Number(min));
  const hi = Math.floor(Number(max));
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || hi < lo) {
    throw Object.assign(new Error('Invalid sales range'), { code: 'UGC_BAD_RANGE' });
  }
  return lo + Math.floor(rng() * (hi - lo + 1));
}
/** The fixed daily target for a video (random in [min, max]). */
export const pickDailyTarget = pickGeneratedSales;

// ── Adaptive pacing (pure) ─────────────────────────────────────────────────────
// The engine emits INDIVIDUAL sales via a fast ~5s tick. Per pollIntervalMs
// "window", it must emit within [floor, cap]:
//   cap   = min(generationSpeed, remaining)      ← STRICT per-window maximum
//   floor = max(0, remaining − speed×(windowsLeft−1)) clamped to cap
// The floor forces just enough each window that the LAST window can finish the
// exact target without ever exceeding the cap; if the config/timing makes that
// infeasible (late start, worker was offline), floor collapses to cap and the day
// finishes BELOW target — never an over-cap burst (safeguard #6).

/** @returns {{floor:number, cap:number}} the per-window emission band. */
export function computeWindowPlan({ remaining, generationSpeed, windowsLeft }) {
  const rem = Math.max(0, Math.floor(Number(remaining) || 0));
  const speed = Math.max(0, Math.floor(Number(generationSpeed) || 0));
  const wl = Math.max(1, Math.floor(Number(windowsLeft) || 1));
  const cap = Math.min(speed, rem);
  const rawFloor = rem - speed * (wl - 1);
  const floor = Math.max(0, Math.min(rawFloor, cap));
  return { floor, cap };
}

/** Stable [0,1) fraction from a string seed (so a window's target survives restarts). */
export function seedFraction(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 0) / 4294967296;
}

/** Chosen total for THIS window, in [floor, cap] (deterministic per window via seed). */
export function windowTargetCount(floor, cap, seed01) {
  const f = Math.max(0, Math.floor(floor));
  const c = Math.max(f, Math.floor(cap));
  if (c <= f) return c;
  const frac = Math.min(0.9999999, Math.max(0, Number(seed01) || 0));
  return f + Math.floor(frac * (c - f + 1));
}

/**
 * Should this tick emit ONE sale? Paces the window's remaining quota across the
 * ticks left, forcing emission once the quota can only just still be met.
 *
 * Meeting `windowTarget` every window is what makes the DAY exact: windowTarget is
 * always ≥ the feasibility floor, and the LAST window's floor==cap==remaining, so
 * that window absorbs the remainder → the day totals exactly dailyTarget.
 * Never returns true once the quota is met, so the per-window cap is never exceeded.
 */
export function shouldEmitThisTick({ windowTarget, emittedThisWindow, ticksLeftInWindow, rng = Math.random }) {
  const quotaLeft = Math.max(0, Math.floor(windowTarget) - Math.floor(emittedThisWindow));
  if (quotaLeft <= 0) return false;
  const ticks = Math.max(1, Math.floor(ticksLeftInWindow));
  if (quotaLeft >= ticks) return true;        // must fire every remaining tick to meet the quota
  return rng() < quotaLeft / ticks;           // otherwise pace with randomness
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
