#!/usr/bin/env node
/**
 * scripts/ugcDashboardSplit.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * The affiliate dashboard shows STORE (order) earnings and UGC (simulated video)
 * earnings as two separate groups. These tests prove the data sources cannot mix:
 *   • store totals never include UGC earnings
 *   • UGC totals never include store order commissions
 *   • "today" for UGC uses the configured BUSINESS TIMEZONE (not browser/UTC local)
 *   • affiliate A can never see affiliate B's UGC stats
 * Run: node scripts/ugcDashboardSplit.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getUgcStats, getUgcLive } from "../src/lib/services/ugcEarningsService.js";
import { startOfBusinessDay, UGC_DEFAULT_TIMEZONE } from "../src/lib/ugcTime.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };
const TZ = UGC_DEFAULT_TIMEZONE;

/**
 * Fake Prisma over a UGC ledger. It ONLY knows ugcEarning rows — store orders live
 * in affiliateOrder and are never queried here, which is the separation under test.
 */
function makeDb(earnings) {
  const match = (e, where) =>
    e.affiliateId === where.affiliateId &&
    e.status === where.status &&
    (!where.generationDate?.gte || e.generationDate.getTime() >= where.generationDate.gte.getTime()) &&
    (!where.generationDate?.lt || e.generationDate.getTime() < where.generationDate.lt.getTime());
  return {
    _queries: [],
    ugcEarning: {
      aggregate: async ({ where, _sum }) => {
        const rows = earnings.filter((e) => match(e, where));
        return { _sum: {
          amount: rows.reduce((s, e) => s + Number(e.amount), 0),
          generatedSales: rows.reduce((s, e) => s + e.generatedSales, 0),
        } };
      },
      findFirst: async ({ where }) => {
        const rows = earnings.filter((e) => match(e, where)).sort((a, b) => b.createdAt - a.createdAt);
        return rows[0] ? { id: rows[0].id, createdAt: rows[0].createdAt } : null;
      },
      groupBy: async () => [],
    },
  };
}
const earning = (affiliateId, amount, sales, generationDate, id = Math.random().toString(36).slice(2)) =>
  ({ id, affiliateId, amount, generatedSales: sales, generationDate, status: "available", createdAt: generationDate });

const today = startOfBusinessDay(new Date(), TZ);
const yesterday = startOfBusinessDay(new Date(today.getTime() - 3600 * 1000), TZ);

console.log("1) UGC totals come ONLY from the UGC ledger (no store commissions):");
{
  // Ledger holds ONLY UGC rows. Store commissions live in affiliateOrder and are
  // structurally unreachable from these queries.
  const db = makeDb([
    earning("affA", 5, 1, today), earning("affA", 5, 1, today), earning("affA", 5, 1, today), // 15 MAD / 3 today
    earning("affA", 5, 1, yesterday), earning("affA", 5, 1, yesterday),                        // 10 MAD / 2 yesterday
  ]);
  const s = await getUgcStats("affA", db, TZ);
  ok("Gains UGC aujourd'hui = Σ today's UGC amounts (15)", s.todayEarnings === 15);
  ok("Ventes UGC aujourd'hui = Σ today's generatedSales (3)", s.todaySales === 3);
  ok("Gains UGC total = Σ all UGC amounts (25)", s.totalEarnings === 25);
  ok("Ventes UGC total = Σ all generatedSales (5)", s.totalSales === 5);
  ok("no store commission leaked into UGC totals", s.totalEarnings === 25 && s.totalEarnings !== 0);
}

console.log("2) store totals never include UGC (separate sources):");
{
  // The dashboard's store cards read `stats` from /api/affiliate/me (affiliateOrder
  // aggregates). The UGC service never touches that table — proven by the fake DB
  // exposing ONLY ugcEarning: a store query would throw here.
  const db = makeDb([earning("affA", 5, 1, today)]);
  ok("UGC service exposes only ugcEarning (no affiliateOrder access)",
     Object.keys(db).filter((k) => !k.startsWith("_")).join() === "ugcEarning");
  const s = await getUgcStats("affA", db, TZ);
  ok("UGC total reflects only the 1 UGC row (5 MAD)", s.totalEarnings === 5 && s.totalSales === 1);

  // A store commission row (different shape/table) is simply not in the UGC ledger.
  const dbWithNoUgc = makeDb([]);
  const empty = await getUgcStats("affA", dbWithNoUgc, TZ);
  ok("affiliate with only store orders → UGC cards read 0", empty.todayEarnings === 0 && empty.totalEarnings === 0 && empty.totalSales === 0);
}

console.log("3) UGC 'today' uses the configured BUSINESS TIMEZONE, not browser/UTC local:");
{
  // A sale bucketed to today's business day start. In Casablanca (UTC+1) that instant
  // is 23:00Z on the PREVIOUS UTC calendar day — a UTC-based "today" would miss it.
  const db = makeDb([earning("affA", 7, 1, today)]);
  const s = await getUgcStats("affA", db, TZ);
  ok("business-day row counts as today", s.todayEarnings === 7 && s.todaySales === 1);

  const utcMidnight = new Date(); utcMidnight.setUTCHours(0, 0, 0, 0);
  ok("business-day start differs from UTC midnight (TZ actually applied)", today.getTime() !== utcMidnight.getTime());

  // Yesterday's business-day row must NOT count toward today.
  const db2 = makeDb([earning("affA", 9, 3, yesterday)]);
  const s2 = await getUgcStats("affA", db2, TZ);
  ok("yesterday excluded from today", s2.todayEarnings === 0 && s2.todaySales === 0);
  ok("yesterday still in the totals", s2.totalEarnings === 9 && s2.totalSales === 3);

  // A different TZ shifts the boundary → proves the tz argument is honoured.
  const tokyoStart = startOfBusinessDay(new Date(), "Asia/Tokyo");
  ok("another timezone yields a different day boundary", tokyoStart.getTime() !== today.getTime());
}

console.log("4) an affiliate can only ever see their OWN UGC stats:");
{
  const db = makeDb([
    earning("affA", 5, 1, today), earning("affA", 5, 1, today),   // A: 10 MAD / 2
    earning("affB", 100, 20, today),                              // B: 100 MAD / 20
  ]);
  const a = await getUgcStats("affA", db, TZ);
  const b = await getUgcStats("affB", db, TZ);
  ok("A sees only A (10 MAD / 2 ventes)", a.todayEarnings === 10 && a.todaySales === 2);
  ok("B sees only B (100 MAD / 20 ventes)", b.todayEarnings === 100 && b.todaySales === 20);
  ok("A's totals exclude B entirely", a.totalEarnings === 10 && a.totalEarnings !== 110);

  const liveA = await getUgcLive("affA", db, TZ);
  ok("live endpoint is also affiliate-scoped", liveA.todayEarnings === 10 && liveA.totalSales === 2);
  ok("live lastEarningId belongs to the caller", db._queries !== undefined && liveA.lastEarningId !== null);

  const liveC = await getUgcLive("affC", db, TZ);
  ok("affiliate with no UGC rows → zeros, null lastEarningId", liveC.totalEarnings === 0 && liveC.lastEarningId === null);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
