#!/usr/bin/env node
/**
 * scripts/ugcEngine.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * UGC simulation engine (runUgcTick) — driven with an injected clock, RNG, lock and
 * an in-memory fake Prisma. Proves the mandatory safeguards:
 *   • one INDIVIDUAL UgcEarning per simulated sale (generatedSales=1)
 *   • EXACT daily target over a full simulated day (feasible case)
 *   • generationSpeed is a STRICT per-pollIntervalMs-window maximum
 *   • never exceeds the daily target; stops when reached
 *   • midnight (business TZ) starts a NEW target; yesterday's rows remain
 *   • restart-safe: progress re-derived from the DB, never double-paid
 *   • RUNNING-only, lock skip, settings gate, dry-run, per-video isolation
 * Run: node scripts/ugcEngine.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { runUgcTick } from "../src/lib/ugcEngine.js";
import { startOfBusinessDay, endOfBusinessDay } from "../src/lib/ugcTime.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };
const TZ = "Africa/Casablanca";

const BASE_SETTINGS = {
  enabled: true, earningsEngineEnabled: true,
  commissionPerSale: 5,
  minGeneratedSales: 50, maxGeneratedSales: 50,   // fixed target = 50 (deterministic)
  minDailyEstimate: 1, maxDailyEstimate: 30,
  generationSpeed: 10, pollIntervalMs: 3_600_000, // 10 max per 1h window → 240/day capacity
  timezone: TZ,
  minVideoSeconds: 5, maxVideoSeconds: 120, maxUploadBytes: 50 * 1024 * 1024,
  defaultApprovedStatus: "RUNNING", allowEstimatedEarnings: true,
  exampleVideoUrl: "", instructions: [],
};

// ── In-memory fake Prisma (unique constraints, guarded updates, transaction) ────
function makeDb(subs = [{ id: "v1", affiliateId: "aff1", productId: "p1", status: "RUNNING" }]) {
  const S = { subs, targets: [], earnings: [], seq: 0, now: () => new Date() };
  const same = (a, b) => new Date(a).getTime() === new Date(b).getTime();
  const db = {
    _s: S,
    ugcVideoSubmission: {
      findMany: async ({ where } = {}) => S.subs.filter((v) => !where?.status || v.status === where.status).map((v) => ({ ...v })),
    },
    ugcDailyTarget: {
      findUnique: async ({ where }) => {
        const { ugcVideoId, generationDate } = where.ugcVideoId_generationDate;
        const t = S.targets.find((t) => t.ugcVideoId === ugcVideoId && same(t.generationDate, generationDate));
        return t ? { ...t } : null;
      },
      create: async ({ data }) => {
        if (S.targets.some((t) => t.ugcVideoId === data.ugcVideoId && same(t.generationDate, data.generationDate)))
          throw Object.assign(new Error("unique"), { code: "P2002" });
        const row = { id: `t${++S.seq}`, updatedAt: S.now(), ...data };
        S.targets.push(row); return { ...row };
      },
      updateMany: async ({ where, data }) => {
        const t = S.targets.find((t) => t.id === where.id && (where.generatedToday === undefined || t.generatedToday === where.generatedToday));
        if (!t) return { count: 0 };
        Object.assign(t, data, { updatedAt: S.now() }); return { count: 1 };
      },
    },
    ugcEarning: {
      count: async ({ where }) => S.earnings.filter((e) => e.ugcVideoId === where.ugcVideoId
        && (!where.createdAt?.gte || e.createdAt.getTime() >= where.createdAt.gte.getTime())).length,
      create: async ({ data }) => {
        if (S.earnings.some((e) => e.idempotencyKey === data.idempotencyKey)) throw Object.assign(new Error("unique"), { code: "P2002" });
        const row = { id: `e${++S.seq}`, createdAt: S.now(), ...data };
        S.earnings.push(row); return { ...row };
      },
    },
    $transaction: async (fn) => fn(db),
  };
  return db;
}

/** Step a whole business day of ticks. Returns the db. */
async function simulateDay(db, { settings = BASE_SETTINGS, tickMs = 300_000, rng = Math.random, from, to } = {}) {
  const dayStart = from ?? startOfBusinessDay(new Date("2026-07-22T09:00:00Z"), TZ);
  const dayEnd = to ?? endOfBusinessDay(dayStart, TZ);
  for (let t = dayStart.getTime(); t < dayEnd.getTime(); t += tickMs) {
    const at = new Date(t);
    db._s.now = () => at;                       // earnings stamp the simulated clock
    await runUgcTick({ db, getSettings: async () => settings, now: () => at, rng, tickMs, sink: () => {} });
  }
  return db;
}
const windowOf = (createdAt, dayStart, intervalMs) => Math.floor((createdAt.getTime() - dayStart.getTime()) / intervalMs);

