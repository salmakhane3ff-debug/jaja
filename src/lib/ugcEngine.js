/**
 * src/lib/ugcEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The UGC simulation engine CORE — ONE adaptive emission tick, fully dependency-
 * injected so it runs deterministically in tests without a DB, clock, or RNG.
 *
 * Model (daily-target, individual sales):
 *   • Each RUNNING video has a fixed random DAILY TARGET in [min, max], generated
 *     once per business day (configured timezone).
 *   • A fast ~5s tick emits INDIVIDUAL simulated sales (one UgcEarning each,
 *     generatedSales=1, amount=commissionPerSale) at natural, uneven times.
 *   • generationSpeed is a STRICT maximum per pollIntervalMs window.
 *   • Adaptive pacing (computeWindowPlan + shouldEmitThisTick) hits the EXACT
 *     daily target when the video ran with enough capacity, and otherwise finishes
 *     BELOW target — never an over-cap burst.
 *   • All progress is DB-derived (generatedToday + this window's ledger count), so
 *     a PM2 restart resumes correctly with no double-pay.
 *
 * The tick loop, OS-signal shutdown and the PostgreSQL advisory lock live in the
 * standalone runner (scripts/ugc-earnings-engine.mjs); this module is pure
 * orchestration so it stays unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from './prisma.js';
import { UGC_STATUS } from './ugcStatus.js';
import {
  normalizeUgcSettings, validateUgcSettings, isEngineRunnable, UGC_MIN_POLL_INTERVAL_MS,
} from './ugcSettings.js';
import {
  computeWindowPlan, windowTargetCount, seedFraction, shouldEmitThisTick,
} from './ugcEarnings.js';
import { startOfBusinessDay, endOfBusinessDay } from './ugcTime.js';
import {
  getOrCreateDailyTarget as realGetOrCreateDailyTarget,
  emitOneSale as realEmitOneSale,
} from './services/ugcDailyTargetService.js';
import { getSettings as realGetSettings } from './services/settingsService.js';
import { createUgcCycleLog } from './ugcCycleLog.js';

export const UGC_ENGINE_LOCK_KEY = 0x55474345; // "UGCE"
export const UGC_TICK_MS = 5000;               // internal emission tick (~5s)

const toMs = (v) => (v instanceof Date ? v.getTime() : Number(v));

/**
 * Run ONE emission tick. Returns the structured cycle report.
 * @param {object} [deps]
 * @param {*} [deps.db] · {(id)=>Promise<object>} [deps.getSettings]
 * @param {Function} [deps.getOrCreateDailyTarget] · {Function} [deps.emitOneSale]
 * @param {() => Date} [deps.now] · {() => number} [deps.rng] · {number} [deps.tickMs]
 * @param {boolean} [deps.dryRun] · {{acquire,release}} [deps.lock]
 * @param {object} [deps.log] · {(r)=>void} [deps.sink] · {string} [deps.cycleId]
 */
