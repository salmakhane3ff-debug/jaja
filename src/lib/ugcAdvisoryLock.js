/**
 * src/lib/ugcAdvisoryLock.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A resilient PostgreSQL session advisory-lock adapter for the earnings engine.
 * Deliberately `pg`-FREE: the client factory is INJECTED, so this is unit-testable
 * without a database and the runner supplies the real `() => new pg.Client(...)`.
 *
 * RESILIENCE CONTRACT (final check #2):
 *   • The lock lives on its OWN dedicated connection (never the Prisma pool).
 *   • If that connection drops or a lock query errors, the adapter marks itself
 *     UNHEALTHY and `acquire()` returns FALSE — so the engine cycle is aborted and
 *     NO earnings are processed without a valid lock.
 *   • Before the NEXT cycle, `acquire()` transparently tears down the dead client
 *     and reconnects a fresh session, then re-attempts the lock.
 *
 * WHY false-on-error is money-safe: correctness does NOT actually depend on the
 * lock — every earning insert is idempotent on a UNIQUE (ugcVideoId:period) key,
 * so even if two runners raced, the second insert is suppressed as a duplicate.
 * The lock is an optimization to avoid redundant work and log noise; failing it
 * closed (skip the cycle) is strictly safe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * @param {object} o
 * @param {number|bigint} o.key                 the advisory-lock key
 * @param {() => object} o.newClient            factory returning a fresh pg-like client
 *        (must support: connect(), query(sql, params) → {rows}, end(), on('error', cb))
 * @param {(event:string, data?:object)=>void} [o.onEvent]  structured event hook
 * @returns {{acquire:()=>Promise<boolean>, release:()=>Promise<void>, end:()=>Promise<void>, isHealthy:()=>boolean}}
 */
export function createPgAdvisoryLock({ key, newClient, onEvent = () => {} }) {
  if (typeof newClient !== 'function') throw new Error('createPgAdvisoryLock requires a newClient factory');
  let client = null;
  let healthy = false;

  async function ensureConnected() {
    if (client && healthy) return;
    // Tear down a dead/half-open client before replacing it.
    if (client) {
      try { await client.end(); } catch { /* ignore */ }
      client = null;
    }
    const c = newClient();
    // A connection-level error at any time invalidates the session-held lock.
    if (typeof c.on === 'function') {
      c.on('error', (err) => {
        healthy = false;
        onEvent('lock_connection_error', { error: String((err && err.message) || err) });
      });
    }
    await c.connect();
    client = c;
    healthy = true;
    onEvent('lock_connected');
  }

  return {
    /**
     * Try to take the lock. Reconnects first if the previous session died.
     * Returns false (never throws) on any connection/query failure so the caller
     * skips the cycle instead of running without a valid lock.
     */
    async acquire() {
      try {
        await ensureConnected();
        const r = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [key]);
        return r?.rows?.[0]?.locked === true;
      } catch (err) {
        healthy = false;
        onEvent('lock_error', { phase: 'acquire', error: String((err && err.message) || err) });
        return false;
      }
    },

    /** Best-effort unlock; a failure here just marks the session unhealthy so the
     *  next acquire() reconnects. Never throws. */
    async release() {
      if (!client || !healthy) return;
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [key]);
      } catch (err) {
        healthy = false;
        onEvent('lock_error', { phase: 'release', error: String((err && err.message) || err) });
      }
    },

    /** Close the dedicated connection on shutdown. */
    async end() {
      if (client) {
        try { await client.end(); } catch { /* ignore */ }
      }
      client = null;
      healthy = false;
    },

    isHealthy() { return healthy; },
  };
}
