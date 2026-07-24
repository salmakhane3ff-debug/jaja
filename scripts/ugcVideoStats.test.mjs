#!/usr/bin/env node
/**
 * scripts/ugcVideoStats.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-video UGC stats aggregation (getUgcStatsByVideo) — grouped by ugcVideoId,
 * read from the SAME ugc_earnings ledger the engine writes. Driven with a fake
 * Prisma `groupBy`, no DB. Also checks the affiliate list handler exposes
 * `videoStats` via the existing API without duplicating global stats.
 * Run: node scripts/ugcVideoStats.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getUgcStatsByVideo, earningsTrendPercent, performanceStatus } from "../src/lib/services/ugcEarningsService.js";
import { affiliateUgcHandlers } from "../src/lib/ugcRouteHandlers.js";
import { businessDayStarts, UGC_DEFAULT_TIMEZONE } from "../src/lib/ugcTime.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

// Fake Prisma. Queries are told apart by shape:
//   • by includes 'generationDate'  → the 7-day daily (sparkline) query
//   • where has no generationDate    → total (all-time)
//   • where.generationDate.lt        → yesterday window
//   • where.generationDate.gte only  → today window
function fakeDb({ today = [], yesterday = [], total = [], daily = [] }) {
  const calls = [];
  return {
    calls,
    ugcEarning: {
      groupBy: async (args) => {
        calls.push(args);
        if (Array.isArray(args.by) && args.by.includes("generationDate")) return daily;
        const gd = args.where.generationDate;
        if (!gd) return total;
        if (gd.lt) return yesterday;
        return today;
      },
    },
  };
}
const row = (id, amount, sales) => ({ ugcVideoId: id, _sum: { amount, generatedSales: sales } });

// Day buckets aligned to the service's BUSINESS-TIMEZONE convention (default TZ).
// days[6] = today, days[0] = 6 days ago — exactly what getUgcStatsByVideo matches on.
const days = businessDayStarts(new Date(), UGC_DEFAULT_TIMEZONE, 7);
const dayAt = (offsetFromToday) => days[6 + offsetFromToday];
const dailyRow = (id, offsetFromToday, amount) => ({ ugcVideoId: id, generationDate: dayAt(offsetFromToday), _sum: { amount: String(amount) } });

console.log("1) groups earnings by ugcVideoId (today + yesterday + total):");
{
  const db = fakeDb({
    total:     [row("v1", "120.00", 30), row("v2", "8.00", 2)],
    yesterday: [row("v1", "16.00", 4)],
    today:     [row("v1", "20.00", 5)],
  });
  const map = await getUgcStatsByVideo("aff1", db);

  ok("query filters by the affiliate", db.calls.every((c) => c.where.affiliateId === "aff1"));
  ok("query filters status = available (generated earnings)", db.calls.every((c) => c.where.status === "available"));
  ok("groups strictly by ugcVideoId", db.calls.every((c) => Array.isArray(c.by) && c.by[0] === "ugcVideoId"));
  ok("runs three windows: total, yesterday (gte+lt), today (gte only)",
     db.calls.some((c) => !c.where.generationDate) &&
     db.calls.some((c) => c.where.generationDate?.lt) &&
     db.calls.some((c) => c.where.generationDate?.gte && !c.where.generationDate?.lt));

  // serializeAmount returns a 2dp-rounded Number (same as getUgcStats), not a string.
  ok("v1 total earnings + sales", map.v1.totalEarnings === 120 && map.v1.totalSales === 30);
  ok("v1 today earnings + sales", map.v1.todayEarnings === 20 && map.v1.todaySales === 5);
  ok("v1 yesterday earnings + sales", map.v1.yesterdayEarnings === 16 && map.v1.yesterdaySales === 4);
  ok("v1 trend = round((20-16)/16*100) = 25%", map.v1.earningsTrendPercent === 25);
  ok("v1 salesDifference = 5 - 4 = 1", map.v1.salesDifference === 1);
  ok("v2 has total but zero today/yesterday", map.v2.totalEarnings === 8 && map.v2.todaySales === 0 && map.v2.yesterdaySales === 0);
  ok("v2 both days zero → flat 0%", map.v2.earningsTrendPercent === 0 && map.v2.salesDifference === 0);
  ok("a video with NO earnings is simply absent (no fabricated row)", map.v3 === undefined);
}

console.log("2) empty ledger → empty map (missing data, no crash, no invented values):");
{
  const map = await getUgcStatsByVideo("aff1", fakeDb({}));
  ok("no videos → {}", Object.keys(map).length === 0);
}

console.log("2b) earningsTrendPercent — the required trend cases (pure):");
{
  ok("positive trend: 20 vs 16 → +25", earningsTrendPercent(20, 16) === 25);
  ok("negative trend: 88 vs 100 → -12", earningsTrendPercent(88, 100) === -12);
  ok("unchanged: 50 vs 50 → 0", earningsTrendPercent(50, 50) === 0);
  ok("yesterday 0 & today > 0 → null (Nouveau)", earningsTrendPercent(20, 0) === null);
  ok("both days 0 → 0 (unchanged)", earningsTrendPercent(0, 0) === 0);
  ok("today 0 & yesterday > 0 → -100", earningsTrendPercent(0, 40) === -100);
  ok("rounds to nearest whole percent", earningsTrendPercent(10, 3) === 233 /* 233.33→233 */);
  ok("missing/NaN inputs never crash → 0 or null", earningsTrendPercent(undefined, undefined) === 0 && earningsTrendPercent(NaN, 10) === -100);
  ok("never returns Infinity or NaN",
     [earningsTrendPercent(5, 0), earningsTrendPercent(0, 0), earningsTrendPercent(1, 0.0)]
       .every((v) => v === null || (Number.isFinite(v))));
}