console.log("1) full simulated day — EXACT target, individual sales, cap respected:");
{
  const db = makeDb();
  const dayStart = startOfBusinessDay(new Date("2026-07-22T09:00:00Z"), TZ);
  await simulateDay(db, { from: dayStart });

  ok("emitted EXACTLY the daily target (50)", db._s.earnings.length === 50);
  ok("generatedToday == dailyTarget", db._s.targets[0].generatedToday === 50 && db._s.targets[0].dailyTarget === 50);
  ok("target marked completed", db._s.targets[0].completed === true);
  ok("every sale is its OWN row with generatedSales = 1", db._s.earnings.every((e) => e.generatedSales === 1));
  ok("every sale amount = commissionPerSale (5)", db._s.earnings.every((e) => String(e.amount) === "5"));
  ok("every sale has a unique idempotencyKey", new Set(db._s.earnings.map((e) => e.idempotencyKey)).size === 50);
  ok("keys follow sim:<video>:<businessDate>:<seq>", db._s.earnings.every((e) => /^sim:v1:\d{4}-\d{2}-\d{2}:\d+$/.test(e.idempotencyKey)));

  // STRICT per-window cap
  const counts = {};
  for (const e of db._s.earnings) { const w = windowOf(e.createdAt, dayStart, BASE_SETTINGS.pollIntervalMs); counts[w] = (counts[w] || 0) + 1; }
  const maxPerWindow = Math.max(...Object.values(counts));
  ok(`never exceeds generationSpeed per window (max seen ${maxPerWindow} ≤ 10)`, maxPerWindow <= BASE_SETTINGS.generationSpeed);

  // Natural distribution: spread over many windows, not one burst, not uniform.
  const usedWindows = Object.keys(counts).length;
  ok(`spread across multiple windows (${usedWindows})`, usedWindows >= 5);
  ok("not all windows identical (natural variation)", new Set(Object.values(counts)).size > 1);
  ok("sales have distinct timestamps (individual arrivals)", new Set(db._s.earnings.map((e) => e.createdAt.getTime())).size === 50);
}

console.log("2) never exceeds the target even with many extra ticks:");
{
  const db = makeDb();
  const dayStart = startOfBusinessDay(new Date("2026-07-22T09:00:00Z"), TZ);
  await simulateDay(db, { from: dayStart, tickMs: 60_000, rng: () => 0 }); // rng 0 = always emit when quota allows
  ok("still exactly 50 (hard target guard)", db._s.earnings.length === 50);
  ok("generatedToday capped at target", db._s.targets[0].generatedToday === 50);
}

console.log("3) midnight — new business day gets a NEW target, yesterday preserved:");
{
  const db = makeDb();
  const d1 = startOfBusinessDay(new Date("2026-07-22T09:00:00Z"), TZ);
  await simulateDay(db, { from: d1 });
  const day1Count = db._s.earnings.length;
  const d2 = endOfBusinessDay(d1, TZ);
  await simulateDay(db, { from: d2 });

  ok("two target rows (one per business day)", db._s.targets.length === 2);
  ok("day 2 target is a separate row", db._s.targets[1].generationDate.getTime() === d2.getTime());
  ok("day 1 earnings preserved", day1Count === 50);
  ok("day 2 also reached its target", db._s.earnings.length === 100 && db._s.targets[1].generatedToday === 50);
  ok("business dates differ", db._s.targets[0].businessDate !== db._s.targets[1].businessDate);
}

console.log("4) restart-safety — progress re-derived from the DB, no double-pay:");
{
  const db = makeDb();
  const dayStart = startOfBusinessDay(new Date("2026-07-22T09:00:00Z"), TZ);
  const mid = new Date(dayStart.getTime() + 12 * 3600 * 1000);
  await simulateDay(db, { from: dayStart, to: mid });      // first "process"
  const afterHalf = db._s.earnings.length;
  const keysHalf = new Set(db._s.earnings.map((e) => e.idempotencyKey));
  ok("partial progress persisted", afterHalf > 0 && afterHalf < 50);

  // Simulate a PM2 restart: brand-new engine calls, zero in-memory state carried over.
  await simulateDay(db, { from: mid, to: endOfBusinessDay(dayStart, TZ) });
  ok("resumes and still finishes EXACTLY 50", db._s.earnings.length === 50);
  ok("no duplicate keys across the restart", new Set(db._s.earnings.map((e) => e.idempotencyKey)).size === 50);
  ok("earlier keys untouched (never re-paid)", [...keysHalf].every((k) => db._s.earnings.filter((e) => e.idempotencyKey === k).length === 1));
}

