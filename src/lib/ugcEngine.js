/**
 * src/lib/ugcEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The UGC virtual-earnings engine CORE — one reviewable cycle, fully dependency-
 * injected so it runs deterministically in tests without a DB, clock, or RNG.
 *
 * A single cycle:
 *   1. ADVISORY LOCK   — acquire the injected lock; if another instance holds it,
 *                        log `lock_skipped` and return (never run two cycles at once).
 *   2. SETTINGS GATE   — re-validate settings EVERY cycle. If the module/engine is
 *                        disabled → abort quietly (normal). If settings are invalid
 *                        → abort as a FAILURE and generate nothing (safety).
 *   3. RUNNING ONLY    — only submissions in status RUNNING earn. PENDING/APPROVED/
 *                        PAUSED/REJECTED are never touched.
 *   4. DETERMINISTIC PERIOD — one generation period per cycle (UTC day bucket), so
 *                        the earning insert is idempotent on (video, period): a
 *                        re-run of the same period never double-pays.
 *   5. PER-VIDEO ISOLATION — each video is processed in its own try/catch; one bad
 *                        row can never abort the batch or poison its neighbours.
 *   6. DRY-RUN         — compute + log what WOULD be generated, write nothing.
 *
 * MONEY: this file NEVER computes or writes amounts itself — it delegates each
 * earning to recordUgcEarning (Decimal-safe, crash-safe, idempotent). The engine
 * only decides WHICH videos earn and orchestrates/logs the cycle.
 *
 * The polling loop, OS-signal graceful shutdown, and the real PostgreSQL advisory
 * lock live in the standalone runner (scripts/ugc-earnings-engine.js); this module
 * is pure orchestration so it stays unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from './prisma.js';
import { UGC_STATUS } from './ugcStatus.js';
import {
  normalizeUgcSettings, validateUgcSettings, isEngineRunnable,
} from './ugcSettings.js';
import {
  UGC_GRANULARITY, generationPeriod, generationDateOf, pickGeneratedSales,
} from './ugcEarnings.js';
import { recordUgcEarning as realRecordUgcEarning } from './services/ugcEarningsService.js';
import { getSettings as realGetSettings } from './services/settingsService.js';
import { createUgcCycleLog } from './ugcCycleLog.js';

// Fixed 64-bit key for pg_try_advisory_lock in the runner (see runner script).
export const UGC_ENGINE_LOCK_KEY = 0x55474345; // "UGCE"

const toMs = (v) => (v instanceof Date ? v.getTime() : Number(v));

/**
 * Run exactly ONE engine cycle. Returns the structured cycle report.
 * @param {object} [deps]
 * @param {*}        [deps.db]            Prisma client
 * @param {(id:string)=>Promise<object>} [deps.getSettings]
 * @param {Function} [deps.recordEarning] recordUgcEarning-compatible
 * @param {() => Date} [deps.now]         injectable clock (returns a Date)
 * @param {() => number} [deps.rng]       injectable RNG in [0,1)
 * @param {boolean}  [deps.dryRun]        compute + log, write nothing
 * @param {{acquire:()=>Promise<boolean>, release:()=>Promise<void>}} [deps.lock]
 * @param {object}   [deps.log]           a pre-built cycle logger (else one is created)
 * @param {(r:object)=>void} [deps.sink]  log sink when building a logger
 * @param {string}   [deps.cycleId]
 * @returns {Promise<object>} the cycle report
 */
export async function runUgcEngineCycle(deps = {}) {
  const {
    db = prisma,
    getSettings = realGetSettings,
    recordEarning = realRecordUgcEarning,
    now = () => new Date(),
    rng = Math.random,
    dryRun = false,
    lock = null,
    log,
    sink,
    cycleId,
  } = deps;

  const cycle = log || createUgcCycleLog({ now: () => toMs(now()), sink, cycleId });
  cycle.started({ dryRun });

  // 1. Advisory lock — never run two cycles concurrently.
  let held = true;
  if (lock && typeof lock.acquire === 'function') {
    held = await lock.acquire();
    if (!held) {
      cycle.lockSkipped();
      return cycle.finished({ outcome: 'lock_skipped' });
    }
  }
  cycle.lockAcquired();

  try {
    // 2. Re-validate settings EVERY cycle.
    const settings = normalizeUgcSettings(await getSettings('ugc'));
    if (!isEngineRunnable(settings)) {
      const errors = validateUgcSettings(settings);
      if (errors.length) {
        // Invalid config is a FAILURE — generate nothing until an admin fixes it.
        cycle.failure({ error: `invalid settings: ${errors.join('; ')}` });
        return cycle.finished({ outcome: 'invalid_settings' });
      }
      // Simply disabled — normal, quiet no-op.
      return cycle.finished({ outcome: 'disabled' });
    }

    // 4. One deterministic period + generation date for the whole cycle.
    //
    // ── GENERATION-PERIOD CONTRACT (money path — do not weaken casually) ────────
    //   Exactly ONE earning entry per RUNNING video per UTC CALENDAR DAY.
    //   The period string (generationPeriod, UTC-day granularity) is baked into the
    //   UNIQUE idempotency key `ugcVideoId:period`, so this "one per video per UTC
    //   day" rule is enforced at the database level, not just here.
    //
    //   Changing the granularity (e.g. hourly) or the timezone (e.g. local time)
    //   is a MONEY-PATH MIGRATION, NOT a config change: it alters which keys exist,
    //   can re-open already-paid periods for a second payout, and needs a planned
    //   backfill/cutover. Treat any such change with the same rigor as a ledger
    //   schema migration. UGC_GRANULARITY.DAILY is intentionally hardcoded here.
    const at = now();
    const period = generationPeriod(at, UGC_GRANULARITY.DAILY);
    const generationDate = generationDateOf(at);

    // 3. RUNNING submissions only.
    const videos = await db.ugcVideoSubmission.findMany({ where: { status: UGC_STATUS.RUNNING } });

    for (const v of videos) {
      // 5. Per-video isolation — one failure never aborts the batch.
      try {
        const generatedSales = pickGeneratedSales(settings.minGeneratedSales, settings.maxGeneratedSales, rng);

        if (dryRun) {
          cycle.videoProcessed(v.id, { dryRun: true, wouldGenerateSales: generatedSales, period });
          continue;
        }

        const result = await recordEarning({
          affiliateId: v.affiliateId,
          ugcVideoId: v.id,
          productId: v.productId,
          generatedSales,
          commissionPerSale: settings.commissionPerSale, // snapshot this cycle
          generationPeriod: period,
          generationDate,
          log: cycle,   // recordEarning emits earning_generated / duplicate_suppressed
          db,
        });
        cycle.videoProcessed(v.id, { status: result.status, period });
      } catch (err) {
        cycle.failure({ ugcVideoId: v.id, error: err });
      }
    }

    return cycle.finished({ outcome: dryRun ? 'dry_run' : 'generated', period });
  } finally {
    // Always release the lock, even on an unexpected throw.
    if (held && lock && typeof lock.release === 'function') {
      try { await lock.release(); } catch { /* release must never mask the cycle result */ }
    }
  }
}
