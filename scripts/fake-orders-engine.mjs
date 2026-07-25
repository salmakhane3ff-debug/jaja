#!/usr/bin/env node
/**
 * scripts/fake-orders-engine.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone runner for the Fake Orders Engine (affiliate motivation). Runs as
 * its own PM2 process, SEPARATE from the web server, mirroring the UGC engine
 * runner. Injects fake orders into the EXISTING order/commission pipeline while
 * respecting every per-affiliate limit. Fake orders are internally flagged and
 * never touch any external integration.
 *
 * FLAGS:
 *   --once            run a single tick then exit
 *   --tick=<ms>       override the decision tick (min 5000ms; default 60000)
 *   --help
 *
 * SAFETY: only configs with enabled=true emit, and only within their configured
 * working hours/days + rate limits + random delay. On a fresh deploy no config
 * exists, so nothing generates until an admin explicitly enables an affiliate.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import pg from 'pg';
import prisma from '../src/lib/prisma.js';
import { runFakeOrdersTick, FAKE_ENGINE_LOCK_KEY, FAKE_TICK_MS } from '../src/lib/fakeOrdersEngine.js';
import { createPgAdvisoryLock } from '../src/lib/ugcAdvisoryLock.js';

const COMPONENT = 'fake-orders-engine';
const args = new Set(process.argv.slice(2));
const tickArg = process.argv.slice(2).find((a) => a.startsWith('--tick='));
const ONCE = args.has('--once');
const TICK_MS = Math.max(5000, Number(tickArg ? tickArg.split('=')[1] : NaN) || FAKE_TICK_MS);

if (args.has('--help')) {
  console.log('Usage: node scripts/fake-orders-engine.mjs [--once] [--tick=<ms>]');
  process.exit(0);
}

const emit = (event, data = {}) => {
  try { console.log(JSON.stringify({ component: COMPONENT, ts: new Date().toISOString(), event, ...data })); }
  catch { /* logging must never throw */ }
};

// Dedicated advisory-lock connection (NOT the Prisma pool), resilient adapter —
// session-level, so even if two engine processes start, only one ticks at a time.
const lock = createPgAdvisoryLock({
  key: FAKE_ENGINE_LOCK_KEY,
  newClient: () => new pg.Client({ connectionString: process.env.DATABASE_URL }),
  onEvent: (event, data) => emit(event, data),
});

let stopping = false;
let timer = null;
let inFlight = Promise.resolve();

async function tick() {
  if (stopping) return;
  inFlight = runFakeOrdersTick({ lock }).then(
    (r) => emit('tick', { emitted: r.emitted, skipped: r.skipped || null }),
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