console.log("5) partial day (late start) — respects the cap, finishes BELOW target, no burst:");
{
  const db = makeDb();
  const dayStart = startOfBusinessDay(new Date("2026-07-22T09:00:00Z"), TZ);
  const dayEnd = endOfBusinessDay(dayStart, TZ);
  const lateStart = new Date(dayEnd.getTime() - 2 * 3600 * 1000);   // only 2 windows left, target 50
  await simulateDay(db, { from: lateStart, to: dayEnd });

  ok("finished below target (insufficient capacity)", db._s.earnings.length < 50);
  ok("emitted up to capacity (≤ 2 windows × 10)", db._s.earnings.length <= 20);
  const counts = {};
  for (const e of db._s.earnings) { const w = windowOf(e.createdAt, dayStart, BASE_SETTINGS.pollIntervalMs); counts[w] = (counts[w] || 0) + 1; }
  ok("NO end-of-day burst — cap still respected", Math.max(...Object.values(counts)) <= BASE_SETTINGS.generationSpeed);
  ok("target row not marked completed", db._s.targets[0].completed === false);
}

console.log("6) gates — lock, disabled, invalid settings, RUNNING-only, dry-run:");
{
  const at = new Date("2026-07-22T09:00:00Z");
  const mk = () => { const db = makeDb(); db._s.now = () => at; return db; };

  const dbLock = mk();
  const rep = await runUgcTick({ db: dbLock, getSettings: async () => BASE_SETTINGS, now: () => at, rng: () => 0, sink: () => {},
    lock: { acquire: async () => false, release: async () => {} } });
  ok("lock held elsewhere → nothing emitted", dbLock._s.earnings.length === 0 && rep.lock === "skipped");

  const dbOff = mk();
  await runUgcTick({ db: dbOff, getSettings: async () => ({ ...BASE_SETTINGS, earningsEngineEnabled: false }), now: () => at, rng: () => 0, sink: () => {} });
  ok("engine disabled → nothing emitted, no target created", dbOff._s.earnings.length === 0 && dbOff._s.targets.length === 0);

  const dbBad = mk();
  const badRep = await runUgcTick({ db: dbBad, getSettings: async () => ({ ...BASE_SETTINGS, maxGeneratedSales: 5, minGeneratedSales: 9 }), now: () => at, rng: () => 0, sink: () => {} });
  ok("invalid settings → failure, nothing emitted", dbBad._s.earnings.length === 0 && badRep.failures >= 1);

  const dbPaused = makeDb([{ id: "v1", affiliateId: "aff1", productId: "p1", status: "PAUSED" }]);
  dbPaused._s.now = () => at;
  await runUgcTick({ db: dbPaused, getSettings: async () => BASE_SETTINGS, now: () => at, rng: () => 0, sink: () => {} });
  ok("PAUSED video → no target, no earnings (only RUNNING earns)", dbPaused._s.earnings.length === 0 && dbPaused._s.targets.length === 0);

  const dbDry = mk();
  await runUgcTick({ db: dbDry, getSettings: async () => BASE_SETTINGS, now: () => at, rng: () => 0, dryRun: true, sink: () => {} });
  ok("dry-run → target planned but NO earnings written", dbDry._s.earnings.length === 0);

  // Per-video isolation: a failing video must not stop the others.
  const dbIso = makeDb([
    { id: "bad", affiliateId: "aff1", productId: "p1", status: "RUNNING" },
    { id: "good", affiliateId: "aff2", productId: "p2", status: "RUNNING" },
  ]);
  dbIso._s.now = () => at;
  const isoRep = await runUgcTick({
    db: dbIso, getSettings: async () => BASE_SETTINGS, now: () => at, rng: () => 0, sink: () => {},
    getOrCreateDailyTarget: async ({ video, ...rest }) => {
      if (video.id === "bad") throw new Error("boom");
      const { getOrCreateDailyTarget } = await import("../src/lib/services/ugcDailyTargetService.js");
      return getOrCreateDailyTarget({ video, ...rest });
    },
  });
  ok("one video failing does not abort the batch", isoRep.failures === 1 && dbIso._s.earnings.length === 1);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
