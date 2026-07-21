#!/usr/bin/env node
/**
 * scripts/ugcEngine.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the UGC earnings engine CORE (src/lib/ugcEngine.js), driven with
 * an injected clock, DB, RNG, lock, and log sink — no real database or timers.
 * Proves: advisory-lock skip, per-cycle settings gate (disabled vs invalid),
 * RUNNING-only selection, deterministic period, commission snapshot, RNG sales,
 * per-video failure isolation, dry-run, duplicate-suppression accounting, and
 * that the lock is ALWAYS released.
 * Run: node scripts/ugcEngine.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { runUgcEngineCycle } from '../src/lib/ugcEngine.js';
import { generationPeriod, generationDateOf, UGC_EARNING_STATUS } from '../src/lib/ugcEarnings.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };

const FIXED = new Date('2026-07-21T13:45:00Z');
const now = () => FIXED;

const fakeDb = (videos, trace) => ({
  ugcVideoSubmission: {
    findMany: async ({ where } = {}) => { trace.findMany.push(where); return videos.filter((v) => v.status === where.status); },
  },
});

// Fake recordEarning that emulates the real one's log side-effects, so cycle
// counters (earningsGenerated / duplicatesSuppressed) are genuinely exercised.
function fakeRecord(behaviour) {
  const f = async (p) => {
    f.calls.push(p);
    const b = typeof behaviour === 'function' ? behaviour(p) : behaviour;
    if (b === 'throw') throw new Error('db exploded');
    if (b === UGC_EARNING_STATUS.DUPLICATE) { p.log?.duplicateSuppressed?.({ ugcVideoId: p.ugcVideoId, idempotencyKey: 'k' }); return { status: 'duplicate' }; }
    p.log?.earningGenerated?.({ ugcVideoId: p.ugcVideoId, affiliateId: p.affiliateId, amount: '20.00', generatedSales: p.generatedSales, idempotencyKey: 'k' });
    return { status: 'created', amount: '20.00' };
  };
  f.calls = [];
  return f;
}

function fakeLock(acquireResult = true) {
  const l = { acquired: 0, released: 0 };
  l.acquire = async () => { l.acquired += 1; return acquireResult; };
  l.release = async () => { l.released += 1; };
  return l;
}

const RUNNABLE = { enabled: true, earningsEngineEnabled: true, commissionPerSale: 4, minGeneratedSales: 5, maxGeneratedSales: 5 };
const run = (over) => {
  const trace = { findMany: [] };
  const records = [];
  const videos = over.videos ?? [];
  const recordEarning = over.recordEarning ?? fakeRecord(UGC_EARNING_STATUS.CREATED);
  const lock = over.lock;
  const settings = over.settings ?? RUNNABLE;
  return runUgcEngineCycle({
    db: fakeDb(videos, trace),
    getSettings: async () => settings,
    recordEarning,
    now: over.now ?? now,
    rng: over.rng ?? (() => 0),
    dryRun: over.dryRun ?? false,
    lock,
    sink: (r) => records.push(r),
  }).then((report) => ({ report, records, trace, recordEarning, lock }));
};

const V = (id, status = 'RUNNING') => ({ id, affiliateId: `aff-${id}`, productId: `prod-${id}`, status });

console.log('1) advisory lock held elsewhere → skip, no work:');
{
  const lock = fakeLock(false);
  const { report, trace, recordEarning, records } = await run({ videos: [V('a')], lock });
  ok('report.lock === skipped', report.lock === 'skipped');
  ok('outcome lock_skipped in finished record', records.some((r) => r.event === 'finished' && r.outcome === 'lock_skipped'));
  ok('lock_skipped event emitted', records.some((r) => r.event === 'lock_skipped'));
  ok('no submissions queried', trace.findMany.length === 0);
  ok('no earnings recorded', recordEarning.calls.length === 0);
  ok('lock was acquired-attempted, not released (never held)', lock.acquired === 1 && lock.released === 0);
}

console.log('2) settings gate — disabled is a quiet no-op:');
{
  const { report, trace, recordEarning, records } = await run({ videos: [V('a')], settings: { enabled: false, earningsEngineEnabled: true } , lock: fakeLock(true) });
  ok('lock acquired', report.lock === 'acquired');
  ok('no submissions queried when disabled', trace.findMany.length === 0);
  ok('no earnings recorded when disabled', recordEarning.calls.length === 0);
  ok('no failure logged for a normal disable', report.failures === 0);
  ok('finished event present', records.some((r) => r.event === 'finished' && r.outcome === 'disabled'));
}

console.log('3) settings gate — invalid config is a FAILURE, generates nothing:');
{
  const { report, recordEarning, records } = await run({
    videos: [V('a')],
    settings: { enabled: true, earningsEngineEnabled: true, minGeneratedSales: 10, maxGeneratedSales: 1 },
    lock: fakeLock(true),
  });
  ok('at least one failure logged', report.failures >= 1);
  ok('nothing generated on invalid settings', recordEarning.calls.length === 0);
  ok('outcome invalid_settings', records.some((r) => r.event === 'finished' && r.outcome === 'invalid_settings'));
}

console.log('4) RUNNING submissions only:');
{
  const videos = [V('a', 'RUNNING'), V('b', 'PAUSED'), V('c', 'PENDING'), V('d', 'RUNNING'), V('e', 'APPROVED')];
  const { report, trace, recordEarning } = await run({ videos, lock: fakeLock(true) });
  ok('query filters on RUNNING', trace.findMany[0].status === 'RUNNING');
  ok('only the 2 RUNNING videos earn', recordEarning.calls.length === 2);
  ok('videosProcessed === 2', report.videosProcessed === 2);
  ok('non-RUNNING ids never recorded', !recordEarning.calls.some((c) => ['b', 'c', 'e'].includes(c.ugcVideoId)));
}

console.log('5) deterministic period + commission snapshot + RNG sales:');
{
  const { recordEarning } = await run({ videos: [V('a')], lock: fakeLock(true), rng: () => 0 });
  const call = recordEarning.calls[0];
  ok('generationPeriod is the UTC day bucket', call.generationPeriod === generationPeriod(FIXED));
  ok('generationDate is UTC midnight', call.generationDate.getTime() === generationDateOf(FIXED).getTime());
  ok('commissionPerSale snapshot forwarded', call.commissionPerSale === 4);
  ok('rng()=0 → min sales (5)', call.generatedSales === 5);

  const r2 = await run({ videos: [V('a')], lock: fakeLock(true), settings: { ...RUNNABLE, minGeneratedSales: 1, maxGeneratedSales: 10 }, rng: () => 0.999999 });
  ok('rng≈1 → max sales (10)', r2.recordEarning.calls[0].generatedSales === 10);
  const r3 = await run({ videos: [V('a')], lock: fakeLock(true), settings: { ...RUNNABLE, minGeneratedSales: 1, maxGeneratedSales: 10 }, rng: () => 0 });
  ok('rng=0 → min sales (1)', r3.recordEarning.calls[0].generatedSales === 1);
}

console.log('6) per-video failure isolation:');
{
  const videos = [V('a'), V('b'), V('c')];
  const recordEarning = fakeRecord((p) => (p.ugcVideoId === 'b' ? 'throw' : UGC_EARNING_STATUS.CREATED));
  const { report } = await run({ videos, lock: fakeLock(true), recordEarning });
  ok('all 3 videos attempted', recordEarning.calls.length === 3);
  ok('one failure recorded', report.failures === 1);
  ok('the 2 good videos still processed', report.videosProcessed === 2);
}

console.log('7) dry-run writes nothing:');
{
  const videos = [V('a'), V('b')];
  const { report, recordEarning, records } = await run({ videos, lock: fakeLock(true), dryRun: true });
  ok('recordEarning NEVER called in dry-run', recordEarning.calls.length === 0);
  ok('videos still processed (logged)', report.videosProcessed === 2);
  ok('no earnings generated', report.earningsGenerated === 0);
  ok('dry-run marked on video records', records.some((r) => r.event === 'video_processed' && r.dryRun === true && typeof r.wouldGenerateSales === 'number'));
  ok('outcome dry_run', records.some((r) => r.event === 'finished' && r.outcome === 'dry_run'));
}

console.log('8) duplicate suppression is accounted (expected, not an error):');
{
  const videos = [V('a'), V('b')];
  const recordEarning = fakeRecord(UGC_EARNING_STATUS.DUPLICATE);
  const { report, records } = await run({ videos, lock: fakeLock(true), recordEarning });
  ok('duplicatesSuppressed === 2', report.duplicatesSuppressed === 2);
  ok('duplicates are NOT failures', report.failures === 0);
  ok('duplicate_suppressed logged with expected:true', records.filter((r) => r.event === 'duplicate_suppressed').every((r) => r.expected === true));
  ok('videosProcessed still 2', report.videosProcessed === 2);
}

console.log('9) lock is ALWAYS released (happy, disabled, invalid, throw):');
{
  const happy = fakeLock(true);       await run({ videos: [V('a')], lock: happy });
  ok('released after happy cycle', happy.released === 1);
  const disabled = fakeLock(true);    await run({ videos: [V('a')], settings: { enabled: false }, lock: disabled });
  ok('released after disabled cycle', disabled.released === 1);
  const invalid = fakeLock(true);     await run({ videos: [V('a')], settings: { enabled: true, earningsEngineEnabled: true, minGeneratedSales: 9, maxGeneratedSales: 1 }, lock: invalid });
  ok('released after invalid cycle', invalid.released === 1);
  const thrown = fakeLock(true);
  await run({ videos: [V('a')], lock: thrown, recordEarning: fakeRecord('throw') });
  ok('released even when a video throws', thrown.released === 1);
}

console.log('10) structured log integrity:');
{
  const { records } = await run({ videos: [V('a')], lock: fakeLock(true) });
  ok('every record carries schemaVersion', records.length > 0 && records.every((r) => r.schemaVersion === 1));
  ok('every record tagged component', records.every((r) => r.component === 'ugc-earnings-engine'));
  ok('started + lock_acquired + finished all present', ['started', 'lock_acquired', 'finished'].every((e) => records.some((r) => r.event === e)));
  ok('finished carries a durationMs', records.some((r) => r.event === 'finished' && typeof r.durationMs === 'number'));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
