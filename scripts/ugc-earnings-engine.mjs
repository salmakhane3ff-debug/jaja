#!/usr/bin/env node
/**
 * scripts/ugc-earnings-engine.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone runner for the UGC virtual-earnings engine. Runs as its own process
 * (e.g. a dedicated PM2 app), SEPARATE from the web server, so a cycle can never
 * block a request and vice-versa.
 *
 * WHAT THIS FILE OWNS (the orchestration core is src/lib/ugcEngine.js):
 *   • A DEDICATED raw `pg` connection used ONLY for the PostgreSQL advisory lock,
 *     wrapped in the resilient createPgAdvisoryLock adapter: if the connection
 *     drops or a lock query errors, the tick is skipped (no earnings without a
 *     valid lock) and the adapter reconnects before the next tick. Session-level,
 *     so even if two engine processes start, only one runs a tick at a time.
 *   • The EMISSION TICK LOOP (~5s, fixed): each tick emits due individual simulated
 *     sales, paced adaptively toward each video's daily target. The admin
 *     `pollIntervalMs` is the generation-speed WINDOW (read inside the tick), NOT
 *     the loop cadence.
 *   • GRACEFUL SHUTDOWN on SIGINT/SIGTERM: stop scheduling, let the in-flight
 *     tick finish, release the lock, disconnect, then exit 0.
 *
 * FLAGS:
 *   --once            run a single tick then exit
 *   --dry-run         compute + log what WOULD emit; write nothing
 *   --tick=<ms>       override the emission tick (min 1000ms; default 5000)
 *   --help
 *
 * SAFETY: the engine only generates when the module AND the earnings engine are
 * enabled AND settings validate (see isEngineRunnable). On a fresh deploy both
 * flags default to false, so nothing generates until an admin explicitly opts in.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import pg from 'pg';
import prisma from '../src/lib/prisma.js';
import { runUgcTick, UGC_ENGINE_LOCK_KEY, UGC_TICK_MS } from '../src/lib/ugcEngine.js';
import { createPgAdvisoryLock } from '../src/lib/ugcAdvisoryLock.js';

const COMPONENT = 'ugc-earnings-engine';
const args = new Set(process.argv.slice(2));
const tickArg = process.argv.slice(2).find((a) => a.startsWith('--tick='));
const ONCE = args.has('--once');
const DRY_RUN = args.has('--dry-run');
const TICK_MS = Math.max(1000, Number(tickArg ? tickArg.split('=')[1] : NaN) || UGC_TICK_MS);

if (args.has('--help')) {
  console.log('Usage: node scripts/ugc-earnings-engine.mjs [--once] [--dry-run] [--tick=<ms>]');
  process.exit(0);
}

const emit = (event, data = {}) => {
  try { console.log(JSON.stringify({ component: COMPONENT, ts: new Date().toISOString(), event, ...data })); }
  catch { /* logging must never throw */ }
};

// ── Dedicated advisory-lock connection (NOT the Prisma pool), resilient adapter ──
const lock = createPgAdvisoryLock({
  key: UGC_ENGINE_LOCK_KEY,
  newClient: () => new pg.Client({ connectionString: process.env.DATABASE_URL }),
  onEvent: (event, data) => emit(event, data),
});

let stopping = false;
let timer = null;
let inFlight = Promise.resolve();

async function tick() {
  if (stopping) return;
  inFlight = runUgcTick({ dryRun: DRY_RUN, lock, tickMs: TICK_MS });
  try {
    await inFlight;
  } catch (err) {
    // runUgcTick isolates per-video failures internally; this catches only an
    // unexpected orchestration/lock error so the loop survives it.
    emit('tick_crash', { error: String((err && err.message) || err) });
  }
  if (ONCE || stopping) return shutdown('completed');
  timer = setTimeout(tick, TICK_MS);
}

let shuttingDownPromise = null;
async function shutdown(reason) {
  if (shuttingDownPromise) return shuttingDownPromise;
  stopping = true;
  if (timer) clearTimeout(timer);
  emit('shutdown', { reason });
  shuttingDownPromise = (async () => {
    try { await inFlight; } catch { /* already logged */ }
    // The cycle's own finally releases the lock; close the connections cleanly.
    try { await lock.end(); } catch { /* ignore */ }
    try { await prisma.$disconnect(); } catch { /* ignore */ }
    emit('stopped', { reason });
    process.exit(0);
  })();
  return shuttingDownPromise;
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

(async () => {
  // The lock adapter connects lazily on first acquire() and reconnects on drop,
  // so there is no fragile one-shot connect here to fail the whole process.
  emit('boot', { once: ONCE, dryRun: DRY_RUN, tickMs: TICK_MS });
  await tick();
})();
