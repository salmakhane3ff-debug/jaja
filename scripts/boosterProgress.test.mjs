#!/usr/bin/env node
/**
 * scripts/boosterProgress.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Starter Booster dashboard presentation logic. Progress is DERIVED from the
 * affiliate's real orders since activation + the admin package metadata; nothing
 * is stored or fabricated. Critically, completion is COMPUTED and the stored
 * status is never changed — flipping it would stop the booster_purchase balance
 * provider from deducting and silently refund the affiliate.
 * Run: node scripts/boosterProgress.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { computeBoosterProgress, buildTimeline, splitBoosters } from '../src/lib/boosterProgress.js';
import { normalizeBoosterConfig } from '../src/lib/services/boosterService.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };

const DAY = 86_400_000;
const HOUR = 3_600_000;
// Fixed "now": 2026-08-01 15:30 local.
const NOW = new Date(2026, 7, 1, 15, 30, 0, 0).getTime();
const startOfToday = new Date(NOW); startOfToday.setHours(0, 0, 0, 0);

const pkg = { id: 'p500', targetSales: 500, durationDays: 15, dailyMin: 8, dailyMax: 15 };
const purchase = (over = {}) => ({
  id: 'bp1', packageId: 'p500', packageName: 'Starter 500', price: 3500,
  status: 'ACTIVE', activatedAt: new Date(NOW - 3 * DAY), ...over,
});
const orders = (n, at) => Array.from({ length: n }, () => ({ createdAt: new Date(at), commissionAmount: 10 }));

async function main() {
  console.log('1) Package metadata is admin-configured and normalized:');
  {
    const c = normalizeBoosterConfig({ enabled: true, packages: [
      { id: 'a', name: 'Starter 200', price: 2000, durationDays: '7', targetSales: '200', dailyMin: 5, dailyMax: 10 },
      { id: 'b', name: 'No meta', price: 100 },
      { id: 'c', name: 'Inverted', price: 100, dailyMin: 20, dailyMax: 5 },
    ] });
    ok('duration/target/daily coerced to numbers', c.packages[0].durationDays === 7 && c.packages[0].targetSales === 200 && c.packages[0].dailyMin === 5);
    ok('missing metadata defaults to 0 (UI hides the line)', c.packages[1].durationDays === 0 && c.packages[1].targetSales === 0);
    ok('inverted daily range is swapped', c.packages[2].dailyMin === 5 && c.packages[2].dailyMax === 20);
    ok('price/name validation still applies', c.packages.length === 3);
  }

  console.log('2) Progress is derived from REAL orders since activation:');
  {
    const o = [...orders(5, NOW - 2 * DAY), ...orders(3, NOW - HOUR)];
    const v = computeBoosterProgress(purchase(), pkg, o, NOW);
    ok('sales = orders inside the window', v.sales === 8);
    ok('today sales counted separately', v.todaySales === 3);
    ok('remaining = target − sales', v.remaining === 492);
    ok('percent rounded', v.percent === Math.round((8 / 500) * 100));
    ok('daysLeft from duration', v.daysLeft === 12);
    ok('earnings summed from commissions', v.earnings === 80);
    ok('not completed yet', v.completed === false);
  }

  console.log('3) Orders BEFORE activation never count:');
  {
    const o = [...orders(9, NOW - 10 * DAY), ...orders(2, NOW - HOUR)];
    const v = computeBoosterProgress(purchase(), pkg, o, NOW);
    ok('pre-activation orders excluded', v.sales === 2);
  }

  console.log('4) Missing admin metadata → nulls, never invented numbers:');
  {
    const v = computeBoosterProgress(purchase(), { id: 'p', targetSales: 0, durationDays: 0 }, orders(4, NOW - HOUR), NOW);
    ok('target null', v.target === null);
    ok('percent null (no progress bar)', v.percent === null);
    ok('remaining null', v.remaining === null);
    ok('daysLeft null', v.daysLeft === null);
    ok('raw sales still reported', v.sales === 4);
    ok('never completed without duration/target', v.completed === false);
    ok('no package at all does not crash', computeBoosterProgress(purchase(), null, [], NOW).sales === 0);
  }

  console.log('5) Completion is DERIVED — the stored status is never mutated:');
  {
    const reached = computeBoosterProgress(purchase(), pkg, orders(500, NOW - HOUR), NOW);
    ok('target reached → completed', reached.completed === true);
    ok('sales capped at the target', reached.sales === 500 && reached.percent === 100);
    ok('stored status still ACTIVE (balance keeps deducting)', reached.status === 'ACTIVE');

    const p = purchase({ activatedAt: new Date(NOW - 20 * DAY) });
    const expired = computeBoosterProgress(p, pkg, orders(10, NOW - 19 * DAY), NOW);
    ok('period elapsed → completed', expired.completed === true);
    ok('daysLeft floored at 0', expired.daysLeft === 0);
    ok('status untouched', expired.status === 'ACTIVE');

    const pending = computeBoosterProgress(purchase({ status: 'PENDING' }), pkg, orders(500, NOW - HOUR), NOW);
    ok('a PENDING purchase is never marked completed', pending.completed === false);
  }

  console.log('6) Timeline groups today\'s orders by hour, newest first:');
  {
    const o = [
      ...orders(2, startOfToday.getTime() + 9 * HOUR),
      ...orders(1, startOfToday.getTime() + 11 * HOUR),
      ...orders(3, startOfToday.getTime() + 13 * HOUR),
      ...orders(4, NOW - 5 * DAY), // older day → excluded
    ];
    const t = buildTimeline(o, NOW);
    ok('one entry per hour bucket', t.length === 3);
    ok('newest first', t[0].count === 3 && t[2].count === 2);
    ok('counts aggregated per hour', t[1].count === 1);
    ok('previous days excluded', t.every((x) => x.at >= startOfToday.getTime()));
    ok('labels are HH:MM', /^\d{2}:\d{2}$/.test(t[0].label));
    ok('empty input → empty timeline', buildTimeline([], NOW).length === 0);
    ok('future orders ignored', buildTimeline(orders(3, NOW + HOUR), NOW).length === 0);
  }

  console.log('7) Active and finished boosters are never mixed:');
  {
    const running   = computeBoosterProgress(purchase({ id: 'a' }), pkg, orders(10, NOW - HOUR), NOW);
    const done      = computeBoosterProgress(purchase({ id: 'b' }), pkg, orders(500, NOW - HOUR), NOW);
    const waiting   = computeBoosterProgress(purchase({ id: 'c', status: 'PENDING' }), pkg, [], NOW);
    const refused   = computeBoosterProgress(purchase({ id: 'd', status: 'REJECTED' }), pkg, [], NOW);
    const s = splitBoosters([running, done, waiting, refused]);
    ok('active holds only the running booster', s.active.length === 1 && s.active[0].id === 'a');
    ok('completed moved to history', s.past.some((x) => x.id === 'b'));
    ok('rejected also in history', s.past.some((x) => x.id === 'd'));
    ok('pending kept apart', s.pending.length === 1 && s.pending[0].id === 'c');
    ok('no booster appears twice', new Set([...s.active, ...s.past, ...s.pending].map((x) => x.id)).size === 4);
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
