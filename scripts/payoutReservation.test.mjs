#!/usr/bin/env node
/**
 * scripts/payoutReservation.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * PENDING PAYOUTS RESERVE THE EARNINGS. Available-for-withdrawal is
 *
 *   earnings − paid payouts − pending payouts − processing payouts
 *
 * so stacked requests can never exceed the balance. Rejected/cancelled payouts
 * RELEASE the reservation; paid ones stay deducted forever. Top-up ("Dépôt de
 * solde") funds are excluded from withdrawals entirely.
 *
 * Proves the required scenarios:
 *   • 2,000 earnings cannot create two pending withdrawals of 2,000 each
 *   • a pending 1,500 leaves only 500 available
 *   • a rejected payout releases the reserved amount
 *   • a paid payout stays permanently deducted
 *   • top-up balance is never withdrawable
 *   • concurrent duplicate requests cannot overspend (recalc inside a
 *     Serializable transaction)
 * Run: node scripts/payoutReservation.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  requestPayout, getWithdrawableBalance, getPendingPayoutTotal,
  getAffiliateBalanceBreakdown, getAffiliateBalance, PAYOUT_RELEASING_STATUSES,
} from '../src/lib/services/affiliateSystemService.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };
const codeOf = async (fn) => { try { await fn(); return null; } catch (e) { return e.code || e.message; } };

/**
 * `$transaction` models SERIALIZABLE isolation the way Postgres guarantees it:
 * the transactions are equivalent to running one strictly after another. It is
 * therefore a real test of the implementation — if the balance were read
 * OUTSIDE the transaction, the second caller would still observe the stale
 * value and overspend even under serial execution.
 */
function makeLedger({ commissions = 0, approvedTopups = 0 } = {}) {
  const state = { payouts: [], lastTxOpts: null, txCount: 0 };
  let queue = Promise.resolve(); // serialises overlapping transactions
  const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const matches = (row, where = {}) => Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && Array.isArray(v.in))    return v.in.includes(row[k]);
    if (v && typeof v === 'object' && Array.isArray(v.notIn)) return !v.notIn.includes(row[k]);
    return row[k] === v;
  });
  const db = {
    _state: state,
    affiliateOrder: { aggregate: async () => ({ _sum: { commissionAmount: commissions } }) },
    affiliate: {
      findUnique: async (q) => (q?.select?.bonusBalance !== undefined
        ? { bonusBalance: 0 }
        : { bankName: 'CIH', accountName: 'A B', rib: '1234567890123' }),
    },
    ugcEarning: { aggregate: async () => ({ _sum: { amount: null } }) },
    affiliateSecurityDeposit: {
      aggregate: async ({ where }) => ({ _sum: { amount: where?.status === 'APPROVED' ? approvedTopups : 0 } }),
      findMany:  async ({ where }) => (where?.status === 'APPROVED' ? [{ amount: approvedTopups }] : []),
    },
    affiliateBoosterPurchase: { aggregate: async () => ({ _sum: { price: null } }), findMany: async () => [] },
    affiliatePayout: {
      aggregate: async ({ where }) => ({ _sum: { amount: sum(state.payouts.filter((p) => matches(p, where)), 'amount') } }),
      create: async ({ data }) => { const r = { id: `po_${state.payouts.length + 1}`, ...data }; state.payouts.push(r); return { ...r }; },
    },
    identityVerification: { findUnique: async () => ({ status: 'APPROVED' }) },
    $transaction: (cb, opts) => {
      state.txCount++; state.lastTxOpts = opts;
      const run = queue.then(() => cb(db));
      queue = run.catch(() => {}); // a failed tx must not break the chain
      return run;
    },
  };
  return db;
}

