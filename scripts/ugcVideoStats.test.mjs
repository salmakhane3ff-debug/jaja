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

import { getUgcStatsByVideo } from "../src/lib/services/ugcEarningsService.js";
import { affiliateUgcHandlers } from "../src/lib/ugcRouteHandlers.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

// Fake Prisma whose groupBy returns configured rows for today vs total.
function fakeDb({ today, total }) {
  const calls = [];
  return {
    calls,
    ugcEarning: {
      groupBy: async (args) => {
        calls.push(args);
        const isToday = !!args.where.generationDate; // today query adds a date filter
        return isToday ? today : total;
      },
    },
  };
}
const row = (id, amount, sales) => ({ ugcVideoId: id, _sum: { amount, generatedSales: sales } });

console.log("1) groups earnings by ugcVideoId (today + total):");
{
  const db = fakeDb({
    total: [row("v1", "120.00", 30), row("v2", "8.00", 2)],
    today: [row("v1", "20.00", 5)],
  });
  const map = await getUgcStatsByVideo("aff1", db);

  ok("query filters by the affiliate", db.calls.every((c) => c.where.affiliateId === "aff1"));
  ok("query filters status = available (generated earnings)", db.calls.every((c) => c.where.status === "available"));
  ok("groups by ugcVideoId", db.calls.every((c) => Array.isArray(c.by) && c.by[0] === "ugcVideoId"));
  ok("today query is date-bounded, total is not", db.calls.some((c) => c.where.generationDate) && db.calls.some((c) => !c.where.generationDate));

  // serializeAmount returns a 2dp-rounded Number (same as getUgcStats), not a string.
  ok("v1 total earnings + sales", map.v1.totalEarnings === 120 && map.v1.totalSales === 30);
  ok("v1 today earnings + sales", map.v1.todayEarnings === 20 && map.v1.todaySales === 5);
  ok("v2 has total but zero today (no today row)", map.v2.totalEarnings === 8 && map.v2.totalSales === 2 && map.v2.todaySales === 0);
  ok("v2 today earnings default to zero", map.v2.todayEarnings === 0);
  ok("a video with NO earnings is simply absent (no fabricated row)", map.v3 === undefined);
}

console.log("2) empty ledger → empty map (no invented data):");
{
  const map = await getUgcStatsByVideo("aff1", fakeDb({ today: [], total: [] }));
  ok("no videos → {}", Object.keys(map).length === 0);
}

console.log("3) affiliate list API exposes videoStats without duplicating global stats:");
{
  const calls = { list: 0, stats: 0, byVideo: 0 };
  const h = affiliateUgcHandlers({
    service: { listForAffiliate: async () => { calls.list++; return [{ id: "v1" }]; } },
    getUgcStats: async () => { calls.stats++; return { todayEarnings: "20.00", totalEarnings: "120.00", todaySales: 5, totalSales: 30 }; },
    getUgcStatsByVideo: async () => { calls.byVideo++; return { v1: { todayEarnings: "20.00", totalEarnings: "120.00", todaySales: 5, totalSales: 30 } }; },
  });
  const res = await h.list({ affiliateId: "aff1" });
  const body = await res.json();
  ok("200 OK", res.status === 200);
  ok("global stats still present", body.stats && body.stats.totalEarnings === "120.00");
  ok("per-video stats present, keyed by video id", body.videoStats && body.videoStats.v1.totalSales === 30);
  ok("global and per-video are SEPARATE objects", body.stats !== body.videoStats);
  ok("each source queried exactly once", calls.list === 1 && calls.stats === 1 && calls.byVideo === 1);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
