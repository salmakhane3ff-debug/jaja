#!/usr/bin/env node
/**
 * scripts/walletSeparation.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * CRITICAL ACCOUNTING: one wallet UI, two server-side components.
 *
 *   earnings  = commissions + bonus + UGC − paid payouts − booster earnings-spend
 *               → spendable on boosters AND withdrawable
 *   top-up    = APPROVED "Dépôt de solde" − booster top-up-spend
 *               → spendable on boosters ONLY, NEVER withdrawable
 *
 * Boosters consume TOP-UP FIRST, then earnings, and the split is SNAPSHOTTED on
 * the purchase row so a later top-up can never retroactively convert already
 * spent earnings back into withdrawable cash.
 *
 * Proves the four required scenarios end-to-end against one in-memory ledger:
 *   • a 5,000 top-up CAN buy a 5,000 booster
 *   • that same 5,000 top-up CANNOT be withdrawn
 *   • real earnings REMAIN withdrawable
 *   • a mixed top-up + earnings purchase deducts correctly and atomically
 * Run: node scripts/walletSeparation.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  getAffiliateBalance, getWithdrawableBalance, getTopupAvailable,
  getAffiliateBalanceBreakdown, requestPayout,
} from '../src/lib/services/affiliateSystemService.js';
import { purchaseBooster } from '../src/lib/services/boosterService.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };
const codeOf = async (fn) => { try { await fn(); return null; } catch (e) { return e.code || e.message; } };

/**
 * One in-memory affiliate ledger wired to every model the balance providers +
 * booster service read. Mutating it (purchases/payouts) is what the flows do.
 */
function makeLedger({ commissions = 0, bonus = 0, ugc = 0, approvedTopups = 0, packages = [] } = {}) {
  const state = { purchases: [], payouts: [], txCount: 0, lastTxOpts: null };
  const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const matches = (row, where = {}) => Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && Array.isArray(v.in)) return v.in.includes(row[k]);
    return row[k] === v;
  });

  const db = {
    _state: state,
    setting: { findUnique: async ({ where }) => (where.id === 'booster-packages' ? { data: { enabled: true, allowStacking: true, packages } } : null) },
    affiliateOrder: { aggregate: async () => ({ _sum: { commissionAmount: commissions } }) },
    affiliate: {
      findUnique: async (q) => (q?.select?.bonusBalance !== undefined
        ? { bonusBalance: bonus }
        : { bankName: 'CIH', accountName: 'A B', rib: '1234567890123' }),
    },
    ugcEarning: { aggregate: async () => ({ _sum: { amount: ugc } }) },
    affiliateSecurityDeposit: {
      aggregate: async ({ where }) => ({ _sum: { amount: where?.status === 'APPROVED' ? approvedTopups : 0 } }),
      findMany:  async ({ where }) => (where?.status === 'APPROVED' ? [{ amount: approvedTopups }] : []),
    },
    affiliatePayout: {
      aggregate: async ({ where }) => ({ _sum: { amount: sum(state.payouts.filter((p) => matches(p, where)), 'amount') } }),
      create: async ({ data }) => { const r = { id: `po_${state.payouts.length + 1}`, ...data }; state.payouts.push(r); return { ...r }; },
    },
    affiliateBoosterPurchase: {
      findMany: async ({ where }) => state.purchases.filter((p) => matches(p, where)).map((p) => ({ ...p })),
      findFirst: async ({ where }) => { const r = state.purchases.find((p) => matches(p, where)); return r ? { ...r } : null; },
      aggregate: async ({ where }) => ({ _sum: { price: sum(state.purchases.filter((p) => matches(p, where)), 'price') } }),
      create: async ({ data }) => { const r = { id: `bp_${state.purchases.length + 1}`, createdAt: new Date(), activatedAt: null, paidFromTopup: 0, paidFromEarnings: 0, ...data }; state.purchases.push(r); return { ...r }; },
    },
    identityVerification: { findUnique: async () => ({ status: 'APPROVED' }) },
    $transaction: async (cb, opts) => { state.txCount++; state.lastTxOpts = opts; return cb(db); },
  };
  return db;
}

