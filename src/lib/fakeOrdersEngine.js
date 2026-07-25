/**
 * src/lib/fakeOrdersEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fake Orders Engine — orchestration CORE (one tick), fully dependency-injected
 * and DB-agnostic so every scheduling rule is unit-testable without a database.
 *
 * The tick loop, PostgreSQL advisory lock and graceful shutdown live in the
 * standalone runner scripts/fake-orders-engine.mjs (mirrors the UGC engine).
 *
 * GUARANTEE — "never exceed the configured limits": before each emission the
 * tick re-reads the affiliate's fake-order counts for the minute / hour / day
 * windows and refuses to emit if ANY configured cap is already reached. The
 * per-affiliate random delay (nextOrderAt) and the working-hours / working-days
 * window are enforced on top.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from './prisma.js';
import { UGC_DEFAULT_TIMEZONE } from './ugcTime.js';
import { createFakeOrder, countFakeOrdersInWindows } from './services/fakeOrderService.js';

export const FAKE_ENGINE_LOCK_KEY = 0x464b4f45; // "FKOE" — distinct from the UGC lock
export const FAKE_TICK_MS = 60_000;             // decision cadence (~1 min)

// ── Time helpers (business timezone) ─────────────────────────────────────────

/** Local hour (0-23) and weekday (0=Sun … 6=Sat) of `date` in timezone `tz`. */
export function tzHourAndWeekday(date, tz = UGC_DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  }).formatToParts(date);
  const m = {};
  for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value;
  let hour = parseInt(m.hour, 10); if (hour === 24) hour = 0;
  const weekday = new Date(Date.UTC(+m.year, +m.month - 1, +m.day)).getUTCDay();
  return { hour, weekday };
}

// ── Pure decision rules ──────────────────────────────────────────────────────

/** Is `now` inside the config's working days AND working-hours window? */
export function isWithinWorkingWindow(config, now, tz = UGC_DEFAULT_TIMEZONE) {
  const { hour, weekday } = tzHourAndWeekday(now, tz);
  const days = String(config.workingDays || '')
    .split(',').map((d) => parseInt(d, 10)).filter((d) => d >= 0 && d <= 6);
  if (days.length && !days.includes(weekday)) return false;

  const s = config.workingHourStart ?? 0;
  const e = config.workingHourEnd ?? 24;
  if (s === e) return true;               // 24h window
  if (s < e)  return hour >= s && hour < e;
  return hour >= s || hour < e;           // overnight window (e.g. 22 → 6)
}

/** Which configured rate limit (if any) is already reached. */
export function limitReached(config, counts) {
  if (config.ordersPerMinute != null && counts.minute >= config.ordersPerMinute) return 'PER_MINUTE';
  if (config.ordersPerHour   != null && counts.hour   >= config.ordersPerHour)   return 'PER_HOUR';
  if (config.ordersPerDay    != null && counts.day    >= config.ordersPerDay)    return 'PER_DAY';
  return null;
}

/**
 * Decide whether one config may emit a fake order at `now`.
 * @returns {{emit:boolean, reason:string}}
 */
export function decideEmit(config, { now, counts, tz = UGC_DEFAULT_TIMEZONE }) {
  if (!config.enabled) return { emit: false, reason: 'DISABLED' };
  if (!isWithinWorkingWindow(config, now, tz)) return { emit: false, reason: 'OUTSIDE_WINDOW' };
  if (config.nextOrderAt && now.getTime() < new Date(config.nextOrderAt).getTime()) {
    return { emit: false, reason: 'DELAY' };
  }
  const lim = limitReached(config, counts);
  if (lim) return { emit: false, reason: lim };
  return { emit: true, reason: 'OK' };
}

/** Random delay (seconds) before this config's next order. */
export function randDelaySec(config, rng = Math.random) {
  const min = Math.max(0, config.minDelaySec ?? 60);
  const max = Math.max(min, config.maxDelaySec ?? min);
  return Math.floor(rng() * (max - min + 1)) + min;
}

function normalizeConfigRow(row) {
  return {
    ...row,
    productIds: Array.isArray(row.productIds) ? row.productIds : [],
  };
}

// ── One tick ─────────────────────────────────────────────────────────────────

/**
 * Run ONE engine tick: for every enabled config, emit at most one fake order if
 * all limits / schedule / delay allow it, then arm the next random delay.
 *
 * @param {object} [deps]
 *   @param {*}        deps.db            Prisma-like client (default real prisma)
 *   @param {()=>Date} deps.now           clock (default () => new Date())
 *   @param {()=>number} deps.rng         RNG (default Math.random)
 *   @param {string}   deps.tz            business timezone
 *   @param {{acquire,release}} deps.lock advisory lock (optional)
 *   @param {Function} deps.createOrderFn createFakeOrder impl (injectable)
 *   @param {Function} deps.countFn       countFakeOrdersInWindows impl (injectable)
 * @returns {Promise<{emitted:number, results:Array, skipped?:string}>}
 */
export async function runFakeOrdersTick(deps = {}) {
  const {
    db = prisma,
    now = () => new Date(),
    rng = Math.random,
    tz = UGC_DEFAULT_TIMEZONE,
    lock,
    createOrderFn = createFakeOrder,
    countFn = countFakeOrdersInWindows,
  } = deps;

  let held = true;
  if (lock && typeof lock.acquire === 'function') {
    held = await lock.acquire();
    if (!held) return { skipped: 'no_lock', emitted: 0, results: [] };
  }

  try {
    const rows = await db.fakeOrderConfig.findMany({ where: { enabled: true } });
    const results = [];
    let emitted = 0;

    for (const raw of rows) {
      const config = normalizeConfigRow(raw);
      const at = now();
      const counts = await countFn(config.affiliateId, at, db);
      const decision = decideEmit(config, { now: at, counts, tz });

      if (!decision.emit) {
        results.push({ affiliateId: config.affiliateId, emitted: false, reason: decision.reason });
        continue;
      }

      const res = await createOrderFn(config, { db, rng, now });
      if (res.ok) {
        emitted++;
        const next = new Date(at.getTime() + randDelaySec(config, rng) * 1000);
        await db.fakeOrderConfig.update({
          where: { id: config.id },
          data:  { lastOrderAt: at, nextOrderAt: next },
        });
        results.push({ affiliateId: config.affiliateId, emitted: true, reason: 'EMITTED', orderId: res.orderId });
      } else {
        results.push({ affiliateId: config.affiliateId, emitted: false, reason: res.reason });
      }
    }

    return { emitted, results };
  } finally {
    if (held && lock && typeof lock.release === 'function') {
      try { await lock.release(); } catch { /* release never masks the result */ }
    }
  }
}
