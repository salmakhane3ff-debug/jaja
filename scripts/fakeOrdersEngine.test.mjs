#!/usr/bin/env node
/**
 * scripts/fakeOrdersEngine.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Fake Orders Engine — scheduling CORE. Proves the engine NEVER exceeds the
 * configured limits and respects working hours/days + random delay. Pure logic
 * + a full tick loop driven by an in-memory fake db. No real database, no clock.
 * Run: node scripts/fakeOrdersEngine.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  tzHourAndWeekday, isWithinWorkingWindow, limitReached, decideEmit,
  randDelaySec, runFakeOrdersTick, FAKE_ENGINE_LOCK_KEY,
} from '../src/lib/fakeOrdersEngine.js';
import { UGC_ENGINE_LOCK_KEY } from '../src/lib/ugcEngine.js';
import { randomMoroccanPhone, randomMoroccanName, randomMoroccanCustomer, MA_CITIES } from '../src/lib/fakeOrderData.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };

const TZ = 'UTC'; // deterministic: local hour == UTC hour (no DST plumbing to fight)
const at = (iso) => new Date(iso);

console.log('1) Moroccan customer data formats:');
{
  let allPhones = true, allNames = true, allCities = true;
  for (let i = 0; i < 500; i++) {
    if (!/^0[67]\d{8}$/.test(randomMoroccanPhone())) allPhones = false;
    if (randomMoroccanName().split(' ').length < 2) allNames = false;
    const c = randomMoroccanCustomer();
    if (!MA_CITIES.includes(c.shippingAddress.city)) allCities = false;
  }
  ok('phones are 10-digit Moroccan mobiles (06/07…)', allPhones);
  ok('names have first + last', allNames);
  ok('customer city is a real Moroccan city', allCities);
  ok('customer carries a phone', /^0[67]\d{8}$/.test(randomMoroccanCustomer().phone));
}

console.log('2) Working-hours / working-days window:');
{
  // 2026-01-07 is a Wednesday (weekday 3).
  const cfg = { workingDays: '1,2,3,4,5', workingHourStart: 9, workingHourEnd: 17 };
  ok('weekday computed correctly (Wed=3)', tzHourAndWeekday(at('2026-01-07T10:00:00Z'), TZ).weekday === 3);
  ok('inside window (Wed 10:00)', isWithinWorkingWindow(cfg, at('2026-01-07T10:00:00Z'), TZ));
  ok('before hours (Wed 08:00) → out', !isWithinWorkingWindow(cfg, at('2026-01-07T08:00:00Z'), TZ));
  ok('after hours (Wed 17:00) → out (end exclusive)', !isWithinWorkingWindow(cfg, at('2026-01-07T17:00:00Z'), TZ));
  ok('non-working day (Sun) → out', !isWithinWorkingWindow(cfg, at('2026-01-04T10:00:00Z'), TZ));

  const overnight = { workingDays: '0,1,2,3,4,5,6', workingHourStart: 22, workingHourEnd: 6 };
  ok('overnight window includes 23:00', isWithinWorkingWindow(overnight, at('2026-01-07T23:00:00Z'), TZ));
  ok('overnight window includes 03:00', isWithinWorkingWindow(overnight, at('2026-01-07T03:00:00Z'), TZ));
  ok('overnight window excludes 12:00', !isWithinWorkingWindow(overnight, at('2026-01-07T12:00:00Z'), TZ));

  const full = { workingDays: '0,1,2,3,4,5,6', workingHourStart: 0, workingHourEnd: 0 };
  ok('start==end → 24h window', isWithinWorkingWindow(full, at('2026-01-07T13:00:00Z'), TZ));
}

console.log('3) Rate-limit detection (never exceed):');
{
  const cfg = { ordersPerMinute: 1, ordersPerHour: 2, ordersPerDay: 20 };
  ok('minute cap hit', limitReached(cfg, { minute: 1, hour: 1, day: 1 }) === 'PER_MINUTE');
  ok('hour cap hit', limitReached(cfg, { minute: 0, hour: 2, day: 5 }) === 'PER_HOUR');
  ok('day cap hit', limitReached(cfg, { minute: 0, hour: 0, day: 20 }) === 'PER_DAY');
  ok('under all caps → null', limitReached(cfg, { minute: 0, hour: 1, day: 19 }) === null);
  ok('null limit is not enforced', limitReached({ ordersPerHour: null }, { minute: 99, hour: 99, day: 99 }) === null);
}

console.log('4) decideEmit gating order:');
{
  const base = { enabled: true, workingDays: '0,1,2,3,4,5,6', workingHourStart: 0, workingHourEnd: 0 };
  const now = at('2026-01-07T10:00:00Z');
  const counts0 = { minute: 0, hour: 0, day: 0 };
  ok('disabled → DISABLED', decideEmit({ ...base, enabled: false }, { now, counts: counts0, tz: TZ }).reason === 'DISABLED');
  ok('outside window → OUTSIDE_WINDOW',
     decideEmit({ ...base, workingHourStart: 11, workingHourEnd: 12 }, { now, counts: counts0, tz: TZ }).reason === 'OUTSIDE_WINDOW');
  ok('future nextOrderAt → DELAY',
     decideEmit({ ...base, nextOrderAt: at('2026-01-07T10:30:00Z') }, { now, counts: counts0, tz: TZ }).reason === 'DELAY');
  ok('limit reached → PER_DAY',
     decideEmit({ ...base, ordersPerDay: 5 }, { now, counts: { minute: 0, hour: 0, day: 5 }, tz: TZ }).reason === 'PER_DAY');
  ok('all clear → emit OK',
     decideEmit(base, { now, counts: counts0, tz: TZ }).emit === true);
}

console.log('5) randDelaySec bounds:');
{
  let inRange = true;
  for (let i = 0; i < 1000; i++) {
    const d = randDelaySec({ minDelaySec: 30, maxDelaySec: 90 });
    if (d < 30 || d > 90) inRange = false;
  }
  ok('always within [min,max]', inRange);
  ok('min==max → fixed', randDelaySec({ minDelaySec: 45, maxDelaySec: 45 }) === 45);
}

// ── Fake db + harness for full-tick limit enforcement ─────────────────────────
function makeHarness(configRow) {
  const emitted = []; // { affiliateId, ts }
  const store = { config: { ...configRow } };
  const db = {
    fakeOrderConfig: {
      findMany: async () => (store.config.enabled ? [store.config] : []),
      update: async ({ data }) => { Object.assign(store.config, data); return store.config; },
    },
  };
  // countFn derived from the emitted log (what the real one does against the DB).
  const countFn = async (affiliateId, now) => {
    const since = (ms) => now.getTime() - ms;
    const inWin = (ms) => emitted.filter((e) => e.affiliateId === affiliateId && e.ts.getTime() >= since(ms)).length;
    return { minute: inWin(60_000), hour: inWin(3_600_000), day: inWin(86_400_000) };
  };
  const createOrderFn = async (config, { now }) => {
    emitted.push({ affiliateId: config.affiliateId, ts: now() });
    return { ok: true, orderId: `o${emitted.length}` };
  };
  return { db, emitted, countFn, createOrderFn, store };
}

function maxInWindow(times, windowMs) {
  let max = 0;
  for (const t of times) {
    const c = times.filter((u) => u >= t && u < t + windowMs).length;
    if (c > max) max = c;
  }
  return max;
}

console.log('6) Full tick loop NEVER exceeds hourly/daily caps:');
{
  const cfg = {
    id: 'c1', affiliateId: 'aff1', enabled: true,
    ordersPerMinute: null, ordersPerHour: 2, ordersPerDay: 5,
    minDelaySec: 1, maxDelaySec: 1,
    workingDays: '0,1,2,3,4,5,6', workingHourStart: 0, workingHourEnd: 0,
    productMode: 'all', productIds: [],
  };
  const h = makeHarness(cfg);
  let sim = new Date('2026-01-05T00:00:00Z').getTime();
  const STEP = 10 * 60_000; // 10-min ticks
  for (let i = 0; i < 300; i++) { // 300 × 10min = 50h (>2 days)
    const now = () => new Date(sim);
    await runFakeOrdersTick({ db: h.db, now, rng: Math.random, tz: TZ, countFn: h.countFn, createOrderFn: h.createOrderFn });
    sim += STEP;
  }
  const times = h.emitted.map((e) => e.ts.getTime());
  ok('emitted at least one order', times.length > 0);
  ok('never more than 2 in any 60-min window', maxInWindow(times, 3_600_000) <= 2);
  ok('never more than 5 in any 24-h window', maxInWindow(times, 86_400_000) <= 5);
}

console.log('7) Random delay spacing is honoured:');
{
  const cfg = {
    id: 'c2', affiliateId: 'aff2', enabled: true,
    ordersPerHour: 100, ordersPerDay: 100,       // caps wide open
    minDelaySec: 3600, maxDelaySec: 3600,          // force ~1h spacing
    workingDays: '0,1,2,3,4,5,6', workingHourStart: 0, workingHourEnd: 0,
    productMode: 'all', productIds: [],
  };
  const h = makeHarness(cfg);
  let sim = new Date('2026-01-05T00:00:00Z').getTime();
  for (let i = 0; i < 240; i++) { // 240 × 1min = 4h
    const now = () => new Date(sim);
    await runFakeOrdersTick({ db: h.db, now, tz: TZ, countFn: h.countFn, createOrderFn: h.createOrderFn });
    sim += 60_000;
  }
  const times = h.emitted.map((e) => e.ts.getTime()).sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 1; i < times.length; i++) minGap = Math.min(minGap, times[i] - times[i - 1]);
  ok('at least 3 orders over 4h', times.length >= 3);
  ok('consecutive orders spaced >= ~1h (delay respected)', minGap >= 3_600_000);
}

console.log('8) Emissions only inside the working-hours window:');
{
  const cfg = {
    id: 'c3', affiliateId: 'aff3', enabled: true,
    ordersPerHour: 100, ordersPerDay: 100,
    minDelaySec: 1, maxDelaySec: 1,
    workingDays: '0,1,2,3,4,5,6', workingHourStart: 9, workingHourEnd: 11, // 09:00–11:00 only
    productMode: 'all', productIds: [],
  };
  const h = makeHarness(cfg);
  let sim = new Date('2026-01-05T00:00:00Z').getTime();
  for (let i = 0; i < 288; i++) { // 288 × 5min = 24h
    const now = () => new Date(sim);
    await runFakeOrdersTick({ db: h.db, now, tz: TZ, countFn: h.countFn, createOrderFn: h.createOrderFn });
    sim += 5 * 60_000;
  }
  const hours = h.emitted.map((e) => e.ts.getUTCHours());
  ok('emitted during the window', hours.length > 0);
  ok('ALL emissions have hour in [9,11)', hours.every((x) => x >= 9 && x < 11));
}

console.log('9) Advisory lock → only ONE engine instance ticks at a time:');
{
  const cfg = {
    id: 'c4', affiliateId: 'aff4', enabled: true,
    ordersPerHour: 100, ordersPerDay: 100, minDelaySec: 1, maxDelaySec: 1,
    workingDays: '0,1,2,3,4,5,6', workingHourStart: 0, workingHourEnd: 0,
    productMode: 'all', productIds: [],
  };
  ok('fake engine lock key differs from UGC engine', FAKE_ENGINE_LOCK_KEY !== UGC_ENGINE_LOCK_KEY);

  // A second instance that cannot take the lock must emit nothing.
  const h1 = makeHarness(cfg);
  const lockDenied = { acquire: async () => false, release: async () => {} };
  const r1 = await runFakeOrdersTick({
    db: h1.db, now: () => new Date('2026-01-07T10:00:00Z'), tz: TZ,
    countFn: h1.countFn, createOrderFn: h1.createOrderFn, lock: lockDenied,
  });
  ok('lock denied → tick skipped (no_lock)', r1.skipped === 'no_lock' && r1.emitted === 0);
  ok('lock denied → nothing generated', h1.emitted.length === 0);

  // The holder acquires, emits, and releases the lock.
  const h2 = makeHarness(cfg);
  let released = false;
  const lockHeld = { acquire: async () => true, release: async () => { released = true; } };
  const r2 = await runFakeOrdersTick({
    db: h2.db, now: () => new Date('2026-01-07T10:00:00Z'), tz: TZ,
    countFn: h2.countFn, createOrderFn: h2.createOrderFn, lock: lockHeld,
  });
  ok('lock held → tick runs and emits', r2.emitted === 1 && h2.emitted.length === 1);
  ok('lock is released after the tick', released === true);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
