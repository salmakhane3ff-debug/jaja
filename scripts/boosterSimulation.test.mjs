#!/usr/bin/env node
/**
 * scripts/boosterSimulation.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Starter Booster SIMULATION engine — the ONE source of booster progress.
 *
 * Proves the required guarantees:
 *   • real AffiliateOrder rows do NOT affect booster progress
 *   • ticks NEVER create or modify AffiliateOrder rows (the fake db throws if
 *     the engine so much as touches that model)
 *   • progress never exceeds the target
 *   • PAUSED simulations do not advance
 *   • completion never refunds the purchase (the purchase row is never written)
 *   • page, dashboard widget, timeline and Live Activity all read the SAME state
 * Run: node scripts/boosterSimulation.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  SIM_STATUS, normalizeSimConfig, initialSimulation, tickSimulation, pushTimeline,
  adjustSimulation, setSimulationStatus, resetSimulation, simulationView, splitSimulations,
} from '../src/lib/boosterSimulation.js';
import {
  runBoosterSimulationTick, getBoosterSimulationDashboard, adminSimulationAction, getBoosterLiveFacts,
} from '../src/lib/services/boosterSimulationService.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };
const codeOf = async (fn) => { try { await fn(); return null; } catch (e) { return e.code || e.message; } };

const NOW = new Date(2026, 7, 2, 12, 0, 0, 0).getTime();
const HOUR = 3_600_000, DAY = 86_400_000;
const CFG = { enabled: true, tickIntervalSec: 60, minPerTick: 1, maxPerTick: 2, dailyMin: 0, dailyMax: 0 };
const sim = (over = {}) => ({
  id: 's1', purchaseId: 'bp1', affiliateId: 'a1', packageId: 'p500',
  targetSales: 500, simulatedSales: 0, todaySales: 0, dayKey: '2026-08-02',
  startedAt: new Date(NOW - DAY), endsAt: new Date(NOW + 10 * DAY), lastTickAt: null,
  status: SIM_STATUS.RUNNING, timeline: [], ...over,
});

/**
 * Fake db exposing ONLY the models the engine may touch. A Proxy throws on
 * anything else — so if the engine ever read/wrote affiliateOrder, commissions
 * or payouts, these tests would fail loudly.
 */
function makeDb({ purchases = [], sims = [], packages = [], simulation = CFG } = {}) {
  const state = { sims: sims.map((s) => ({ ...s })), purchaseWrites: 0 };
  const models = {
    setting: { findUnique: async ({ where }) => (where.id === 'booster-packages'
      ? { data: { enabled: true, packages, simulation } } : null) },
    boosterSimulation: {
      findMany: async ({ where = {} } = {}) => state.sims.filter((s) => {
        if (where.status?.in) return where.status.in.includes(s.status);
        if (where.status) return s.status === where.status;
        if (where.affiliateId) return s.affiliateId === where.affiliateId;
        return true;
      }).map((s) => ({ ...s })),
      findUnique: async ({ where }) => { const s = state.sims.find((x) => x.purchaseId === where.purchaseId || x.id === where.id); return s ? { ...s } : null; },
      create: async ({ data }) => { const r = { id: `s${state.sims.length + 1}`, ...data }; state.sims.push(r); return { ...r }; },
      update: async ({ where, data }) => { const s = state.sims.find((x) => x.id === where.id); Object.assign(s, data); return { ...s }; },
    },
    affiliateBoosterPurchase: {
      findMany: async ({ where = {} } = {}) => purchases.filter((p) => !where.affiliateId || p.affiliateId === where.affiliateId).map((p) => ({ ...p })),
      // Any write here would mean the simulation touched the accounting side.
      update: async () => { state.purchaseWrites++; throw new Error('SIMULATION MUST NOT WRITE PURCHASES'); },
      updateMany: async () => { state.purchaseWrites++; throw new Error('SIMULATION MUST NOT WRITE PURCHASES'); },
      create: async () => { state.purchaseWrites++; throw new Error('SIMULATION MUST NOT WRITE PURCHASES'); },
    },
    affiliate: { findMany: async () => [{ id: 'a1', name: 'Sara', username: 'sara1' }] },
  };
  const db = new Proxy(models, {
    get(t, p) {
      if (typeof p === 'symbol' || p === 'then') return undefined;
      if (p === '_state') return state;
      if (p in t) return t[p];
      throw new Error(`FORBIDDEN MODEL ACCESS: db.${String(p)} — the booster simulation must stay isolated from real commerce`);
    },
  });
  return db;
}