const GOLD  = { id: 'gold',  name: 'Starter Booster Gold',  price: 5000, active: true };
const MIXED = { id: 'mixed', name: 'Starter Booster Mixed', price: 3000, active: true };

async function main() {
  console.log('1) A 5,000 top-up CAN buy a 5,000 booster (spend-only funds are spendable):');
  {
    const db = makeLedger({ approvedTopups: 5000, packages: [GOLD] });
    ok('wallet total = 5000', (await getAffiliateBalance('a', db)) === 5000);
    ok('top-up available = 5000', (await getTopupAvailable('a', db)) === 5000);
    ok('withdrawable = 0 before any purchase', (await getWithdrawableBalance('a', db)) === 0);

    const p = await purchaseBooster({ affiliateId: 'a', packageId: 'gold', method: 'BALANCE' }, { db });
    ok('purchase activated', p.status === 'ACTIVE' && p.price === 5000);
    ok('entire price attributed to the TOP-UP component', p.paidFromTopup === 5000 && p.paidFromEarnings === 0);
    ok('wallet total drops to 0', (await getAffiliateBalance('a', db)) === 0);
    ok('top-up available drops to 0', (await getTopupAvailable('a', db)) === 0);
    ok('withdrawable is STILL 0 (never went negative)', (await getWithdrawableBalance('a', db)) === 0);
  }

  console.log('2) The same 5,000 top-up CANNOT be withdrawn:');
  {
    const db = makeLedger({ approvedTopups: 5000, packages: [GOLD] });
    ok('wallet total shows 5000', (await getAffiliateBalance('a', db)) === 5000);
    ok('withdrawable = 0', (await getWithdrawableBalance('a', db)) === 0);
    ok('payout of the full 5000 → INSUFFICIENT_BALANCE', (await codeOf(() => requestPayout('a', 5000, db))) === 'INSUFFICIENT_BALANCE');
    ok('payout of even 1 DH → INSUFFICIENT_BALANCE', (await codeOf(() => requestPayout('a', 1, db))) === 'INSUFFICIENT_BALANCE');
    ok('no payout row was created', db._state.payouts.length === 0);
  }

  console.log('3) Real earnings REMAIN withdrawable (and the two components coexist):');
  {
    const db = makeLedger({ commissions: 1200, bonus: 300, ugc: 500, approvedTopups: 5000, packages: [GOLD] });
    const b = await getAffiliateBalanceBreakdown('a', db);
    ok('total = earnings 2000 + top-up 5000 = 7000', b.total === 7000);
    ok('withdrawable = 2000 (earnings only)', b.withdrawable === 2000);
    ok('topupAvailable = 5000', b.topupAvailable === 5000);
    ok('invariant: withdrawable + topup === total', b.withdrawable + b.topupAvailable === b.total);

    ok('payout of 2000 (all earnings) is ACCEPTED', (await requestPayout('a', 2000, db))?.amount === 2000);
    // NOTE: a payout only deducts once an admin marks it `paid` — pre-existing
    // payout_deduction semantics, unchanged by this fix.
    db._state.payouts.forEach((p) => { p.status = 'paid'; });
    ok('once paid, withdrawable drops to 0', (await getWithdrawableBalance('a', db)) === 0);
    ok('a further payout of 1 DH → INSUFFICIENT_BALANCE', (await codeOf(() => requestPayout('a', 1, db))) === 'INSUFFICIENT_BALANCE');
    ok('the 5000 top-up is untouched by the payout', (await getTopupAvailable('a', db)) === 5000);
    ok('…and still cannot be withdrawn', (await codeOf(() => requestPayout('a', 5000, db))) === 'INSUFFICIENT_BALANCE');
  }

  console.log('4) MIXED payment — top-up first, remainder from earnings, atomically:');
  {
    // top-up 1000 + earnings 4000; a 3000 pack must take 1000 top-up + 2000 earnings.
    const db = makeLedger({ commissions: 4000, approvedTopups: 1000, packages: [MIXED] });
    const before = await getAffiliateBalanceBreakdown('a', db);
    ok('before: total 5000 / withdrawable 4000 / topup 1000',
      before.total === 5000 && before.withdrawable === 4000 && before.topupAvailable === 1000);

    const p = await purchaseBooster({ affiliateId: 'a', packageId: 'mixed', method: 'BALANCE' }, { db });
    ok('top-up consumed FIRST (1000)', p.paidFromTopup === 1000);
    ok('remainder taken from earnings (2000)', p.paidFromEarnings === 2000);
    ok('split sums exactly to the price', p.paidFromTopup + p.paidFromEarnings === p.price);

    const after = await getAffiliateBalanceBreakdown('a', db);
    ok('after: total 2000', after.total === 2000);
    ok('after: topup exhausted (0)', after.topupAvailable === 0);
    ok('after: withdrawable = 2000 (4000 − 2000 earnings spend)', after.withdrawable === 2000);
    ok('invariant still holds', after.withdrawable + after.topupAvailable === after.total);

    ok('atomic: purchase ran in a Serializable transaction', db._state.lastTxOpts?.isolationLevel === 'Serializable');
    ok('exactly one row written', db._state.purchases.length === 1);

    // Withdrawal is now capped at the REMAINING earnings, not the wallet total.
    ok('payout of 2000 accepted (remaining earnings)', (await requestPayout('a', 2000, db))?.amount === 2000);
    db._state.payouts.forEach((p) => { p.status = 'paid'; });
    ok('after payment, withdrawable = 0', (await getWithdrawableBalance('a', db)) === 0);
    ok('payout beyond that → INSUFFICIENT_BALANCE', (await codeOf(() => requestPayout('a', 0.01, db))) === 'INSUFFICIENT_BALANCE');
  }

  console.log('5) Attribution is SNAPSHOTTED — a later top-up cannot free spent earnings:');
  {
    // Earnings-only purchase first, then a top-up arrives.
    const db = makeLedger({ commissions: 3000, approvedTopups: 0, packages: [MIXED] });
    const p = await purchaseBooster({ affiliateId: 'a', packageId: 'mixed', method: 'BALANCE' }, { db });
    ok('paid entirely from earnings (no top-up existed)', p.paidFromTopup === 0 && p.paidFromEarnings === 3000);
    ok('withdrawable = 0 after spending all earnings', (await getWithdrawableBalance('a', db)) === 0);

    // A 3000 top-up arrives AFTER the purchase.
    const db2 = makeLedger({ commissions: 3000, approvedTopups: 3000, packages: [MIXED] });
    db2._state.purchases.push({ ...p, id: 'bp_1' }); // same historical purchase
    const b = await getAffiliateBalanceBreakdown('a', db2);
    ok('new top-up does NOT retroactively restore withdrawable earnings', b.withdrawable === 0);
    ok('the top-up itself stays spend-only (3000)', b.topupAvailable === 3000);
    ok('total = 3000', b.total === 3000);
    ok('payout still refused', (await codeOf(() => requestPayout('a', 100, db2))) === 'INSUFFICIENT_BALANCE');
  }

  console.log('6) Legacy rows (pre-split, both fields 0) count as EARNINGS-paid:');
  {
    const db = makeLedger({ commissions: 5000, approvedTopups: 2000, packages: [MIXED] });
    // Simulate a row written before the split columns existed.
    db._state.purchases.push({
      id: 'legacy', affiliateId: 'a', packageId: 'old', packageName: 'Legacy', price: 1000,
      paymentMethod: 'BALANCE', status: 'ACTIVE', paidFromTopup: 0, paidFromEarnings: 0, createdAt: new Date(),
    });
    const b = await getAffiliateBalanceBreakdown('a', db);
    ok('legacy spend reduces EARNINGS, not top-up', b.withdrawable === 4000 && b.topupAvailable === 2000);
    ok('total accounts for it once (6000)', b.total === 6000);
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
