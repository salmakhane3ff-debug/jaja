#!/usr/bin/env node
/**
 * scripts/booster-simulation-engine.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone runner for the Starter Booster SIMULATION engine. Runs as its own
 * PM2 process, SEPARATE from the web server, mirroring the UGC / Fake-Orders /
 * Demo-Competition engines. Each tick advances every RUNNING booster simulation
 * by a small amount (admin-configured), never past its target.
 *
 * STRICT ISOLATION: writes ONLY `booster_simulations`. It never creates an
 * AffiliateOrder, never touches commissions, payouts, balances or real order
 * statistics, and never modifies a purchase row — so a completed simulation can
 * never refund the package price.
 *
 * FLAGS:
 *   --once            run a single tick then exit
 *   --tick=<ms>       override the runner cadence (min 5000ms; default 60000)
 *   --help
 *
 * SAFETY: with the simulation disabled (admin setting) every tick is a cheap
 * no-op, so it is safe to keep running permanently.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import pg from 'pg';
import prisma from '../src/lib/prisma.js';
import { runBoosterSimulationTick, BOOSTER_SIM_LOCK_KEY } from '../src/lib/services/boosterSimulationService.js';
import { createPgAdvisoryLock } from '../src/lib/ugcAdvisoryLock.js';

const COMPONENT = 'booster-simulation-engine';
const args = new Set(process.argv.slice(2));
const tickArg = process.argv.slice(2).find((a) => a.startsWith('--tick='));
const ONCE = args.has('--once');
const TICK_MS = Math.max(5000, Number(tickArg ? tickArg.split('=')[1] : NaN) || 60_000);

if (args.has('--help')) {
  console.log('Usage: node scripts/booster-simulation-engine.mjs [--once] [--tick=<ms>]');
  process.exit(0);
}

const emit = (event, data = {}) => {
  try { console.log(JSON.stringify({ component: COMPONENT, ts: new Date().toISOString(), event, ...data })); }
  catch { /* logging must never throw */ }
};

// Dedicated advisory-lock connection (NOT the Prisma pool) — session-level, so
// even if two engine processes start, only one advances the simulations.
const lock = createPgAdvisoryLock({
  key: BOOSTER_SIM_LOCK_KEY,
  newClient: () => new pg.Client({ connectionString: process.env.DATABASE_URL }),
  onEvent: (event, data) => emit(event, data),
});

let stopping = false;
let timer = null;
let inFlight = Promise.resolve();

async function tick() {
  if (stopping) return;
  inFlight = runBoosterSimulationTick({ lock }).then(
    (r) => emit('tick', { ticked: r.ticked, added: r.added, skipped: r.skipped || null }),
    (err) => emit('tick_crash', { error: String((err && err.message) || err) }),
  );
  await inFlight;
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
  emit('boot', { once: ONCE, tickMs: TICK_MS });
  await tick();
})();
