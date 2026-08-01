#!/usr/bin/env node
/**
 * scripts/booster.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Starter Booster purchases — pays with the EXISTING derived balance, no
 * separate wallet. Proves, without a DB (injected fake):
 *   • package config normalization (admin-managed, never hardcoded)
 *   • BALANCE purchase: atomic re-check at confirmation (Serializable tx),
 *     insufficient balance rejected, price snapshotted server-side
 *   • duplicate protection (no two PENDING/ACTIVE of the same pack) unless
 *     allowStacking is explicitly enabled
 *   • CARD purchase: PENDING, no balance touch, admin review idempotent
 *   • balance provider: −Σ ACTIVE BALANCE purchases only (CARD/PENDING/REJECTED
 *     never deduct)
 * Run: node scripts/booster.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  normalizeBoosterConfig, publicBoosterPackages, purchaseBooster,
  reviewBoosterPurchase, listBoosterPurchases, BOOSTER_STATUS,
} from "../src/lib/services/boosterService.js";
import { getBoosterDeductionComponent } from "../src/lib/services/affiliateSystemService.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

// ── In-memory fake db (only the models the service touches) ───────────────────
function makeFakeDb(configRaw, approvedTopups = 0) {
  let seq = 1;
  const purchases = [];
  const matches = (row, where = {}) => Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && Array.isArray(v.in)) return v.in.includes(row[k]);
    return row[k] === v;
  });
  const db = {
    _purchases: purchases,
    txOptions: null,
    setting: {
      findUnique: async ({ where }) => (where.id === "booster-packages" && configRaw ? { id: where.id, data: configRaw } : null),
    },
    // Read by the real getTopupAvailable (top-up-first deduction order).
    affiliateSecurityDeposit: {
      aggregate: async ({ where }) => ({ _sum: { amount: where?.status === "APPROVED" ? approvedTopups : 0 } }),
      findMany:  async ({ where }) => (where?.status === "APPROVED" ? [{ amount: approvedTopups }] : []),
    },
    affiliateBoosterPurchase: {
      create: async ({ data }) => { const r = { id: `bp_${seq++}`, createdAt: new Date(), activatedAt: null, ...data }; purchases.push(r); return { ...r }; },
      findFirst: async ({ where }) => { const r = purchases.find((x) => matches(x, where)); return r ? { ...r } : null; },
      findUnique: async ({ where }) => { const r = purchases.find((x) => x.id === where.id); return r ? { ...r } : null; },
      findMany: async ({ where, orderBy, take, include } = {}) => {
        let rows = purchases.filter((x) => matches(x, where || {}));
        if (orderBy?.createdAt === "desc") rows = [...rows].sort((a, b) => b.createdAt - a.createdAt);
        if (take) rows = rows.slice(0, take);
        return rows.map((r) => ({ ...r }));
      },
      updateMany: async ({ where, data }) => {
        const hit = purchases.filter((x) => matches(x, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      aggregate: async ({ where, _sum }) => {
        const rows = purchases.filter((x) => matches(x, where || {}));
        const out = {};
        for (const k of Object.keys(_sum || {})) out[k] = rows.reduce((a, r) => a + (Number(r[k]) || 0), 0) || null;
        return { _sum: out };
      },
    },
    $transaction: async (cb, opts) => { db.txOptions = opts; return cb(db); },
  };
  return db;
}

const CFG = {
  enabled: true,
  allowStacking: false,
  packages: [
    { id: "gold",   name: "Starter Booster Gold",   price: 2000, emoji: "🥇", active: true },
    { id: "silver", name: "Starter Booster Silver", price: 3500, emoji: "🥈", active: true },
    { id: "old",    name: "Retired pack",           price: 900,  active: false },
  ],
};
const bal = (v) => async () => v; // getBalance stub

async function main() {
  console.log("1) Package config normalization (admin-managed, never hardcoded):");
  {
    const d = normalizeBoosterConfig(null);
    ok("ships disabled with empty catalogue", d.enabled === false && d.allowStacking === false && d.packages.length === 0);
    ok("enabled requires strict true", normalizeBoosterConfig({ enabled: "yes" }).enabled === false);
    const n = normalizeBoosterConfig({ enabled: true, packages: [
      { id: "a", name: "Pack A", price: "150.5" },
      { id: "a", name: "Dup id", price: 100 },          // duplicate id → dropped
      { name: "", price: 500 },                          // no name → dropped
      { id: "b", name: "Free", price: 0 },               // zero price → dropped
      { id: "c", name: "Neg", price: -50 },              // negative → clamped 0 → dropped
      { id: "d", name: "Pack D", price: 300, active: false },
    ] });
    ok("price coerced, invalid/duplicate/zero-price packs dropped", n.packages.length === 2 && n.packages[0].price === 150.5);
    ok("emoji defaults to 🚀, active defaults true", n.packages[0].emoji === "🚀" && n.packages[0].active === true);
    ok("publicBoosterPackages hides inactive packs", publicBoosterPackages(n).length === 1 && publicBoosterPackages(n)[0].id === "a");
    ok("inactive pack invisible in the CFG fixture too", publicBoosterPackages(normalizeBoosterConfig(CFG)).every((p) => p.id !== "old"));
  }

  console.log("2) BALANCE purchase — atomic re-check, price snapshot, activation:");
  {
    const db = makeFakeDb(CFG);
    const p = await purchaseBooster({ affiliateId: "aff1", packageId: "gold", method: "BALANCE" }, { db, getBalance: bal(3250) });
    ok("sufficient balance → row created ACTIVE", p.status === BOOSTER_STATUS.ACTIVE);
    ok("payment method recorded as BALANCE", p.paymentMethod === "BALANCE");
    ok("activatedAt set immediately (no manual validation)", p.activatedAt instanceof Date);
    ok("price is the SERVER config price (client can never set it)", p.price === 2000 && p.packageName === "Starter Booster Gold");
    ok("runs in a Serializable transaction", db.txOptions?.isolationLevel === "Serializable");

    let err1 = null;
    try { await purchaseBooster({ affiliateId: "aff2", packageId: "gold", method: "BALANCE" }, { db, getBalance: bal(850) }); }
    catch (e) { err1 = e; }
    ok("insufficient balance at confirmation → INSUFFICIENT_BALANCE", err1?.code === "INSUFFICIENT_BALANCE");
    ok("rejected purchase writes NO row (cannot be charged)", db._purchases.filter((x) => x.affiliateId === "aff2").length === 0);

    let err2 = null;
    try { await purchaseBooster({ affiliateId: "aff3", packageId: "gold", method: "BALANCE" }, { db, getBalance: bal(1999.99) }); }
    catch (e) { err2 = e; }
    ok("boundary: price 2000 vs balance 1999.99 → rejected", err2?.code === "INSUFFICIENT_BALANCE");
    const exact = await purchaseBooster({ affiliateId: "aff3", packageId: "gold", method: "BALANCE" }, { db, getBalance: bal(2000) });
    ok("boundary: exact balance == price → accepted", exact.status === "ACTIVE");
  }

  console.log("3) Guards — disabled module, unknown/inactive pack, bad method:");
  {
    const offDb = makeFakeDb({ ...CFG, enabled: false });
    let e1 = null; try { await purchaseBooster({ affiliateId: "a", packageId: "gold", method: "BALANCE" }, { db: offDb, getBalance: bal(9999) }); } catch (e) { e1 = e; }
    ok("module disabled → BOOSTERS_DISABLED", e1?.code === "BOOSTERS_DISABLED");

    const db = makeFakeDb(CFG);
    let e2 = null; try { await purchaseBooster({ affiliateId: "a", packageId: "nope", method: "BALANCE" }, { db, getBalance: bal(9999) }); } catch (e) { e2 = e; }
    ok("unknown package → PACKAGE_NOT_FOUND", e2?.code === "PACKAGE_NOT_FOUND");
    let e3 = null; try { await purchaseBooster({ affiliateId: "a", packageId: "old", method: "BALANCE" }, { db, getBalance: bal(9999) }); } catch (e) { e3 = e; }
    ok("inactive package → PACKAGE_NOT_FOUND", e3?.code === "PACKAGE_NOT_FOUND");
    let e4 = null; try { await purchaseBooster({ affiliateId: "a", packageId: "gold", method: "PAYPAL" }, { db, getBalance: bal(9999) }); } catch (e) { e4 = e; }
    ok("unknown method → INVALID_METHOD", e4?.code === "INVALID_METHOD");
  }

  console.log("4) Duplicate protection & stacking:");
  {
    const db = makeFakeDb(CFG);
    await purchaseBooster({ affiliateId: "aff1", packageId: "gold", method: "BALANCE" }, { db, getBalance: bal(9999) });
    let dup = null;
    try { await purchaseBooster({ affiliateId: "aff1", packageId: "gold", method: "BALANCE" }, { db, getBalance: bal(9999) }); }
    catch (e) { dup = e; }
    ok("second identical ACTIVE pack → ALREADY_OWNED", dup?.code === "ALREADY_OWNED");
    ok("no second row was written", db._purchases.filter((x) => x.affiliateId === "aff1").length === 1);

    // PENDING (card) also blocks a re-purchase of the same pack.
    await purchaseBooster({ affiliateId: "aff1", packageId: "silver", method: "CARD" }, { db, getBalance: bal(0) });
    let dup2 = null;
    try { await purchaseBooster({ affiliateId: "aff1", packageId: "silver", method: "BALANCE" }, { db, getBalance: bal(9999) }); }
    catch (e) { dup2 = e; }
    ok("PENDING card purchase blocks the same pack too", dup2?.code === "ALREADY_OWNED");

    ok("a DIFFERENT pack is always allowed", (await listBoosterPurchases("aff1", db)).length === 2);

    // Rejected purchases do NOT block a retry.
    await reviewBoosterPurchase(db._purchases.find((x) => x.packageId === "silver").id, "reject", db);
    const retry = await purchaseBooster({ affiliateId: "aff1", packageId: "silver", method: "BALANCE" }, { db, getBalance: bal(9999) });
    ok("REJECTED purchase does not block a new attempt", retry.status === "ACTIVE");

    const stackDb = makeFakeDb({ ...CFG, allowStacking: true });
    await purchaseBooster({ affiliateId: "s1", packageId: "gold", method: "BALANCE" }, { db: stackDb, getBalance: bal(9999) });
    const second = await purchaseBooster({ affiliateId: "s1", packageId: "gold", method: "BALANCE" }, { db: stackDb, getBalance: bal(9999) });
    ok("allowStacking=true permits the same pack twice", second.status === "ACTIVE" && stackDb._purchases.length === 2);
  }

  console.log("5) CARD purchase + idempotent admin review:");
  {
    const db = makeFakeDb(CFG);
    let balanceCalls = 0;
    const spyBalance = async () => { balanceCalls++; return 0; };
    const p = await purchaseBooster({ affiliateId: "c1", packageId: "gold", method: "CARD" }, { db, getBalance: spyBalance });
    ok("card purchase starts PENDING (manual validation)", p.status === BOOSTER_STATUS.PENDING);
    ok("card purchase never reads the balance", balanceCalls === 0);
    ok("card purchase has no activatedAt yet", p.activatedAt === null);

    const approved = await reviewBoosterPurchase(p.id, "approve", db);
    ok("approve → ACTIVE with activatedAt", approved.status === "ACTIVE" && approved.activatedAt instanceof Date);
    let again = null;
    try { await reviewBoosterPurchase(p.id, "approve", db); } catch (e) { again = e; }
    ok("second approve → NOT_PENDING (idempotent, no double activation)", again?.code === "NOT_PENDING");

    const p2 = await purchaseBooster({ affiliateId: "c1", packageId: "silver", method: "CARD" }, { db, getBalance: spyBalance });
    const rejected = await reviewBoosterPurchase(p2.id, "reject", db);
    ok("reject → REJECTED", rejected.status === "REJECTED");
    let badAction = null;
    try { await reviewBoosterPurchase(p2.id, "delete", db); } catch (e) { badAction = e; }
    ok("unknown action → INVALID_ACTION", badAction?.code === "INVALID_ACTION");
  }

  console.log("6) Balance provider — only ACTIVE BALANCE purchases deduct:");
  {
    const db = makeFakeDb(CFG);
    await purchaseBooster({ affiliateId: "b1", packageId: "gold",   method: "BALANCE" }, { db, getBalance: bal(9999) }); // −2000
    await purchaseBooster({ affiliateId: "b1", packageId: "silver", method: "CARD"    }, { db, getBalance: bal(9999) }); // PENDING card → no deduction
    ok("deduction = −2000 (ACTIVE BALANCE only)", (await getBoosterDeductionComponent("b1", db)) === -2000);

    // Approving the card purchase still must NOT deduct from the balance.
    const cardRow = db._purchases.find((x) => x.paymentMethod === "CARD");
    await reviewBoosterPurchase(cardRow.id, "approve", db);
    ok("ACTIVE CARD purchase still deducts nothing", (await getBoosterDeductionComponent("b1", db)) === -2000);

    ok("another affiliate is unaffected", (await getBoosterDeductionComponent("someone-else", db)) === -0);
  }

  console.log("7) Payment split is snapshotted on the row (top-up first):");
  {
    // 3000 of approved top-up, 2000 pack → fully covered by the top-up.
    const db = makeFakeDb(CFG, 3000);
    const p = await purchaseBooster({ affiliateId: "s1", packageId: "gold", method: "BALANCE" }, { db, getBalance: bal(9999) });
    ok("fully top-up-funded pack records paidFromTopup only", p.paidFromTopup === 2000 && p.paidFromEarnings === 0);

    // Same ledger: the next 3500 pack has only 1000 top-up left → 1000 + 2500.
    const p2 = await purchaseBooster({ affiliateId: "s1", packageId: "silver", method: "BALANCE" }, { db, getBalance: bal(9999) });
    ok("second pack drains the remaining top-up then uses earnings", p2.paidFromTopup === 1000 && p2.paidFromEarnings === 2500);
    ok("splits always sum to the price", p2.paidFromTopup + p2.paidFromEarnings === p2.price);

    // No top-up at all → entirely earnings-funded.
    const db2 = makeFakeDb(CFG, 0);
    const p3 = await purchaseBooster({ affiliateId: "s2", packageId: "gold", method: "BALANCE" }, { db: db2, getBalance: bal(9999) });
    ok("no top-up → paid entirely from earnings", p3.paidFromTopup === 0 && p3.paidFromEarnings === 2000);

    // CARD purchases never attribute a split.
    const p4 = await purchaseBooster({ affiliateId: "s3", packageId: "gold", method: "CARD" }, { db: db2, getBalance: bal(0) });
    ok("card purchase records no balance split", (p4.paidFromTopup ?? 0) === 0 && (p4.paidFromEarnings ?? 0) === 0);
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