export async function runUgcTick(deps = {}) {
  const {
    db = prisma,
    getSettings = realGetSettings,
    getOrCreateDailyTarget = realGetOrCreateDailyTarget,
    emitOneSale = realEmitOneSale,
    now = () => new Date(),
    rng = Math.random,
    tickMs = UGC_TICK_MS,
    dryRun = false,
    lock = null,
    log,
    sink,
    cycleId,
  } = deps;

  const cycle = log || createUgcCycleLog({ now: () => toMs(now()), sink, cycleId });
  cycle.started({ dryRun, tick: true });

  // 1. Advisory lock — one tick at a time (never claim the same sequence twice).
  let held = true;
  if (lock && typeof lock.acquire === 'function') {
    held = await lock.acquire();
    if (!held) { cycle.lockSkipped(); return cycle.finished({ outcome: 'lock_skipped' }); }
  }
  cycle.lockAcquired();

  try {
    // 2. Re-validate settings EVERY tick.
    const settings = normalizeUgcSettings(await getSettings('ugc'));
    if (!isEngineRunnable(settings)) {
      const errors = validateUgcSettings(settings);
      if (errors.length) { cycle.failure({ error: `invalid settings: ${errors.join('; ')}` }); return cycle.finished({ outcome: 'invalid_settings' }); }
      return cycle.finished({ outcome: 'disabled' });
    }

    const tz = settings.timezone;
    const at = now();
    const startOfToday = startOfBusinessDay(at, tz);
    const endOfToday = endOfBusinessDay(at, tz);
    const intervalMs = Math.max(UGC_MIN_POLL_INTERVAL_MS, settings.pollIntervalMs);
    const speed = Math.max(1, Math.floor(settings.generationSpeed));

    // Current speed-cap window boundaries (aligned to the business day start).
    const windowIndex = Math.floor((at.getTime() - startOfToday.getTime()) / intervalMs);
    const windowStart = new Date(startOfToday.getTime() + windowIndex * intervalMs);
    const windowEnd = new Date(Math.min(windowStart.getTime() + intervalMs, endOfToday.getTime()));

    // 3. RUNNING submissions only.
    const videos = await db.ugcVideoSubmission.findMany({ where: { status: UGC_STATUS.RUNNING } });

    let emitted = 0;
    for (const v of videos) {
      try {
        const { target } = await getOrCreateDailyTarget({ video: v, now: at, tz, settings, db, rng, log: cycle });
        if (!target || target.completed || target.generatedToday >= target.dailyTarget) {
          cycle.videoProcessed(v.id, { status: 'target_reached' });
          continue;
        }

        const remaining = target.dailyTarget - target.generatedToday;

        // DB-derived current-window count (restart-safe; the ledger is the truth).
        const emittedThisWindow = await db.ugcEarning.count({
          where: { ugcVideoId: v.id, status: 'available', createdAt: { gte: windowStart } },
        });
        // 5. STRICT per-window cap.
        if (emittedThisWindow >= speed) { cycle.videoProcessed(v.id, { status: 'window_cap' }); continue; }

        const msLeftInDay = Math.max(1, endOfToday.getTime() - at.getTime());
        const windowsLeft = Math.max(1, Math.ceil(msLeftInDay / intervalMs));
        const { floor, cap } = computeWindowPlan({ remaining, generationSpeed: speed, windowsLeft });
        const windowTarget = windowTargetCount(floor, cap, seedFraction(`${v.id}:${windowStart.getTime()}`));
        const ticksLeftInWindow = Math.max(1, Math.ceil((windowEnd.getTime() - at.getTime()) / tickMs));

        const doEmit = shouldEmitThisTick({ windowTarget, emittedThisWindow, ticksLeftInWindow, rng });
        if (!doEmit) { cycle.videoProcessed(v.id, { status: 'idle', remaining }); continue; }

        if (dryRun) { cycle.videoProcessed(v.id, { status: 'dry_run', wouldEmit: 1, remaining }); continue; }

        const res = await emitOneSale({ video: v, target, settings, db });
        if (res.emitted) {
          emitted += 1;
          cycle.earningGenerated({ ugcVideoId: v.id, affiliateId: v.affiliateId, amount: res.amount, generatedSales: 1, idempotencyKey: res.idempotencyKey });
          if (res.completed) cycle.targetCompleted({ ugcVideoId: v.id, businessDate: target.businessDate, dailyTarget: target.dailyTarget });
        }
        cycle.videoProcessed(v.id, { status: res.emitted ? 'emitted' : res.reason });
      } catch (err) {
        cycle.failure({ ugcVideoId: v.id, error: err });
      }
    }

    return cycle.finished({ outcome: dryRun ? 'dry_run' : 'tick', emitted });
  } finally {
    if (held && lock && typeof lock.release === 'function') {
      try { await lock.release(); } catch { /* release must never mask the result */ }
    }
  }
}
