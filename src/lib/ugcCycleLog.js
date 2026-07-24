/**
 * src/lib/ugcCycleLog.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured logging for the UGC earnings engine (refinements #3 & #4).
 *
 * Every execution cycle emits one structured record per event, and a summary on
 * finish. Events: started, lock_acquired, lock_skipped, video_processed,
 * earning_generated, duplicate_suppressed, failure, finished (+ execution
 * duration). Duplicate earnings prevented by the unique idempotency constraint
 * are logged EXPLICITLY as `duplicate_suppressed` with `expected: true` — a
 * first-class "expected suppression" event, never silently ignored (#4).
 *
 * Clock and sink are injectable so the engine's logging is deterministically
 * unit-testable without spawning the engine.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Bump when the structured log record shape changes; every record carries it so
// downstream consumers can evolve/parse across versions (refinement #2).
export const UGC_LOG_SCHEMA_VERSION = 1;

export const UGC_CYCLE_EVENT = Object.freeze({
  STARTED:                'started',
  LOCK_ACQUIRED:          'lock_acquired',
  LOCK_SKIPPED:           'lock_skipped',
  DAILY_TARGET_GENERATED: 'daily_target_generated',
  VIDEO_PROCESSED:        'video_processed',
  EARNING_GENERATED:      'earning_generated',
  DUPLICATE_SUPPRESSED:   'duplicate_suppressed',
  TARGET_COMPLETED:       'target_completed',
  FAILURE:                'failure',
  FINISHED:               'finished',
});

const defaultSink = (record) => {
  // One JSON object per line — parseable by log aggregators.
  try { console.log(JSON.stringify(record)); } catch { /* never let logging throw */ }
};

/**
 * @param {object} [o]
 * @param {() => number} [o.now]   injectable clock (ms)
 * @param {(record:object)=>void} [o.sink]  where structured records go
 * @param {string} [o.cycleId]
 */
export function createUgcCycleLog({ now = () => Date.now(), sink = defaultSink, cycleId } = {}) {
  const startedMs = now();
  const id = cycleId || `ugc-${startedMs}`;
  const report = {
    cycleId: id,
    startedMs,
    finishedMs: null,
    durationMs: null,
    lock: null,                 // 'acquired' | 'skipped'
    videosProcessed: 0,
    dailyTargetsGenerated: 0,
    earningsGenerated: 0,
    duplicatesSuppressed: 0,
    targetsCompleted: 0,
    failures: 0,
  };

  const emit = (event, data = {}) => {
    sink({
      schemaVersion: UGC_LOG_SCHEMA_VERSION,
      ts: new Date(now()).toISOString(),
      component: 'ugc-earnings-engine',
      cycleId: id,
      event,
      ...data,
    });
  };

  return {
    report,

    started(data = {})  { emit(UGC_CYCLE_EVENT.STARTED, data); },

    lockAcquired()      { report.lock = 'acquired'; emit(UGC_CYCLE_EVENT.LOCK_ACQUIRED); },
    lockSkipped(reason = 'lock held by another instance') {
      report.lock = 'skipped';
      emit(UGC_CYCLE_EVENT.LOCK_SKIPPED, { reason });
    },

    dailyTargetGenerated({ ugcVideoId, businessDate, dailyTarget, timezone } = {}) {
      report.dailyTargetsGenerated += 1;
      emit(UGC_CYCLE_EVENT.DAILY_TARGET_GENERATED, { ugcVideoId, businessDate, dailyTarget, timezone });
    },

    targetCompleted({ ugcVideoId, businessDate, dailyTarget } = {}) {
      report.targetsCompleted += 1;
      emit(UGC_CYCLE_EVENT.TARGET_COMPLETED, { ugcVideoId, businessDate, dailyTarget });
    },

    videoProcessed(ugcVideoId, extra = {}) {
      report.videosProcessed += 1;
      emit(UGC_CYCLE_EVENT.VIDEO_PROCESSED, { ugcVideoId, ...extra });
    },

    earningGenerated({ ugcVideoId, affiliateId, amount, generatedSales, idempotencyKey } = {}) {
      report.earningsGenerated += 1;
      emit(UGC_CYCLE_EVENT.EARNING_GENERATED, {
        ugcVideoId, affiliateId,
        amount: amount == null ? null : String(amount),   // Decimal → string, never a lossy Number
        generatedSales, idempotencyKey,
      });
    },

    // Refinement #4: an EXPECTED, first-class event — not a swallowed error.
    duplicateSuppressed({ ugcVideoId, idempotencyKey } = {}) {
      report.duplicatesSuppressed += 1;
      emit(UGC_CYCLE_EVENT.DUPLICATE_SUPPRESSED, { ugcVideoId, idempotencyKey, expected: true });
    },

    failure({ ugcVideoId, error } = {}) {
      report.failures += 1;
      emit(UGC_CYCLE_EVENT.FAILURE, { ugcVideoId, error: String((error && error.message) || error || 'unknown') });
    },

    finished(extra = {}) {
      report.finishedMs = now();
      report.durationMs = report.finishedMs - startedMs;
      emit(UGC_CYCLE_EVENT.FINISHED, {
        lock: report.lock,
        videosProcessed: report.videosProcessed,
        dailyTargetsGenerated: report.dailyTargetsGenerated,
        earningsGenerated: report.earningsGenerated,
        duplicatesSuppressed: report.duplicatesSuppressed,
        targetsCompleted: report.targetsCompleted,
        failures: report.failures,
        durationMs: report.durationMs,
        ...extra,
      });
      return report;
    },
  };
}