async function main() {
  console.log('1) Config normalization (admin-controlled tick/min/max/daily):');
  {
    const d = normalizeSimConfig({});
    ok('defaults: enabled, 900s, +1..+2', d.enabled === true && d.tickIntervalSec === 900 && d.minPerTick === 1 && d.maxPerTick === 2);
    ok('interval clamped to >= 5s', normalizeSimConfig({ tickIntervalSec: 1 }).tickIntervalSec === 5);
    ok('inverted per-tick range swapped', (() => { const c = normalizeSimConfig({ minPerTick: 5, maxPerTick: 2 }); return c.minPerTick === 2 && c.maxPerTick === 5; })());
    ok('inverted daily range swapped', (() => { const c = normalizeSimConfig({ dailyMin: 90, dailyMax: 10 }); return c.dailyMin === 10 && c.dailyMax === 90; })());
    ok('can be disabled', normalizeSimConfig({ enabled: false }).enabled === false);
    ok('+3 possible when the admin raises the max', normalizeSimConfig({ maxPerTick: 3 }).maxPerTick === 3);
  }

  console.log('2) A new booster starts at 0 and advances gradually:');
  {
    const s0 = initialSimulation({ purchaseId: 'bp1', affiliateId: 'a1', packageId: 'p', targetSales: 500, durationDays: 15 }, NOW);
    ok('progress starts at 0', s0.simulatedSales === 0 && s0.todaySales === 0);
    ok('status RUNNING', s0.status === SIM_STATUS.RUNNING);
    ok('endsAt = start + duration', s0.endsAt.getTime() === NOW + 15 * DAY);

    const r1 = tickSimulation(s0, CFG, NOW, () => 0);      // rnd 0 → +min
    ok('first tick adds the minimum (+1)', r1.added === 1 && r1.next.simulatedSales === 1);
    const r2 = tickSimulation(r1.next, CFG, NOW + 61_000, () => 0.99); // → +max
    ok('later tick can add the maximum (+2)', r2.added === 2 && r2.next.simulatedSales === 3);
    ok('todaySales tracks the same additions', r2.next.todaySales === 3);
    ok('timeline records the activity', r2.next.timeline.length >= 1);
  }

  console.log('3) Tick interval, daily caps and the target are all respected:');
  {
    const tooSoon = tickSimulation(sim({ lastTickAt: new Date(NOW - 1000) }), CFG, NOW);
    ok('does not advance before the interval elapses', tooSoon.changed === false && tooSoon.reason === 'too_soon');

    const capped = tickSimulation(sim({ todaySales: 20 }), { ...CFG, dailyMax: 20 }, NOW);
    ok('daily cap blocks further sales', capped.added === 0 && capped.reason === 'daily_cap');

    const partial = tickSimulation(sim({ todaySales: 19 }), { ...CFG, dailyMax: 20, minPerTick: 5, maxPerTick: 5 }, NOW);
    ok('a tick is trimmed to the remaining daily room', partial.added === 1);

    const nearTarget = tickSimulation(sim({ simulatedSales: 499 }), { ...CFG, minPerTick: 5, maxPerTick: 5 }, NOW);
    ok('never exceeds the target', nearTarget.next.simulatedSales === 500 && nearTarget.added === 1);
    ok('reaching the target completes the simulation', nearTarget.next.status === SIM_STATUS.COMPLETED);

    let s = sim({ simulatedSales: 498 }), guard = 0;
    while (s.status === SIM_STATUS.RUNNING && guard++ < 50) s = tickSimulation(s, { ...CFG, maxPerTick: 9 }, NOW + guard * 61_000, () => 0.99).next;
    ok('repeated ticks can never overshoot', s.simulatedSales === 500);
  }

  console.log('4) PAUSED / COMPLETED / disabled simulations never advance:');
  {
    const paused = tickSimulation(sim({ status: SIM_STATUS.PAUSED, simulatedSales: 40 }), CFG, NOW);
    ok('paused → no change', paused.changed === false && paused.reason === 'paused' && paused.next.simulatedSales === 40);
    const done = tickSimulation(sim({ status: SIM_STATUS.COMPLETED, simulatedSales: 500 }), CFG, NOW);
    ok('completed → no change', done.changed === false && done.reason === 'completed');
    const off = tickSimulation(sim(), { ...CFG, enabled: false }, NOW);
    ok('engine disabled → no change', off.changed === false && off.reason === 'disabled');
    ok('resume lets it advance again', tickSimulation(setSimulationStatus(paused.next, SIM_STATUS.RUNNING), CFG, NOW).added > 0);
  }

  console.log('5) Day rollover, expiry and admin adjustments:');
  {
    const rolled = tickSimulation(sim({ dayKey: '2026-08-01', todaySales: 40, simulatedSales: 40 }), CFG, NOW, () => 0);
    ok('todaySales resets on a new day', rolled.next.todaySales === 1 && rolled.next.dayKey === '2026-08-02');
    ok('total progress is preserved across days', rolled.next.simulatedSales === 41);

    const expired = tickSimulation(sim({ endsAt: new Date(NOW - HOUR) }), CFG, NOW);
    ok('period elapsed → COMPLETED without extra sales', expired.next.status === SIM_STATUS.COMPLETED && expired.added === 0);

    const added = adjustSimulation(sim({ simulatedSales: 100 }), 50, NOW);
    ok('admin can add sales', added.next.simulatedSales === 150 && added.applied === 50);
    const removed = adjustSimulation(added.next, -200, NOW);
    ok('admin removal is floored at 0', removed.next.simulatedSales === 0);
    const over = adjustSimulation(sim({ simulatedSales: 490 }), 100, NOW);
    ok('manual add is clamped to the target', over.next.simulatedSales === 500 && over.next.status === SIM_STATUS.COMPLETED);
    ok('reset returns to 0 and RUNNING', (() => { const r = resetSimulation(over.next, NOW); return r.simulatedSales === 0 && r.todaySales === 0 && r.timeline.length === 0 && r.status === SIM_STATUS.RUNNING; })());
    ok('invalid status rejected', (() => { try { setSimulationStatus(sim(), 'NOPE'); return false; } catch (e) { return e.code === 'INVALID_SIM_STATUS'; } })());
  }

  console.log('6) Timeline: newest first, hourly aggregation:');
  {
    let tl = pushTimeline([], NOW, 1);
    tl = pushTimeline(tl, NOW + 60_000, 2);        // same hour → aggregates
    tl = pushTimeline(tl, NOW + 2 * HOUR, 1);      // new hour → new entry
    ok('same hour aggregates', tl[1].count === 3);
    ok('newest entry first', tl[0].count === 1 && tl[0].at > tl[1].at);
    const v = simulationView(sim({ timeline: tl, simulatedSales: 4 }), { id: 'bp1', packageName: 'Starter 500', status: 'ACTIVE' }, NOW + 2 * HOUR);
    ok('view exposes labelled timeline entries', /^\d{2}:\d{2}$/.test(v.timeline[0].label));
  }

  console.log('7) ONE view model feeds page, widget, timeline and Live Activity:');
  {
    const s = sim({ simulatedSales: 147, todaySales: 8, targetSales: 500, endsAt: new Date(NOW + 12 * DAY) });
    const v = simulationView(s, { id: 'bp1', packageName: 'Starter 500', price: 3500, status: 'ACTIVE' }, NOW);
    ok('sales / target', v.sales === 147 && v.target === 500);
    ok('percent 29%', v.percent === 29);
    ok('remaining 353', v.remaining === 353);
    ok('today +8', v.todaySales === 8);
    ok('ends in 12 days', v.daysLeft === 12);
    ok('flagged as simulated demo data', v.simulated === true);
    ok('purchase status kept separate from simulation status', v.purchaseStatus === 'ACTIVE' && v.status === SIM_STATUS.RUNNING);

    const done = simulationView(sim({ status: SIM_STATUS.COMPLETED, simulatedSales: 500 }), { id: 'b2', status: 'ACTIVE' }, NOW);
    const split = splitSimulations([v, done]);
    ok('completed booster moves to history', split.past.length === 1 && split.active.length === 1);
    ok('the purchase stays ACTIVE (no refund path)', done.purchaseStatus === 'ACTIVE');
  }

  console.log('8) ISOLATION — the engine never touches real commerce models:');
  {
    const packages = [{ id: 'p500', name: 'Starter 500', price: 3500, targetSales: 500, durationDays: 15 }];
    const purchases = [{ id: 'bp1', affiliateId: 'a1', packageId: 'p500', packageName: 'Starter 500', price: 3500, status: 'ACTIVE', activatedAt: new Date(NOW - DAY), createdAt: new Date(NOW - DAY) }];
    const db = makeDb({ purchases, packages, sims: [sim({ lastTickAt: null })] });

    const r = await runBoosterSimulationTick({ db, now: NOW, rnd: () => 0 });
    ok('tick advances the simulation', r.ticked === 1 && r.added === 1);
    ok('NO purchase row was ever written (no refund possible)', db._state.purchaseWrites === 0);
    ok('accessing affiliateOrder from the engine would throw', (() => { try { db.affiliateOrder; return false; } catch { return true; } })());
    ok('accessing payouts/commissions would throw', (() => { try { db.affiliatePayout; return false; } catch { return true; } })());

    // Real orders are irrelevant: the dashboard reads simulation state only.
    const dash = await getBoosterSimulationDashboard('a1', db, NOW);
    ok('dashboard built without reading AffiliateOrder', dash.active.length === 1);
    ok('dashboard progress comes from the simulation', dash.active[0].sales === 1);

    const disabled = await runBoosterSimulationTick({ db: makeDb({ simulation: { ...CFG, enabled: false } }), now: NOW });
    ok('disabled engine is a no-op', disabled.skipped === 'disabled');
    const noLock = await runBoosterSimulationTick({ db, lock: { acquire: async () => false, release: async () => {} }, now: NOW });
    ok('without the advisory lock nothing ticks', noLock.skipped === 'no_lock');
  }

  console.log('9) Simulations are created lazily and admin actions stay isolated:');
  {
    const packages = [{ id: 'p200', name: 'Starter 200', price: 2000, targetSales: 200, durationDays: 7 }];
    const purchases = [{ id: 'bpA', affiliateId: 'a1', packageId: 'p200', packageName: 'Starter 200', price: 2000, status: 'ACTIVE', activatedAt: new Date(NOW), createdAt: new Date(NOW) }];
    const db = makeDb({ purchases, packages, sims: [] });

    const dash = await getBoosterSimulationDashboard('a1', db, NOW);
    ok('a simulation is created for an ACTIVE purchase', db._state.sims.length === 1);
    ok('it starts at 0 / target from the package', dash.active[0].sales === 0 && dash.active[0].target === 200);

    await adminSimulationAction('bpA', 'pause', null, db, NOW);
    ok('admin pause persisted', db._state.sims[0].status === SIM_STATUS.PAUSED);
    await adminSimulationAction('bpA', 'add', 25, db, NOW);
    ok('admin add persisted', db._state.sims[0].simulatedSales === 25);
    await adminSimulationAction('bpA', 'complete', null, db, NOW);
    ok('admin complete persisted', db._state.sims[0].status === SIM_STATUS.COMPLETED);
    ok('still no purchase write after every admin action', db._state.purchaseWrites === 0);
    ok('unknown purchase → SIM_NOT_FOUND', (await codeOf(() => adminSimulationAction('nope', 'pause', null, db, NOW))) === 'SIM_NOT_FOUND');
    ok('unknown action → INVALID_ACTION', (await codeOf(() => adminSimulationAction('bpA', 'explode', null, db, NOW))) === 'INVALID_ACTION');
  }

  console.log('10) Live Activity reads the SAME simulation state:');
  {
    const db = makeDb({ sims: [sim({ simulatedSales: 300, targetSales: 500, timeline: [{ at: NOW, count: 2 }] })] });
    const facts = await getBoosterLiveFacts(db);
    ok('emits a sales fact from the timeline', facts.some((f) => f.kind === 'sales' && f.count === 2));
    ok('emits a milestone fact from the progress', facts.some((f) => f.kind === 'milestone' && f.sales === 300 && f.target === 500));
    ok('no simulations → no booster facts (no invented feed)', (await getBoosterLiveFacts(makeDb({ sims: [] }))).length === 0);
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