console.log("2c) trend surfaces correctly through the aggregation map:");
{
  const mk = async (todayAmt, ydayAmt, todaySales, ydaySales) => (await getUgcStatsByVideo("aff1", fakeDb({
    total:     [row("v1", String(todayAmt), todaySales)],
    yesterday: ydayAmt > 0 || ydaySales > 0 ? [row("v1", String(ydayAmt), ydaySales)] : [],
    today:     todayAmt > 0 || todaySales > 0 ? [row("v1", String(todayAmt), todaySales)] : [],
  }))).v1;

  ok("positive → +25%", (await mk(20, 16, 5, 4)).earningsTrendPercent === 25);
  ok("negative → -20%", (await mk(16, 20, 4, 6)).earningsTrendPercent === -20);
  ok("unchanged → 0%", (await mk(10, 10, 3, 3)).earningsTrendPercent === 0);
  ok("yesterday 0 / today positive → null (Nouveau)", (await mk(12, 0, 3, 0)).earningsTrendPercent === null);
  ok("both zero → 0%", (await mk(0, 0, 0, 0)).earningsTrendPercent === 0);
  ok("salesDifference positive", (await mk(20, 16, 9, 4)).salesDifference === 5);
  ok("salesDifference negative", (await mk(16, 20, 4, 9)).salesDifference === -5);
}

console.log("3) affiliate list API exposes videoStats without duplicating global stats:");
{
  const calls = { list: 0, stats: 0, byVideo: 0 };
  const h = affiliateUgcHandlers({
    service: { listForAffiliate: async () => { calls.list++; return [{ id: "v1" }]; } },
    getUgcStats: async () => { calls.stats++; return { todayEarnings: "20.00", totalEarnings: "120.00", todaySales: 5, totalSales: 30 }; },
    getUgcStatsByVideo: async () => { calls.byVideo++; return { v1: { todayEarnings: "20.00", totalEarnings: "120.00", todaySales: 5, totalSales: 30 } }; },
    getSettings: async () => ({ timezone: UGC_DEFAULT_TIMEZONE }),   // the handler resolves the business TZ
  });
  const res = await h.list({ affiliateId: "aff1" });
  const body = await res.json();
  ok("200 OK", res.status === 200);
  ok("global stats still present", body.stats && body.stats.totalEarnings === "120.00");
  ok("per-video stats present, keyed by video id", body.videoStats && body.videoStats.v1.totalSales === 30);
  ok("global and per-video are SEPARATE objects", body.stats !== body.videoStats);
  ok("each source queried exactly once", calls.list === 1 && calls.stats === 1 && calls.byVideo === 1);
  // Stale-dashboard fix: the authenticated stats read must be uncacheable so no
  // browser/CDN layer serves a stale response after the hourly engine writes.
  const cc = res.headers.get("cache-control") || "";
  ok("stats response is no-store (never cached by browser/CDN)", /no-store/.test(cc) && /private/.test(cc));
}