async function main() {
  console.log('1) 2,000 earnings cannot create TWO pending withdrawals of 2,000:');
  {
    const db = makeLedger({ commissions: 2000 });
    ok('first 2000 request accepted', (await requestPayout('a', 2000, db))?.amount === 2000);
    ok('second 2000 request → INSUFFICIENT_BALANCE', (await codeOf(() => requestPayout('a', 2000, db))) === 'INSUFFICIENT_BALANCE');
    ok('only ONE payout row exists', db._state.payouts.length === 1);
    ok('total reserved never exceeds the earnings', db._state.payouts.reduce((a, p) => a + p.amount, 0) === 2000);
    ok('even 0.01 more is refused', (await codeOf(() => requestPayout('a', 0.01, db))) === 'INSUFFICIENT_BALANCE');
  }

  console.log('2) A pending 1,500 request leaves only 500 available:');
  {
    const db = makeLedger({ commissions: 2000 });
    await requestPayout('a', 1500, db);
    ok('withdrawable drops to 500', (await getWithdrawableBalance('a', db)) === 500);
    ok('pending total reported as 1500', (await getPendingPayoutTotal('a', db)) === 1500);
    ok('a 600 request is refused', (await codeOf(() => requestPayout('a', 600, db))) === 'INSUFFICIENT_BALANCE');
    ok('a 500 request is accepted', (await requestPayout('a', 500, db))?.amount === 500);
    ok('withdrawable now 0', (await getWithdrawableBalance('a', db)) === 0);
    ok('pending total now 2000', (await getPendingPayoutTotal('a', db)) === 2000);
  }

  console.log('3) A REJECTED (or cancelled) payout RELEASES the reservation:');
  {
    const db = makeLedger({ commissions: 2000 });
    await requestPayout('a', 2000, db);
    ok('reserved → withdrawable 0', (await getWithdrawableBalance('a', db)) === 0);

    db._state.payouts[0].status = 'rejected';
    ok('after rejection → withdrawable back to 2000', (await getWithdrawableBalance('a', db)) === 2000);
    ok('rejected amount is no longer "pending"', (await getPendingPayoutTotal('a', db)) === 0);
    ok('a fresh 2000 request is accepted again', (await requestPayout('a', 2000, db))?.amount === 2000);

    // 'cancelled' releases identically.
    const db2 = makeLedger({ commissions: 1000 });
    await requestPayout('a', 1000, db2);
    db2._state.payouts[0].status = 'cancelled';
    ok('cancelled also releases the funds', (await getWithdrawableBalance('a', db2)) === 1000);
    ok('every releasing status is recognised', PAYOUT_RELEASING_STATUSES.includes('rejected') && PAYOUT_RELEASING_STATUSES.includes('cancelled'));
  }

  console.log('4) A PAID payout stays permanently deducted:');
  {
    const db = makeLedger({ commissions: 2000 });
    await requestPayout('a', 800, db);
    db._state.payouts[0].status = 'paid';
    ok('withdrawable = 1200 after payment', (await getWithdrawableBalance('a', db)) === 1200);
    ok('paid amount is NOT counted as pending', (await getPendingPayoutTotal('a', db)) === 0);
    ok('wallet total also reflects it', (await getAffiliateBalance('a', db)) === 1200);
    ok('cannot withdraw the paid amount again', (await codeOf(() => requestPayout('a', 1300, db))) === 'INSUFFICIENT_BALANCE');
    ok('the remaining 1200 is still withdrawable', (await requestPayout('a', 1200, db))?.amount === 1200);
  }

  console.log('5) Top-up balance is NEVER withdrawable (unchanged by reservations):');
  {
    const db = makeLedger({ commissions: 500, approvedTopups: 5000 });
    const b = await getAffiliateBalanceBreakdown('a', db);
    ok('total = 5500, withdrawable = 500', b.total === 5500 && b.withdrawable === 500);
    ok('topupAvailable = 5000', b.topupAvailable === 5000);
    ok('payout of 5500 (total) refused', (await codeOf(() => requestPayout('a', 5500, db))) === 'INSUFFICIENT_BALANCE');
    ok('payout of 600 (> earnings) refused', (await codeOf(() => requestPayout('a', 600, db))) === 'INSUFFICIENT_BALANCE');
    ok('payout of 500 (earnings) accepted', (await requestPayout('a', 500, db))?.amount === 500);
    ok('top-up still intact and still not withdrawable', (await getAffiliateBalanceBreakdown('a', db)).topupAvailable === 5000);
    ok('nothing left to withdraw', (await codeOf(() => requestPayout('a', 1, db))) === 'INSUFFICIENT_BALANCE');
  }

  console.log('6) Concurrency: the check is recomputed INSIDE a Serializable tx:');
  {
    const db = makeLedger({ commissions: 1000 });
    await requestPayout('a', 600, db);
    ok('payout runs at isolationLevel Serializable', db._state.lastTxOpts?.isolationLevel === 'Serializable');

    // Two requests fired without awaiting in between: the reservation written by
    // the first is visible to the second, so their sum can never exceed 1000.
    const results = await Promise.allSettled([
      requestPayout('a', 400, db),
      requestPayout('a', 400, db),
    ]);
    const accepted = results.filter((r) => r.status === 'fulfilled').length;
    const reserved = db._state.payouts.reduce((a, p) => a + p.amount, 0);
    ok('at most one of the two concurrent requests is accepted', accepted <= 1);
    ok('total reserved never exceeds the 1000 earnings', reserved <= 1000);
    ok('withdrawable never goes negative', (await getWithdrawableBalance('a', db)) >= 0);
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
