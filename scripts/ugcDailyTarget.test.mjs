#!/usr/bin/env node
/**
 * scripts/ugcDailyTarget.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Daily-target engine: pure pacing helpers + the daily-target service (get-or-create,
 * atomic single-sale emission). No DB — an in-memory fake Prisma models the unique
 * constraints + transaction. Run: node scripts/ugcDailyTarget.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  pickDailyTarget, buildSimKey, computeWindowPlan, windowTargetCount, seedFraction, shouldEmitThisTick,
} from "../src/lib/ugcEarnings.js";
import { getOrCreateDailyTarget, emitOneSale } from "../src/lib/services/ugcDailyTargetService.js";
import { startOfBusinessDay, businessDateKey } from "../src/lib/ugcTime.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };
const TZ = "Africa/Casablanca";

console.log("1) buildSimKey — unique per (video, day, sequence):");
{
  ok("format sim:<video>:<date>:<seq>", buildSimKey("v1", "2026-07-22", 0) === "sim:v1:2026-07-22:0");
  ok("sequence differentiates", buildSimKey("v1", "2026-07-22", 4) !== buildSimKey("v1", "2026-07-22", 5));
  ok("day differentiates", buildSimKey("v1", "2026-07-22", 0) !== buildSimKey("v1", "2026-07-23", 0));
  let threw = false; try { buildSimKey("v1", "2026-07-22", -1); } catch { threw = true; }
  ok("negative seq rejected", threw);
}

console.log("2) computeWindowPlan — [floor, cap] band (never exceed speed, feasible floor):");
{
  // full day ahead, plenty of windows → floor 0, cap = speed
  ok("early day: floor 0, cap = speed", JSON.stringify(computeWindowPlan({ remaining: 100, generationSpeed: 10, windowsLeft: 24 })) === JSON.stringify({ floor: 0, cap: 10 }));
  // last window must finish everything remaining (≤ speed)
  ok("last window: floor = cap = remaining", JSON.stringify(computeWindowPlan({ remaining: 7, generationSpeed: 10, windowsLeft: 1 })) === JSON.stringify({ floor: 7, cap: 7 }));
  // behind schedule: floor rises but never above cap
  const p = computeWindowPlan({ remaining: 19, generationSpeed: 10, windowsLeft: 2 });
  ok("behind: floor forces pace (19 over 2 windows @10 → floor 9)", p.floor === 9 && p.cap === 10);
  // infeasible (late start): floor collapses to cap, day will finish below target
  const inf = computeWindowPlan({ remaining: 50, generationSpeed: 10, windowsLeft: 2 });
  ok("infeasible: floor = cap (respect speed, fall short)", inf.floor === 10 && inf.cap === 10);
  ok("cap never exceeds remaining", computeWindowPlan({ remaining: 3, generationSpeed: 10, windowsLeft: 5 }).cap === 3);
}

console.log("3) windowTargetCount + seedFraction — stable within a window:");
{
  const seed = seedFraction("v1:123456");
  ok("seedFraction in [0,1)", seed >= 0 && seed < 1);
  ok("same seed → same fraction (restart-stable)", seedFraction("v1:123456") === seed);
  ok("windowTarget within [floor, cap]", (() => { const w = windowTargetCount(2, 8, seed); return w >= 2 && w <= 8; })());
  ok("floor==cap → that value", windowTargetCount(5, 5, seed) === 5);
}

console.log("4) shouldEmitThisTick — paces, forces to meet the quota, never past it:");
{
  const rng0 = () => 0, rng1 = () => 0.999999;
  ok("quota met → never emit (cap respected)", shouldEmitThisTick({ windowTarget: 3, emittedThisWindow: 3, ticksLeftInWindow: 100, rng: rng0 }) === false);
  ok("quota == ticks left → force emit every tick", shouldEmitThisTick({ windowTarget: 5, emittedThisWindow: 0, ticksLeftInWindow: 5, rng: rng1 }) === true);
  ok("quota > ticks left → force emit", shouldEmitThisTick({ windowTarget: 9, emittedThisWindow: 0, ticksLeftInWindow: 3, rng: rng1 }) === true);
  ok("rng below pace → emit", shouldEmitThisTick({ windowTarget: 10, emittedThisWindow: 0, ticksLeftInWindow: 20, rng: rng0 }) === true);
  ok("rng above pace → skip (quiet tick)", shouldEmitThisTick({ windowTarget: 1, emittedThisWindow: 0, ticksLeftInWindow: 100, rng: rng1 }) === false);
}

// ── In-memory fake Prisma (unique constraints + serialized $transaction) ────────
function makeDb() {
  const S = { targets: [], earnings: [], seq: 0, now: () => new Date() };
  const sameDate = (a, b) => new Date(a).getTime() === new Date(b).getTime();
  const db = {
    _s: S,
    ugcDailyTarget: {
      findUnique: async ({ where }) => {
        const { ugcVideoId, generationDate } = where.ugcVideoId_generationDate;
        const t = S.targets.find((t) => t.ugcVideoId === ugcVideoId && sameDate(t.generationDate, generationDate));
        return t ? { ...t } : null;
      },
      create: async ({ data }) => {
        if (S.targets.some((t) => t.ugcVideoId === data.ugcVideoId && sameDate(t.generationDate, data.generationDate)))
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
        const row = { id: `e${++S.seq}`, createdAt: data.createdAt || S.now(), ...data };
        S.earnings.push(row); return { ...row };
      },
    },
    $transaction: async (fn) => fn(db),
  };
  return db;
}
const video = { id: "v1", affiliateId: "aff1", productId: "p1", status: "RUNNING" };
const settings = { minGeneratedSales: 100, maxGeneratedSales: 100, commissionPerSale: 5 };

console.log("5) getOrCreateDailyTarget — one fixed target per business day:");
{
  const db = makeDb();
  const now = new Date("2026-07-22T09:00:00Z");
  const rngHi = () => 0.999999; // → picks max (100)
  const a = await getOrCreateDailyTarget({ video, now, tz: TZ, settings, db, rng: rngHi });
  ok("created first time", a.created === true && a.target.dailyTarget === 100);
  ok("businessDate stored", a.target.businessDate === businessDateKey(now, TZ));
  ok("generationDate = business-day start", a.target.generationDate.getTime() === startOfBusinessDay(now, TZ).getTime());

  const b = await getOrCreateDailyTarget({ video, now: new Date("2026-07-22T20:00:00Z"), tz: TZ, settings, db, rng: () => 0 });
  ok("same day → NOT recreated, target unchanged (100, not re-randomized)", b.created === false && b.target.dailyTarget === 100);
  ok("only one target row for the day", db._s.targets.length === 1);

  const c = await getOrCreateDailyTarget({ video, now: new Date("2026-07-23T09:00:00Z"), tz: TZ, settings, db, rng: () => 0 });
  ok("new business day → new target row", c.created === true && db._s.targets.length === 2);
}

console.log("6) emitOneSale — one individual earning per sale, atomic, no double-pay:");
{
  const db = makeDb();
  const now = new Date("2026-07-22T09:00:00Z");
  const { target } = await getOrCreateDailyTarget({ video, now, tz: TZ, settings, db, rng: () => 0.5 }); // target ~100

  // `target` is a SNAPSHOT (generatedToday=0), like a real Prisma read.
  const r1 = await emitOneSale({ video, target, settings, db });
  ok("emitted one sale", r1.emitted === true && r1.seq === 0);
  ok("earning: generatedSales = 1", db._s.earnings[0].generatedSales === 1);
  ok("earning: amount = commissionPerSale (5)", String(db._s.earnings[0].amount) === "5");
  ok("earning key = sim:v1:date:0", db._s.earnings[0].idempotencyKey === buildSimKey("v1", target.businessDate, 0));
  ok("generatedToday incremented to 1", db._s.targets[0].generatedToday === 1);

  // Re-emitting with the SAME stale snapshot (seq 0) must NOT double-pay.
  const dup = await emitOneSale({ video, target, settings, db });
  ok("stale seq → conflict, no second earning", dup.emitted === false && db._s.earnings.length === 1 && db._s.targets[0].generatedToday === 1);

  // Fresh read → next sale claims seq 1.
  const fresh = await db.ugcDailyTarget.findUnique({ where: { ugcVideoId_generationDate: { ugcVideoId: "v1", generationDate: target.generationDate } } });
  const r2 = await emitOneSale({ video, target: fresh, settings, db });
  ok("next sale claims seq 1", r2.emitted === true && r2.seq === 1 && db._s.earnings.length === 2);
  ok("each sale is its OWN row (2 rows, each generatedSales=1)", db._s.earnings.every((e) => e.generatedSales === 1) && db._s.earnings.length === 2);
}

console.log("7) emitOneSale — never exceeds the target:");
{
  const db = makeDb();
  const now = new Date("2026-07-22T09:00:00Z");
  await getOrCreateDailyTarget({ video, now, tz: TZ, settings: { ...settings, minGeneratedSales: 3, maxGeneratedSales: 3 }, db, rng: () => 0 });
  let emitted = 0;
  for (let i = 0; i < 10; i++) {
    const t = await db.ugcDailyTarget.findUnique({ where: { ugcVideoId_generationDate: { ugcVideoId: "v1", generationDate: startOfBusinessDay(now, TZ) } } });
    const r = await emitOneSale({ video, target: t, settings, db });
    if (r.emitted) emitted++;
  }
  ok("stops exactly at target (3)", emitted === 3 && db._s.earnings.length === 3);
  ok("target marked completed", db._s.targets[0].completed === true && db._s.targets[0].generatedToday === 3);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
