/**
 * src/lib/ugcOps.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Operational visibility for the UGC module's BEST-EFFORT writes (audit trail,
 * notifications).
 *
 * Those writes stay non-fatal — they must never roll back money or a submission —
 * but "non-fatal" must never mean "invisible". Every swallowed failure:
 *   1. emits a STRUCTURED error record (one JSON line, schema-versioned), and
 *   2. increments an in-process counter exposed via getUgcOpsMetrics(), which the
 *      admin health endpoint (/api/admin/ugc-health) surfaces as an operational
 *      signal so a silently degraded audit/notification path is noticeable.
 *
 * ⚠️ SCOPE OF THE COUNTERS: they are in-process and reset on restart, and with
 * multiple PM2 instances each process reports only its own. They are a
 * "something is wrong right now" signal, NOT durable analytics. The structured
 * log lines are the durable record — ship them to the log aggregator and alert
 * on `component:"ugc-ops"` + `severity:"error"`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const UGC_OPS_SCHEMA_VERSION = 1;

export const UGC_OPS_OPERATION = Object.freeze({
  NOTIFY_AFFILIATE:     'notify_affiliate',
  NOTIFY_ADMIN:         'notify_admin',
  AUDIT_SETTINGS_WRITE: 'audit_settings_write',
  AUDIT_SETTINGS_READ:  'audit_settings_read',
  ADMIN_NOTIF_READ:     'admin_notification_read',
  ADMIN_NOTIF_ACK:      'admin_notification_ack',
});

const counters = new Map();          // operation → { operation, failures, lastError, lastAt }
const observers = new Set();         // external consumers (metrics exporter, APM, …)
const recent = [];                   // small structured ring buffer for the health endpoint
const RECENT_MAX = 25;
let startedAt = new Date().toISOString();

const consoleSink = (record) => {
  try { console.error(JSON.stringify(record)); } catch { /* logging must never throw */ }
};

/**
 * Subscribe to structured operational events. This is the seam for shipping to a
 * real metrics/APM backend (StatsD, OpenTelemetry, Sentry, …) so operational
 * failures are observable as EVENTS, not just log text.
 * @returns {() => void} unsubscribe
 */
export function onUgcOpsEvent(observer) {
  if (typeof observer !== 'function') return () => {};
  observers.add(observer);
  return () => observers.delete(observer);
}

/**
 * Record (and log) a swallowed failure.
 * @param {object} p
 * @param {string} p.operation   one of UGC_OPS_OPERATION
 * @param {*}      p.error
 * @param {object} [p.context]   extra structured fields (ids, never secrets)
 * @param {Function} [p.sink]    injectable log sink (tests)
 * @returns {{operation:string, failures:number, lastError:string, lastAt:string}}
 */
export function recordUgcOpsFailure({ operation, error, context = {}, sink = consoleSink } = {}) {
  const op = operation || 'unknown';
  const message = String((error && error.message) || error || 'unknown error');
  const at = new Date().toISOString();

  // 1. COUNTER — machine-readable state, exposed by /api/admin/ugc-health.
  const entry = counters.get(op) || { operation: op, failures: 0, lastError: null, lastAt: null };
  entry.failures += 1;
  entry.lastError = message;
  entry.lastAt = at;
  counters.set(op, entry);

  // 2. STRUCTURED EVENT — the durable record.
  const record = {
    schemaVersion: UGC_OPS_SCHEMA_VERSION,
    ts: at,
    component: 'ugc-ops',
    severity: 'error',
    operation: op,
    error: message,
    degraded: true,          // the operation was swallowed; the caller continued
    ...context,
  };

  recent.push(record);
  if (recent.length > RECENT_MAX) recent.shift();

  // 3. FAN-OUT to registered observers (metrics/APM), then the log sink.
  for (const observe of observers) {
    try { observe(record); } catch { /* an observer must never break the caller */ }
  }
  try { sink(record); } catch { /* logging must never throw */ }

  return { ...entry };
}

/** Current failure counters + recent structured events — the operational signal. */
export function getUgcOpsMetrics() {
  const operations = [...counters.values()].map((e) => ({ ...e }));
  const totalFailures = operations.reduce((s, e) => s + e.failures, 0);
  return {
    schemaVersion: UGC_OPS_SCHEMA_VERSION,
    since: startedAt,
    healthy: totalFailures === 0,
    totalFailures,
    operations,
    recent: recent.map((r) => ({ ...r })),
  };
}

/** Test helper — clears counters, recent events and observers. */
export function resetUgcOpsMetrics() {
  counters.clear();
  recent.length = 0;
  observers.clear();
  startedAt = new Date().toISOString();
}
