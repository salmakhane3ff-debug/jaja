#!/usr/bin/env node
/**
 * scripts/balanceEquivalence.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * REGRESSION GATE (refinement #5): the registry-based balance MUST equal the
 * legacy getAffiliateBalance formula EXACTLY for an affiliate with no UGC records.
 *
 * The live affiliate value is:
 *     legacy = parseFloat((totalEarned + bonusBalance - totalPaid).toFixed(2))
 * The new orchestrator composes the SAME three terms as balance providers plus a
 * UGC provider that returns 0 when the affiliate has no UGC earnings:
 *     new = serializeAmount(composeBalance([
 *             {amount: totalEarned}, {amount: bonusBalance},
 *             {amount: -totalPaid},  {amount: 0 (ugc, none)}]))
 *
 * This test proves legacy === new across the money domain, so replacing the
 * calculation cannot change any existing affiliate's balance. (The DB-level
 * assertion — old function vs new function on a real affiliate — runs in the
 * balance-orchestration increment, which requires a database.)
 *
 * Run: node scripts/balanceEquivalence.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { composeBalance, serializeAmount } from "../src/lib/balance/composeBalance.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

// The EXACT legacy computation from affiliateSystemService.getAffiliateBalance.
const legacyBalance = (earned, bonus, paid) => parseFloat((earned + bonus - paid).toFixed(2));

// The NEW registry-based computation for a NO-UGC affiliate (ugc component = 0).
const newBalance = (earned, bonus, paid) =>
  serializeAmount(composeBalance([
    { source: "referral_commission", amount: earned },
    { source: "referral_bonus",      amount: bonus },
    { source: "payouts",             amount: -paid },
    { source: "ugc_earning",         amount: 0 },      // no UGC records
  ]));

console.log("1) hand-picked cases (incl. float-tricky) match exactly:");
{
  const cases = [
    [0, 0, 0], [1500, 50, 200], [0.1, 0.2, 0], [99.5, 0, 0], [0.1, 0.1, 0.1],
    [1000000, 0, 0], [0, 0, 100], /* negative balance */ [10.05, 0, 0], [3.33, 3.33, 3.33],
    [199 * 0.5, 0, 0] /* commission-shaped */, [0.3, 0.3, 0.6],
  ];
  let allEqual = true;
  for (const [e, b, p] of cases) {
    const L = legacyBalance(e, b, p), N = newBalance(e, b, p);
    if (L !== N) { allEqual = false; console.log(`     ↳ MISMATCH earned=${e} bonus=${b} paid=${p}: legacy=${L} new=${N}`); }
  }
  ok("all hand-picked cases: legacy === new", allEqual);
  ok("no-UGC → ugc term is exactly additive-zero", newBalance(1500, 50, 200) === legacyBalance(1500, 50, 200));
  ok("float-classic 0.1+0.2 identical", legacyBalance(0.1, 0.2, 0) === newBalance(0.1, 0.2, 0));
}

console.log("2) fuzz 50,000 money triples (2dp cents) — must be EXACTLY equal every time:");
{
  const cents = () => Math.floor(Math.random() * 5_000_00) / 100;   // 0 .. 5,000,000.00
  let mismatches = 0, worst = null;
  for (let i = 0; i < 50000; i++) {
    const e = cents(), b = Math.floor(Math.random() * 10000) / 100, p = cents();
    const L = legacyBalance(e, b, p), N = newBalance(e, b, p);
    if (L !== N) { mismatches++; if (!worst) worst = { e, b, p, L, N }; }
  }
  if (worst) console.log(`     ↳ first mismatch: ${JSON.stringify(worst)}`);
  ok(`50,000 random 2dp triples all exactly equal (mismatches=${mismatches})`, mismatches === 0);
}

console.log("3) negative balances (payouts exceed earnings) also match:");
{
  let allEqual = true;
  for (let i = 0; i < 5000; i++) {
    const e = Math.floor(Math.random() * 10000) / 100;
    const p = e + Math.floor(Math.random() * 10000) / 100;   // paid > earned
    if (legacyBalance(e, 0, p) !== newBalance(e, 0, p)) allEqual = false;
  }
  ok("5,000 negative-balance cases: legacy === new", allEqual);
}

console.log("4) adding UGC earnings changes the balance by exactly the UGC amount:");
{
  // Sanity: the ONLY difference the UGC provider introduces is its own component.
  const base = newBalance(1500, 50, 200);                    // ugc = 0 → 1350
  const withUgc = serializeAmount(composeBalance([
    { amount: 1500 }, { amount: 50 }, { amount: -200 }, { amount: 640.5 },
  ]));
  ok("no-UGC baseline is the legacy value", base === legacyBalance(1500, 50, 200));
  ok("UGC 640.50 adds exactly 640.50", withUgc === 1990.5 && (withUgc - base).toFixed(2) === "640.50");
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
