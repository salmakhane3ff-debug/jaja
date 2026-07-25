#!/usr/bin/env node
/**
 * scripts/liveFeed.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Affiliate dashboard live-feed logic. Proves the polling feed surfaces each new
 * order exactly once (no duplicate sound, no duplicate row), never sounds on the
 * initial load, and is robust to a row briefly vanishing from a partial response
 * (reconnect safety). Pure — no React/DOM/network.
 * Run: node scripts/liveFeed.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { itemId, diffNewItems, shouldPlaySaleSound, seedSeen } from '../src/lib/liveFeed.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };

console.log('1) itemId resolves the first present id key:');
{
  ok("_id preferred", itemId({ _id: 'a', id: 'b' }) === 'a');
  ok('falls back to id', itemId({ id: 'b' }) === 'b');
  ok('coerced to string', itemId({ _id: 42 }) === '42');
  ok('null for no id', itemId({ foo: 1 }) === null);
  ok('null for non-object', itemId(null) === null);
}

console.log('2) diffNewItems surfaces each order exactly once:');
{
  // Initial load seeds the seen-set; those are "new" here but the caller
  // suppresses sound on initial (see §4).
  const load1 = diffNewItems(new Set(), [{ _id: 'o1' }, { _id: 'o2' }]);
  ok('first load returns all as new', load1.newIds.join(',') === 'o1,o2');
  ok('seen set has both', load1.seen.size === 2);

  // Same list again → nothing new (no duplicate sound / no duplicate surfacing).
  const load2 = diffNewItems(load1.seen, [{ _id: 'o1' }, { _id: 'o2' }]);
  ok('re-poll of identical list → 0 new', load2.newItems.length === 0);

  // A new order arrives → only it is new.
  const load3 = diffNewItems(load2.seen, [{ _id: 'o3' }, { _id: 'o1' }, { _id: 'o2' }]);
  ok('only the new order is surfaced', load3.newIds.join(',') === 'o3');
  ok('seen set grows to 3', load3.seen.size === 3);
}

console.log('3) Reconnect safety — a row that vanishes then returns is NOT re-surfaced:');
{
  const s1 = diffNewItems(new Set(), [{ _id: 'a' }, { _id: 'b' }]).seen;
  // Partial/failed response where "b" is briefly missing.
  const partial = diffNewItems(s1, [{ _id: 'a' }]);
  ok('partial poll surfaces nothing new', partial.newItems.length === 0);
  ok('seen set stays monotonic (still knows b)', partial.seen.has('b'));
  // b returns on the next poll → must NOT count as new again (no double sound).
  const back = diffNewItems(partial.seen, [{ _id: 'a' }, { _id: 'b' }]);
  ok('returning row is not re-surfaced', back.newItems.length === 0);
}

console.log('4) shouldPlaySaleSound gating:');
{
  ok('never on initial load', shouldPlaySaleSound({ initial: true, newCount: 5 }) === false);
  ok('no sound when nothing new', shouldPlaySaleSound({ initial: false, newCount: 0 }) === false);
  ok('sound when new orders arrive', shouldPlaySaleSound({ initial: false, newCount: 1 }) === true);
}

console.log('5) Mixed id keys + input immutability:');
{
  const prev = new Set(['x']);
  const res = diffNewItems(prev, [{ id: 'x' }, { id: 'y' }]);
  ok('mixed id-key dedup works', res.newIds.join(',') === 'y');
  ok('does NOT mutate the input set', prev.size === 1 && !prev.has('y'));
  ok('invalid items skipped safely', diffNewItems(new Set(), [null, {}, { _id: 'z' }]).newIds.join(',') === 'z');
  ok('seedSeen builds the id set', (() => { const s = seedSeen([{ _id: '1' }, { _id: '2' }]); return s.size === 2 && s.has('1'); })());
}

console.log('6) Fake-engine and real orders trigger IDENTICAL live behaviour:');
{
  // The affiliate feed reads AffiliateOrder rows; both real checkout orders and
  // Fake Orders Engine orders land there the same way (recordAffiliateOrder), and
  // the diff is source-agnostic — it keys on id only, never on isFake.
  const seen = seedSeen([{ _id: 'existing' }]);
  const next = diffNewItems(seen, [
    { _id: 'realOrder',  isFake: false },
    { _id: 'fakeOrder',  isFake: true  },
    { _id: 'existing' },
  ]);
  ok('both a real and a fake new order are surfaced', next.newIds.sort().join(',') === 'fakeOrder,realOrder');
  ok('diff ignores isFake entirely (same code path)', next.newItems.every((o) => 'isFake' in o));
  ok('sound would play for either source', shouldPlaySaleSound({ initial: false, newCount: next.newItems.length }) === true);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
