#!/usr/bin/env node
/**
 * scripts/ugcAdvisoryLock.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the resilient advisory-lock adapter (src/lib/ugcAdvisoryLock.js, final
 * check #2) with a FAKE pg client factory — no database. Proves:
 *   • acquire true/false maps to pg_try_advisory_lock
 *   • a healthy session is REUSED across cycles (one connect)
 *   • a dropped connection / query error → acquire returns FALSE (cycle skipped,
 *     no earnings without a valid lock) and marks the session unhealthy
 *   • the NEXT acquire tears down the dead client and RECONNECTS a fresh session
 *   • a release error, and a connection 'error' event, both force a reconnect
 *   • end() closes the client
 * Run: node scripts/ugcAdvisoryLock.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createPgAdvisoryLock } from '../src/lib/ugcAdvisoryLock.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };

// Controllable fake pg client. `mode` flips behaviour between calls.
function harness() {
  const state = { mode: 'ok' }; // 'ok' | 'lockedFalse' | 'throwAcquire' | 'throwRelease' | 'failConnect'
  const created = [];
  const factory = () => {
    const c = { id: created.length, connected: false, ended: false, handlers: {}, queries: [] };
    c.on = (ev, cb) => { c.handlers[ev] = cb; };
    c.emitError = (err) => c.handlers.error && c.handlers.error(err);
    c.connect = async () => { if (state.mode === 'failConnect') throw new Error('connect failed'); c.connected = true; };
    c.query = async (sql) => {
      c.queries.push(sql);
      if (sql.includes('pg_try_advisory_lock')) {
        if (state.mode === 'throwAcquire') throw new Error('connection dropped');
        return { rows: [{ locked: state.mode !== 'lockedFalse' }] };
      }
      if (sql.includes('pg_advisory_unlock')) {
        if (state.mode === 'throwRelease') throw new Error('connection dropped on unlock');
        return { rows: [{ pg_advisory_unlock: true }] };
      }
      return { rows: [] };
    };
    c.end = async () => { c.ended = true; };
    created.push(c);
    return c;
  };
  return { state, created, factory };
}

const events = [];
const mk = (h) => createPgAdvisoryLock({ key: 42, newClient: h.factory, onEvent: (e, d) => events.push({ e, d }) });

console.log('1) acquire maps to pg_try_advisory_lock, session reused across cycles:');
{
  const h = harness();
  const lock = mk(h);
  ok('acquire → true', (await lock.acquire()) === true);
  ok('one client connected', h.created.length === 1 && h.created[0].connected === true);
  await lock.release();
  ok('release ran an unlock query', h.created[0].queries.some((q) => q.includes('pg_advisory_unlock')));
  ok('second acquire reuses the SAME client (no reconnect)', (await lock.acquire()) === true && h.created.length === 1);
  ok('isHealthy true', lock.isHealthy() === true);
}

console.log('2) lock held elsewhere → acquire false (no error):');
{
  const h = harness();
  h.state.mode = 'lockedFalse';
  const lock = mk(h);
  ok('acquire → false', (await lock.acquire()) === false);
  ok('still healthy (a clean false is not a failure)', lock.isHealthy() === true);
}

console.log('3) dropped connection on acquire → false + unhealthy, then reconnect:');
{
  const h = harness();
  const lock = mk(h);
  await lock.acquire();                    // client0 healthy
  h.state.mode = 'throwAcquire';
  const r = await lock.acquire();          // query throws
  ok('acquire returns FALSE on drop (no earnings without a lock)', r === false);
  ok('session marked unhealthy', lock.isHealthy() === false);
  h.state.mode = 'ok';
  const r2 = await lock.acquire();         // must reconnect
  ok('next acquire reconnected (new client)', h.created.length === 2);
  ok('dead client was torn down (end called)', h.created[0].ended === true);
  ok('reconnected acquire succeeds', r2 === true && lock.isHealthy() === true);
  ok('a lock_error event was emitted', events.some((x) => x.e === 'lock_error' && x.d.phase === 'acquire'));
}

console.log('4) release error forces a reconnect next cycle:');
{
  const h = harness();
  const lock = mk(h);
  await lock.acquire();                    // client0
  h.state.mode = 'throwRelease';
  await lock.release();                    // unlock throws → unhealthy
  ok('release error → unhealthy', lock.isHealthy() === false);
  h.state.mode = 'ok';
  await lock.acquire();
  ok('reconnected after release failure', h.created.length === 2 && h.created[0].ended === true);
}

console.log('5) connection "error" event forces a reconnect:');
{
  const h = harness();
  const lock = mk(h);
  await lock.acquire();                    // client0, registers error handler
  h.created[0].emitError(new Error('server closed the connection'));
  ok('error event → unhealthy', lock.isHealthy() === false);
  await lock.acquire();
  ok('reconnected after error event', h.created.length === 2);
}

console.log('6) release is a safe no-op when never connected; end() closes:');
{
  const h = harness();
  const lock = mk(h);
  await lock.release();                     // nothing connected yet
  ok('release before any acquire does not throw / connect', h.created.length === 0);
  await lock.acquire();
  await lock.end();
  ok('end() closed the client', h.created[0].ended === true && lock.isHealthy() === false);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
