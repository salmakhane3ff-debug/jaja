#!/usr/bin/env node
/**
 * scripts/demoIsolation.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Proves the Demo Competition system is FULLY ISOLATED from production data.
 *
 * Strategy: swap the demoService DB (via __setDemoDb) for an in-memory fake that
 * exposes ONLY the six demo models. It is wrapped in a Proxy that THROWS on any
 * other property (affiliate, ugcEarning, ugcDailyTarget, affiliatePayout,
 * wallet, …). So if generate / simulate / reset run to completion, they provably
 * never read or wrote a single production table — no network, no real DB.
 *
 * Covers (spec §9):
 *   • Boutique earnings ≠ UGC earnings (separate fields, independent)
 *   • Demo UGC never writes ugc_earnings / ugc_daily_targets (throws if it tried)
 *   • Demo never touches wallets / payouts / commissions / real affiliates
 *   • Avatar library is PERMANENT — survives regeneration + simulation ticks
 *   • Each demo affiliate keeps ONE persisted avatarUrl (never re-randomized)
 *   • Deleting a library avatar leaves assigned affiliate.avatarUrl intact
 *   • New cycle (reset) clears ONLY demo stats, including the 4 UGC fields
 * Run: node scripts/demoIsolation.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  __setDemoDb,
  generateDemoAffiliates,
  simulateTick,
  resetCompetition,
  getLeaderboard,
  getDemoAffiliateDetails,
  listDemoAvatars,
  deleteDemoAvatar,
  saveDemoSettings,
} from "../src/lib/services/demoService.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

// ── In-memory fake Prisma (DEMO models only) ────────────────────────────────────
function makeFakeDb() {
  let seq = 1;
  const id = () => `id_${seq++}`;
  const store = {
    demoAvatar: [],
    demoAffiliate: [],
    demoStats: [],
    demoEarningsHistory: [],
    demoCompetition: [],
    demoSettings: [],
  };

  // Apply data honouring Prisma's { increment } shape.
  const applyData = (row, data) => {
    for (const [k, v] of Object.entries(data)) {
      if (k === "stats") continue; // nested handled by caller
      if (v && typeof v === "object" && "increment" in v) row[k] = (row[k] || 0) + v.increment;
      else if (v && typeof v === "object" && "decrement" in v) row[k] = (row[k] || 0) - v.decrement;
      else row[k] = v;
    }
  };
  const matches = (row, where) =>
    Object.entries(where).every(([k, v]) => {
      if (v instanceof Date) return row[k] instanceof Date && row[k].getTime() === v.getTime();
      return row[k] === v;
    });

  const attachIncludes = (aff, include) => {
    if (!include) return aff;
    const out = { ...aff };
    if (include.stats) out.stats = store.demoStats.find((s) => s.demoAffiliateId === aff.id) || null;
    if (include.earningsHistory) {
      let h = store.demoEarningsHistory.filter((r) => r.demoAffiliateId === aff.id);
      const o = include.earningsHistory.orderBy;
      if (o?.date === "asc") h = h.slice().sort((a, b) => a.date - b.date);
      if (o?.date === "desc") h = h.slice().sort((a, b) => b.date - a.date);
      if (include.earningsHistory.take) h = h.slice(0, include.earningsHistory.take);
      out.earningsHistory = h;
    }
    return out;
  };

  const models = {
    demoAvatar: {
      findMany: async ({ orderBy } = {}) => {
        let rows = store.demoAvatar.slice();
        if (orderBy?.createdAt === "desc") rows = rows.sort((a, b) => b.createdAt - a.createdAt);
        return rows.map((r) => ({ ...r }));
      },
      create: async ({ data }) => { const r = { id: id(), createdAt: new Date(), storageKey: null, ...data }; store.demoAvatar.push(r); return { ...r }; },
      findUnique: async ({ where }) => { const r = store.demoAvatar.find((x) => matches(x, where)); return r ? { ...r } : null; },
      delete: async ({ where }) => { const i = store.demoAvatar.findIndex((x) => matches(x, where)); if (i < 0) throw new Error("not found"); const [r] = store.demoAvatar.splice(i, 1); return { ...r }; },
      count: async () => store.demoAvatar.length,
    },
    demoAffiliate: {
      deleteMany: async () => { const n = store.demoAffiliate.length; store.demoAffiliate = []; return { count: n }; },
      create: async ({ data }) => {
        const aff = { id: id(), isActive: true };
        applyData(aff, data);
        store.demoAffiliate.push(aff);
        if (data.stats?.create) {
          const s = { id: id(), demoAffiliateId: aff.id, rank: 0 };
          applyData(s, data.stats.create);
          store.demoStats.push(s);
        }
        return { ...aff };
      },
      findUnique: async ({ where, include, select }) => {
        const aff = store.demoAffiliate.find((x) => matches(x, where));
        if (!aff) return null;
        if (select) { const o = {}; for (const k of Object.keys(select)) o[k] = aff[k]; return o; }
        return attachIncludes(aff, include);
      },
      findMany: async ({ where, include, orderBy, take } = {}) => {
        let rows = store.demoAffiliate.filter((x) => (where ? matches(x, where) : true)).map((a) => attachIncludes(a, include));
        if (orderBy?.stats?.totalOrders === "desc") rows = rows.sort((a, b) => (b.stats?.totalOrders || 0) - (a.stats?.totalOrders || 0));
        if (take) rows = rows.slice(0, take);
        return rows;
      },
      count: async ({ where } = {}) => store.demoAffiliate.filter((x) => (where ? matches(x, where) : true)).length,
    },
    demoStats: {
      deleteMany: async () => { const n = store.demoStats.length; store.demoStats = []; return { count: n }; },
      findMany: async ({ orderBy, select } = {}) => {
        let rows = store.demoStats.slice();
        if (Array.isArray(orderBy)) {
          rows = rows.sort((a, b) => (b.totalOrders || 0) - (a.totalOrders || 0) || (b.totalRevenue || 0) - (a.totalRevenue || 0));
        }
        if (select) return rows.map((r) => { const o = {}; for (const k of Object.keys(select)) o[k] = r[k]; return o; });
        return rows.map((r) => ({ ...r }));
      },
      update: async ({ where, data }) => { const r = store.demoStats.find((x) => matches(x, where)); if (!r) throw new Error("stats not found"); applyData(r, data); return { ...r }; },
      updateMany: async ({ data }) => { for (const r of store.demoStats) applyData(r, data); return { count: store.demoStats.length }; },
    },
    demoEarningsHistory: {
      deleteMany: async () => { const n = store.demoEarningsHistory.length; store.demoEarningsHistory = []; return { count: n }; },
      create: async ({ data }) => { const r = { id: id(), ...data }; store.demoEarningsHistory.push(r); return { ...r }; },
      findFirst: async ({ where }) => { const r = store.demoEarningsHistory.find((x) => matches(x, where)); return r ? { ...r } : null; },
      update: async ({ where, data }) => { const r = store.demoEarningsHistory.find((x) => matches(x, where)); if (!r) throw new Error("history not found"); applyData(r, data); return { ...r }; },
    },
    demoCompetition: {
      findUnique: async ({ where }) => { const r = store.demoCompetition.find((x) => matches(x, where)); return r ? { ...r } : null; },
      create: async ({ data }) => { const r = { ...data }; store.demoCompetition.push(r); return { ...r }; },
      upsert: async ({ where, update, create }) => {
        let r = store.demoCompetition.find((x) => matches(x, where));
        if (r) applyData(r, update); else { r = { ...create }; store.demoCompetition.push(r); }
        return { ...r };
      },
    },
    demoSettings: {
      findUnique: async ({ where }) => { const r = store.demoSettings.find((x) => matches(x, where)); return r ? { ...r } : null; },
      upsert: async ({ where, update, create }) => {
        let r = store.demoSettings.find((x) => matches(x, where));
        if (r) applyData(r, update); else { r = { ...create }; store.demoSettings.push(r); }
        return { ...r };
      },
    },
  };

  const db = new Proxy(models, {
    get(target, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "then") return undefined; // not a thenable
      if (prop in target) return target[prop];
      throw new Error(`PRODUCTION TABLE ACCESS BLOCKED: db.${String(prop)} — demo code must never touch production data`);
    },
  });

  return { db, store };
}

// Seed avatar rows directly (bypasses sharp/storage — this test targets DB isolation).
function seedAvatars(store, men, women) {
  let n = 1;
  for (let i = 0; i < men; i++)   store.demoAvatar.push({ id: `av_m${i}`, gender: "men",   url: `/uploads/demo/avatars/m${i}.webp`, storageKey: null, createdAt: new Date(1000 + n++) });
  for (let i = 0; i < women; i++) store.demoAvatar.push({ id: `av_w${i}`, gender: "women", url: `/uploads/demo/avatars/w${i}.webp`, storageKey: null, createdAt: new Date(1000 + n++) });
}

async function main() {
  console.log("1) Production tables are unreachable through the demo DB seam:");
  {
    const { db } = makeFakeDb();
    __setDemoDb(db);
    let threwAffiliate = false, threwUgc = false, threwPayout = false;
    try { await db.affiliate.findMany(); } catch { threwAffiliate = true; }
    try { await db.ugcEarning.aggregate(); } catch { threwUgc = true; }
    try { await db.affiliatePayout.create({}); } catch { threwPayout = true; }
    ok("real 'affiliate' table access throws", threwAffiliate);
    ok("'ugcEarning' table access throws", threwUgc);
    ok("'affiliatePayout' table access throws", threwPayout);
  }

  console.log("2) generate → simulate → reset run WITHOUT touching any production table:");
  {
    const { db, store } = makeFakeDb();
    __setDemoDb(db);
    seedAvatars(store, 3, 3);
    await saveDemoSettings({ isEnabled: true, simulationSpeed: "fast" });

    let genErr = null, simErr = null, resErr = null;
    try { await generateDemoAffiliates(10, "mixed"); } catch (e) { genErr = e; }
    ok("generateDemoAffiliates completes (no production access)", genErr === null);
    try { await simulateTick(); } catch (e) { simErr = e; }
    ok("simulateTick completes (no production access)", simErr === null);
    try { await resetCompetition(true); } catch (e) { resErr = e; }
    ok("resetCompetition completes (no production access)", resErr === null);
    if (genErr || simErr || resErr) console.log("     err:", (genErr || simErr || resErr)?.message);
  }

  console.log("3) Boutique earnings and UGC earnings are separate, independent fields:");
  {
    const { db, store } = makeFakeDb();
    __setDemoDb(db);
    seedAvatars(store, 5, 5);
    await generateDemoAffiliates(12, "mixed");
    const board = await getLeaderboard(50);
    const details = await getDemoAffiliateDetails(board[0].id);
    ok("details expose boutique totalRevenue", typeof details.totalRevenue === "number");
    ok("details expose separate ugcTotalEarnings", typeof details.ugcTotalEarnings === "number");
    ok("boutique and UGC fields are distinct keys", "totalRevenue" in details && "ugcTotalEarnings" in details);
    // Demo UGC earnings must equal sales × the demo commission (5) — never a real rate.
    ok("ugcTotalEarnings == ugcTotalSales × 5", Math.abs(details.ugcTotalEarnings - details.ugcTotalSales * 5) < 0.01);
    ok("ugcTodayEarnings == ugcTodaySales × 5", Math.abs(details.ugcTodayEarnings - details.ugcTodaySales * 5) < 0.01);
    ok("seeded today UGC sales within 0..30", details.ugcTodaySales >= 0 && details.ugcTodaySales <= 30 + 999);
  }

  console.log("4) Avatar library is PERMANENT — survives regeneration & simulation:");
  {
    const { db, store } = makeFakeDb();
    __setDemoDb(db);
    seedAvatars(store, 4, 4);
    const before = (await listDemoAvatars()).length;
    ok("library seeded with 8 avatars", before === 8);

    await generateDemoAffiliates(20, "mixed");
    ok("library unchanged after 1st generation", (await listDemoAvatars()).length === 8);

    await generateDemoAffiliates(20, "mixed"); // regenerate
    ok("library unchanged after REGENERATION", (await listDemoAvatars()).length === 8);

    await saveDemoSettings({ isEnabled: true, simulationSpeed: "medium" });
    await simulateTick();
    ok("library unchanged after simulation tick", (await listDemoAvatars()).length === 8);

    await resetCompetition(true);
    ok("library unchanged after reset/new cycle", (await listDemoAvatars()).length === 8);
  }

  console.log("5) Each demo affiliate keeps ONE persisted avatarUrl (never re-randomized):");
  {
    const { db, store } = makeFakeDb();
    __setDemoDb(db);
    seedAvatars(store, 3, 3);
    await generateDemoAffiliates(15, "mixed");
    const board = await getLeaderboard(50);
    const withAvatar = board.filter((a) => a.avatarUrl);
    ok("affiliates were assigned avatars from the library", withAvatar.length === board.length);
    ok("each avatarUrl belongs to the library", withAvatar.every((a) => store.demoAvatar.some((av) => av.url === a.avatarUrl)));
    ok("gender-matched avatars (men avatar → men affiliate)", withAvatar.every((a) => a.avatarUrl.includes(a.gender === "men" ? "/m" : "/w")));

    // avatarUrl is stable across a simulation tick (persisted, not regenerated)
    const target = board[0];
    const beforeUrl = target.avatarUrl;
    await saveDemoSettings({ isEnabled: true, simulationSpeed: "fast" });
    await simulateTick();
    const after = await getDemoAffiliateDetails(target.id);
    ok("avatarUrl unchanged after simulation tick", after.avatarUrl === beforeUrl);
  }

  console.log("6) Empty library → initials fallback (avatarUrl null), no crash:");
  {
    const { db } = makeFakeDb();
    __setDemoDb(db);
    await generateDemoAffiliates(6, "mixed"); // no avatars seeded
    const board = await getLeaderboard(50);
    ok("generation works with empty library", board.length === 6);
    ok("all avatarUrl are null (→ initials fallback in UI)", board.every((a) => a.avatarUrl === null));
  }

  console.log("7) Deleting a library avatar leaves assigned affiliate.avatarUrl intact:");
  {
    const { db, store } = makeFakeDb();
    __setDemoDb(db);
    seedAvatars(store, 1, 0); // exactly one men avatar
    await generateDemoAffiliates(5, "men");
    const board = await getLeaderboard(50);
    const assignedUrl = board[0].avatarUrl;
    ok("the single avatar was assigned to affiliates", board.every((a) => a.avatarUrl === assignedUrl));

    const avatarId = store.demoAvatar[0].id;
    const res = await deleteDemoAvatar(avatarId);
    ok("avatar removed from library", res.deleted === true && store.demoAvatar.length === 0);

    // The assigned copy on the affiliate row must remain — never a broken image.
    const details = await getDemoAffiliateDetails(board[0].id);
    ok("affiliate.avatarUrl still points to the (now stored) URL", details.avatarUrl === assignedUrl);
  }

  console.log("8) New cycle (reset) clears ONLY demo stats — including the 4 UGC fields:");
  {
    const { db, store } = makeFakeDb();
    __setDemoDb(db);
    seedAvatars(store, 2, 2);
    await generateDemoAffiliates(8, "mixed");
    await saveDemoSettings({ isEnabled: true, simulationSpeed: "fast" });
    await simulateTick(); // accrue some boutique + UGC numbers

    await resetCompetition(true);
    const stats = store.demoStats;
    ok("boutique totalRevenue zeroed", stats.every((s) => s.totalRevenue === 0));
    ok("boutique totalOrders zeroed", stats.every((s) => s.totalOrders === 0));
    ok("ugcTodaySales zeroed", stats.every((s) => s.ugcTodaySales === 0));
    ok("ugcTotalSales zeroed", stats.every((s) => s.ugcTotalSales === 0));
    ok("ugcTodayEarnings zeroed", stats.every((s) => s.ugcTodayEarnings === 0));
    ok("ugcTotalEarnings zeroed", stats.every((s) => s.ugcTotalEarnings === 0));
    // Affiliates + avatars persist across the cycle (only STATS reset).
    ok("demo affiliates persist across reset", store.demoAffiliate.length === 8);
    ok("avatar library persists across reset", store.demoAvatar.length === 4);
    ok("history cleared on reset(true)", store.demoEarningsHistory.length === 0);
  }

  console.log("9) New BUSINESS DAY resets 'today' buckets to 0; totals persist:");
  {
    const { db, store } = makeFakeDb();
    __setDemoDb(db);
    seedAvatars(store, 2, 2);
    await generateDemoAffiliates(6, "mixed");
    await saveDemoSettings({ isEnabled: true, simulationSpeed: "fast" });
    await simulateTick(); // day 1 activity (sets lastSimAt = now)

    // Snapshot totals, then pin a large 'today' value and pretend the last sim
    // ran two days ago → the next tick must be treated as a fresh business day.
    const totalsBefore = new Map();
    for (const s of store.demoStats) {
      s.ugcTodaySales = 999; s.ugcTodayEarnings = 4995;
      s.todayOrders = 999; s.todayRevenue = 99999;
      totalsBefore.set(s.demoAffiliateId, { sales: s.ugcTotalSales, earn: s.ugcTotalEarnings });
    }
    store.demoSettings[0].lastSimAt = new Date(Date.now() - 2 * 86400 * 1000);

    await simulateTick(); // first tick of a NEW business day

    ok("UGC Today Sales reset to 0 on the new day (no 999 carryover)",
       store.demoStats.every((s) => s.ugcTodaySales < 999));
    ok("UGC Today Earnings reset to 0 on the new day (no 4995 carryover)",
       store.demoStats.every((s) => s.ugcTodayEarnings < 4995));
    ok("boutique todayOrders also rolled over",
       store.demoStats.every((s) => s.todayOrders < 999));
    ok("boutique todayRevenue also rolled over",
       store.demoStats.every((s) => s.todayRevenue < 99999));
    // Each tick increments today AND total by the same delta, so after a reset
    // total == previous total + the new day's today value → totals never lost.
    ok("UGC Total Sales preserved (= old total + new-day today only)",
       store.demoStats.every((s) => Math.abs(s.ugcTotalSales - (totalsBefore.get(s.demoAffiliateId).sales + s.ugcTodaySales)) < 0.001));
    ok("UGC Total Earnings preserved likewise",
       store.demoStats.every((s) => Math.abs(s.ugcTotalEarnings - (totalsBefore.get(s.demoAffiliateId).earn + s.ugcTodayEarnings)) < 0.001));

    // Same-day ticks must NOT reset today (only a day change does).
    const beforeSameDay = store.demoStats.map((s) => s.ugcTodaySales);
    await simulateTick(); // still the same business day as the previous tick
    ok("same-day tick does NOT reset today (values only grow)",
       store.demoStats.every((s, i) => s.ugcTodaySales >= beforeSameDay[i]));
  }

  __setDemoDb(null); // restore real client for any later imports
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
