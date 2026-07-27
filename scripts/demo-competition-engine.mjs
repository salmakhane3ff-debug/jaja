#!/usr/bin/env node
/**
 * scripts/demo-competition-engine.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone runner for the Demo Competition auto-simulation. Runs as its own PM2
 * process, SEPARATE from the web server, mirroring the UGC + Fake Orders engines.
 * On each tick it calls runAutoSimTick(), which runs the SAME logic as the admin
 * "Simuler activité" button — but only when the demo competition is enabled AND
 * auto-simulation is turned ON. This keeps the competition permanently "alive"
 * (fake affiliate orders keep growing) with no manual clicks, until the cycle ends.
 *
 * The sleep before the next tick is whatever interval the admin configured
 * (clamped 5–30 s), read fresh every tick — so toggling auto-sim or changing the
 * interval in the admin takes effect live, without restarting this worker.
 *
 * FLAGS:
 *   --once            run a single tick then exit
 *   --help
 *
 * SAFETY: ships OFF. With auto-sim disabled (the default) every tick is a cheap
 * no-op that only reads the settings row, so it is safe to keep running forever.
 * A dedicated advisory lock guarantees only one runner actually ticks at a time.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import pg from 'pg';
import prisma from '../src/lib/prisma.js';
import { runAutoSimTick, DEMO_SIM_LOCK_KEY } from '../src/lib/services/demoService.js';
import { createPgAdvisoryLock } from '../src/lib/ugcAdvisoryLock.js';

const COMPONENT = 'demo-competition-engine';
const args = new Set(process.argv.slice(2));
const ONCE = args.has('--once');

if (args.has('--help')) {
  console.log('Usage: node scripts/demo-competition-engine.mjs [--once]');
  process.exit(0);
}

const emit = (event, data = {}) => {
  try { console.log(JSON.stringify({ component: COMPONENT, ts: new Date().toISOString(), event, ...data })); }
  catch { /* logging must never throw */ }
};

// Dedicated advisory-lock connection (NOT the Prisma pool), resilient adapter —
// session-level, so even if two engine processes start, only one ticks at a time.
const lock = createPgAdvisoryLock({
  key: DEMO_SIM_LOCK_KEY,
  newClient: () => new pg.Client({ connectionString: process.env.DATABASE_URL }),
  onEvent: (event, data) => emit(event, data),
});

let stopping = false;
let timer = null;
let inFlight = Promise.resolve();

async function tick() {
  if (stopping) return;
  let nextMs = 10_000;
  inFlight = runAutoSimTick({ lock }).then(
    (r) => { nextMs = r.intervalMs || nextMs; emit('tick', { ticked: r.ticked, skipped: r.skipped || null, intervalMs: nextMs }); },
    (err) => emit('tick_crash', { error: String((err && err.message) || err) }),
  );
  await inFlight;
  if (ONCE || stopping) return shutdown('completed');
  timer = setTimeout(tick, nextMs);
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
  emit('boot', { once: ONCE });
  await tick();
})();