console.log("4) 7-day sparkline aggregation (daily earnings, oldest→newest, zero-filled):");
{
  const db = fakeDb({
    total: [row("v1", "227.00", 60)],
    daily: [
      dailyRow("v1", -6, 12), dailyRow("v1", -5, 25), dailyRow("v1", -4, 21), dailyRow("v1", -3, 31),
      dailyRow("v1", -2, 44), dailyRow("v1", -1, 39), dailyRow("v1", 0, 55),
    ],
  });
  const map = await getUgcStatsByVideo("aff1", db);
  ok("returns exactly 7 daily points", Array.isArray(map.v1.last7DaysEarnings) && map.v1.last7DaysEarnings.length === 7);
  ok("series is ordered oldest→newest", JSON.stringify(map.v1.last7DaysEarnings) === JSON.stringify([12, 25, 21, 31, 44, 39, 55]));
  ok("daily query groups by (ugcVideoId, generationDate)", db.calls.some((c) => c.by.includes("ugcVideoId") && c.by.includes("generationDate")));

  // Missing days are zero-filled (no fabricated numbers, no crash).
  const db2 = fakeDb({ total: [row("v2", "70.00", 10)], daily: [dailyRow("v2", -6, 40), dailyRow("v2", 0, 30)] });
  const map2 = await getUgcStatsByVideo("aff1", db2);
  ok("gaps filled with 0", JSON.stringify(map2.v2.last7DaysEarnings) === JSON.stringify([40, 0, 0, 0, 0, 0, 30]));
  ok("no earnings → all-zero series", Object.keys((await getUgcStatsByVideo("aff1", fakeDb({}))) ).length === 0);
}

console.log("5) ranking by today's earnings (desc), medals for top 3:");
{
  const db = fakeDb({
    total: [row("a", "500", 100), row("b", "50", 10), row("c", "9", 2), row("d", "1", 1)],
    today: [row("a", "300", 60), row("b", "120", 25), row("c", "9", 2)],  // d earned nothing today
  });
  const map = await getUgcStatsByVideo("aff1", db);
  ok("#1 = highest today earnings (a: 300)", map.a.rank === 1);
  ok("#2 = next (b: 120)", map.b.rank === 2);
  ok("#3 = next (c: 9)", map.c.rank === 3);
  ok("#4 = zero-today video (d), ranked last", map.d.rank === 4);
  ok("ranks are unique + contiguous 1..4", JSON.stringify([map.a.rank, map.b.rank, map.c.rank, map.d.rank].sort()) === JSON.stringify([1, 2, 3, 4]));

  // Best performer = the rank-1 video (what the UI selects).
  const best = Object.entries(map).find(([, v]) => v.rank === 1);
  ok("best performer is the top today-earner", best[0] === "a" && best[1].todayEarnings === 300);
}

console.log("6) performance badge (HOT / Stable / Cooling):");
{
  ok("HOT: trend +24, today>=yesterday", performanceStatus(24, 62, 50) === "HOT");
  ok("HOT boundary: exactly +20", performanceStatus(20, 60, 50) === "HOT");
  ok("Stable: +19 (below HOT threshold)", performanceStatus(19, 59, 50) === "Stable");
  ok("Stable: 0 (unchanged)", performanceStatus(0, 50, 50) === "Stable");
  ok("Stable: -10 boundary", performanceStatus(-10, 45, 50) === "Stable");
  ok("Cooling: -12", performanceStatus(-12, 44, 50) === "Cooling");
  ok("Cooling: -100 (dropped to zero)", performanceStatus(-100, 0, 40) === "Cooling");
  ok("Nouveau (trend null) & today>0 → HOT", performanceStatus(null, 30, 0) === "HOT");
  ok("both zero (trend null-safe) → Stable", performanceStatus(0, 0, 0) === "Stable");
  ok("HOT requires today>=yesterday even if trend>=20", performanceStatus(25, 40, 60) === "Stable");

  // Surfaces through the aggregation map.
  const db = fakeDb({ total: [row("h", "100", 20)], today: [row("h", "60", 12)], yesterday: [row("h", "40", 8)] });
  ok("map carries performanceStatus", (await getUgcStatsByVideo("aff1", db)).h.performanceStatus === "HOT");
}

console.log("7) full field contract (extended, non-breaking):");
{
  const db = fakeDb({
    total: [row("v1", "227", 60)], today: [row("v1", "55", 11)], yesterday: [row("v1", "39", 9)],
    daily: [dailyRow("v1", -1, 39), dailyRow("v1", 0, 55)],
  });
  const v = (await getUgcStatsByVideo("aff1", db)).v1;
  for (const k of ["todayEarnings", "todaySales", "yesterdayEarnings", "yesterdaySales",
                   "totalEarnings", "totalSales", "earningsTrendPercent", "salesDifference",
                   "rank", "last7DaysEarnings", "performanceStatus"]) {
    ok(`returns "${k}"`, k in v);
  }
  ok("existing fields unchanged (today=55, trend=+41)", v.todayEarnings === 55 && v.earningsTrendPercent === 41);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
