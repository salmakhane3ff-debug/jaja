#!/usr/bin/env node
/**
 * scripts/ugcEarnings.test.mjs
 * Tests the balance composition (refinement #1) + crash-safe earnings primitives
 * (refinement #3). Pure — uses Prisma.Decimal offline, no DB.
 * Run: node scripts/ugcEarnings.test.mjs
 */

import { composeBalance, toDecimal, serializeAmount, Decimal } from "../src/lib/balance/composeBalance.js";
import {
  UGC_GRANULARITY, generationPeriod, generationDateOf, buildIdempotencyKey,
  pickGeneratedSales, computeEarningAmount,
} from "../src/lib/ugcEarnings.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };
const throws = (fn, code) => { try { fn(); return false; } catch (e) { return e.code === code; } };

console.log("1) balance composition (provider pattern, Decimal-exact):");
{
  const comps = [
    { source: "referral_commission", amount: "1500.00" },
    { source: "referral_bonus",      amount: 50 },
    { source: "ugc_earning",         amount: new Decimal("640.50") },
    { source: "payouts",             amount: -200 },   // deductions are negative components
  ];
  const bal = composeBalance(comps);
  ok("sum is exact 1990.50", bal.toString() === "1990.5");
  ok("returns a Decimal", bal instanceof Decimal);
  ok("serializes to number at the boundary", serializeAmount(bal) === 1990.5);

  ok("0.1 + 0.2 composes to exactly 0.30", composeBalance([{ amount: "0.1" }, { amount: "0.2" }]).toString() === "0.3");
  ok("empty → 0", composeBalance([]).toString() === "0" && composeBalance(null).toString() === "0");
  ok("null/garbage amounts treated as 0", composeBalance([{ amount: null }, { amount: "abc" }, { amount: undefined }]).toString() === "0");
  ok("rounds HALF_UP to 2dp", composeBalance([{ amount: "0.005" }]).toString() === "0.01");
  ok("UGC-only affiliate: referral 0 + ugc 640 = 640", composeBalance([{ amount: 0 }, { amount: "640" }]).toString() === "640");
  ok("no-UGC affiliate: ugc component 0 leaves referral unchanged",
     composeBalance([{ amount: "1500" }, { amount: 0 }]).toString() === composeBalance([{ amount: "1500" }]).toString());
}

console.log("2) toDecimal coercion:");
{
  ok("number", toDecimal(4).toString() === "4");
  ok("string", toDecimal("4.25").toString() === "4.25");
  ok("Decimal passthrough", toDecimal(new Decimal("9.99")).toString() === "9.99");
  ok("null/empty → 0", toDecimal(null).toString() === "0" && toDecimal("").toString() === "0");
  ok("NaN/garbage → 0 (never throws)", toDecimal("xyz").toString() === "0" && toDecimal(NaN).toString() === "0");
}

console.log("3) deterministic generation period (idempotency bucket):");
{
  const d = new Date("2026-07-20T14:37:00Z");
  ok("daily is UTC YYYY-MM-DD", generationPeriod(d, UGC_GRANULARITY.DAILY) === "2026-07-20");
  ok("hourly adds the hour", generationPeriod(d, UGC_GRANULARITY.HOURLY) === "2026-07-20T14");
  ok("same instant → same period (deterministic)", generationPeriod(d) === generationPeriod(new Date("2026-07-20T14:37:00Z")));
  ok("different day → different period", generationPeriod(new Date("2026-07-21T00:00:00Z")) !== generationPeriod(d));
  ok("invalid date throws", throws(() => generationPeriod("not-a-date"), "UGC_BAD_DATE"));
  const gd = generationDateOf(d);
  ok("generationDate is UTC midnight day-bucket", gd.toISOString() === "2026-07-20T00:00:00.000Z");
}

console.log("4) idempotency key = ugcVideoId:generationPeriod:");
{
  ok("stable format", buildIdempotencyKey("vid-1", "2026-07-20") === "vid-1:2026-07-20");
  ok("same inputs → same key (dedup guarantee)", buildIdempotencyKey("v", "p") === buildIdempotencyKey("v", "p"));
  ok("no date duplicated beyond the period", (buildIdempotencyKey("v", "2026-07-20").match(/2026-07-20/g) || []).length === 1);
  ok("missing parts throw", throws(() => buildIdempotencyKey("", "p"), "UGC_BAD_KEY") && throws(() => buildIdempotencyKey("v", ""), "UGC_BAD_KEY"));
}

console.log("5) Decimal-safe earning amount (snapshot commission):");
{
  ok("17 sales × 4 = 68.00 exact", computeEarningAmount(17, 4).toString() === "68");
  ok("3 × 3.33 = 9.99 exact", computeEarningAmount(3, "3.33").toString() === "9.99");
  ok("0 sales → 0", computeEarningAmount(0, 4).toString() === "0");
  ok("returns a Decimal", computeEarningAmount(1, 1) instanceof Decimal);
  ok("HALF_UP rounding to 2dp", computeEarningAmount(3, "0.335").toString() === "1.01"); // 1.005 → 1.01
  ok("negative commission rejected", throws(() => computeEarningAmount(1, -1), "UGC_BAD_COMMISSION"));
  ok("non-integer sales rejected", throws(() => computeEarningAmount(1.5, 4), "UGC_BAD_SALES"));
  ok("negative sales rejected", throws(() => computeEarningAmount(-1, 4), "UGC_BAD_SALES"));
}

console.log("6) sales generation (random, injectable RNG, bounded):");
{
  ok("rng=0 → min", pickGeneratedSales(1, 30, () => 0) === 1);
  ok("rng→1 → max", pickGeneratedSales(1, 30, () => 0.9999999) === 30);
  ok("mid rng within range", (() => { const v = pickGeneratedSales(1, 30, () => 0.5); return v >= 1 && v <= 30; })());
  ok("min==max → that value", pickGeneratedSales(7, 7, () => Math.random()) === 7);
  let allInRange = true;
  for (let i = 0; i < 500; i++) { const v = pickGeneratedSales(1, 30); if (v < 1 || v > 30 || !Number.isInteger(v)) allInRange = false; }
  ok("500 real draws all integer in [1,30]", allInRange);
  ok("invalid range (max<min) throws", throws(() => pickGeneratedSales(30, 1), "UGC_BAD_RANGE"));
  ok("negative min throws", throws(() => pickGeneratedSales(-1, 5), "UGC_BAD_RANGE"));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
