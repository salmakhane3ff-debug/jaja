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
 *     drops or a lock query errors, the cycle is skipped (no earnings without a
 *     valid lock) and the adapter reconnects before the next cycle. Session-level,
 *     so even if two engine processes start, only one runs a cycle at a time.
 *   • The polling loop: after each cycle it re-reads pollIntervalMs from settings
 *     (admin can retune cadence live) and schedules the next tick, never below the
 *     MIN_POLL_INTERVAL_MS floor.
 *   • GRACEFUL SHUTDOWN on SIGINT/SIGTERM: stop scheduling, let the in-flight
 *     cycle finish, release the lock, disconnect, then exit 0.
 *
 * FLAGS:
 *   --once            run a single cycle then exit (cron-style)
 *   --dry-run         compute + log what WOULD generate; write nothing
 *   --interval=<ms>   override the poll interval; values below the floor are
 *                     clamped up to MIN_POLL_INTERVAL_MS (non-numeric → ignored)
 *   --help
 *
 * SAFETY: the engine only generates when the module AND the earnings engine are
 * enabled AND settings validate (see isEngineRunnable). On a fresh deploy both
 * flags default to false, so nothing generates until an admin explicitly opts in.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import pg from 'pg';
import prisma from '../src/lib/prisma.js';
import { runUgcEngineCycle, UGC_ENGINE_LOCK_KEY } from '../src/lib/ugcEngine.js';
import { createPgAdvisoryLock } from '../src/lib/ugcAdvisoryLock.js';
import { getSettings } from '../src/lib/services/settingsService.js';
import { normalizeUgcSettings, UGC_MIN_POLL_INTERVAL_MS, resolvePollIntervalMs } from '../src/lib/ugcSettings.js';

const COMPONENT = 'ugc-earnings-engine';
const args = new Set(process.argv.slice(2));
const intervalArg = process.argv.slice(2).find((a) => a.startsWith('--interval='));
const RAW_OVERRIDE = intervalArg ? intervalArg.split('=')[1] : null;
const ONCE = args.has('--once');
const DRY_RUN = args.has('--dry-run');

if (args.has('--help')) {
  console.log('Usage: node scripts/ugc-earnings-engine.mjs [--once] [--dry-run] [--interval=<ms>]');
  process.exit(0);
}

const emit = (event, data = {}) => {
  try { console.log(JSON.stringify({ component: COMPONENT, ts: new Date().toISOString(), event, ...data })); }
  catch { /* logging must never throw */ }
};

// ── Validate the --interval override up-front (final check #3) ──────────────────
// Below the floor is clamped up to MIN_POLL_INTERVAL_MS; non-numeric is ignored.
let OVERRIDE_INTERVAL = null;
if (RAW_OVERRIDE != null) {
  const r = resolvePollIntervalMs(RAW_OVERRIDE);
  if (r.invalid) emit('interval_ignored', { given: RAW_OVERRIDE, reason: 'not a finite number' });
  else { if (r.clamped) emit('interval_clamped', { given: RAW_OVERRIDE, floorMs: UGC_MIN_POLL_INTERVAL_MS, usedMs: r.ms }); OVERRIDE_INTERVAL = r.ms; }
}

// ── Dedicated advisory-lock connection (NOT the Prisma pool), resilient adapter ──
const lock = createPgAdvisoryLock({
  key: UGC_ENGINE_LOCK_KEY,
  newClient: () => new pg.Client({ connectionString: process.env.DATABASE_URL }),
  onEvent: (event, data) => emit(event, data),
});

let stopping = false;
let timer = null;
let inFlight = Promise.resolve();

async function nextIntervalMs() {
  if (OVERRIDE_INTERVAL != null) return OVERRIDE_INTERVAL; // already validated + clamped
  try {
    const s = normalizeUgcSettings(await getSettings('ugc'));
    return resolvePollIntervalMs(s.pollIntervalMs).ms; // never below the floor
  } catch {
    return resolvePollIntervalMs(null).ms;             // default, clamped
  }
}

async function tick() {
  if (stopping) return;
  inFlight = runUgcEngineCycle({ dryRun: DRY_RUN, lock });
  try {
    await inFlight;
  } catch (err) {
    // runUgcEngineCycle isolates per-video failures internally; this catches only
    // an unexpected orchestration/lock error so the loop survives it.
    emit('cycle_crash', { error: String((err && err.message) || err) });
  }
  if (ONCE || stopping) return shutdown('completed');
  const ms = await nextIntervalMs();
  emit('scheduled', { nextInMs: ms });
  timer = setTimeout(tick, ms);
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
  emit('boot', { once: ONCE, dryRun: DRY_RUN, overrideInterval: OVERRIDE_INTERVAL });
  await tick();
})();
