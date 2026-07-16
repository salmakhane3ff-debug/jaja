#!/usr/bin/env node
/**
 * scripts/abandonedRace.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Concurrency tests for the race-safe recovery-draft generation used by the
 * Admin PUT route (src/app/api/abandoned-carts/route.js). Exercises the REAL
 * `claimRecoveryDraft` orchestration against an in-memory model of Prisma's
 * transaction semantics:
 *   • run(work): commits every write on success, DISCARDS them all on throw.
 *   • claim(): atomic compare-and-set on cart.orderId (set only if still null).
 * Proves that any number of concurrent generations create exactly ONE draft and
 * all return the SAME orderId. No live DB.
 *
 * Run:  node scripts/abandonedRace.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { claimRecoveryDraft } from "../src/lib/abandonedRecovery.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

// Faithful in-memory Prisma-like store: one abandoned cart + an orders table.
function makeStore(orderId = null) {
  const store = { cart: { id: "cart-1", orderId }, orders: [], counter: 0 };
  const ops = {
    // Transaction: writes buffered on `tx`, flushed on commit, dropped on abort.
    run: async (work) => {
      const tx = { draft: null };
      const result = await work(tx);   // throws → we never reach the flush below
      if (tx.draft) store.orders.push(tx.draft);
      return result;
    },
    // Insert a draft (buffered). The await forces concurrent callers to interleave.
    createDraft: async (tx) => {
      const id = `ord_${++store.counter}`;
      await Promise.resolve();
      tx.draft = { id };
      return id;
    },
    // Compare-and-set: claim the cart only if still unclaimed (atomic, no await).
    claim: async (_tx, oid) => {
      if (store.cart.orderId === null) { store.cart.orderId = oid; return true; }
      return false;
    },
    readExisting: async () => store.cart.orderId,
  };
  return { store, ops };
}

const run = (ops) => claimRecoveryDraft(ops);

console.log("single generation:");
{
  const { store, ops } = makeStore();
  const id = await run(ops);
  ok("1. creates one draft, claims the cart, returns its id",
     store.orders.length === 1 && store.cart.orderId === id && store.orders[0].id === id);
}

console.log("two concurrent generations:");
{
  const { store, ops } = makeStore();
  const [a, b] = await Promise.all([run(ops), run(ops)]);
  ok("2. both return the SAME orderId (loser reuses winner)", a === b);
  ok("3. exactly ONE draft persisted (loser rolled back)", store.orders.length === 1);
  ok("4. cart.orderId equals the surviving draft", store.cart.orderId === a && store.orders[0].id === a);
}

console.log("concurrent storm (20 callers):");
{
  const { store, ops } = makeStore();
  const results = await Promise.all(Array.from({ length: 20 }, () => run(ops)));
  const unique = new Set(results);
  ok("5. all 20 return the same single orderId", unique.size === 1);
  ok("6. exactly ONE draft ever persisted", store.orders.length === 1);
  ok("7. surviving orderId is the one everyone got", store.cart.orderId === results[0]);
}

console.log("cart already has an orderId:");
{
  const { store, ops } = makeStore("existing-order");
  const id = await run(ops);
  ok("8. returns the existing orderId, creates NO new draft",
     id === "existing-order" && store.orders.length === 0 && store.cart.orderId === "existing-order");
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
