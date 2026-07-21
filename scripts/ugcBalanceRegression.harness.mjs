#!/usr/bin/env node
/**
 * scripts/ugcBalanceRegression.harness.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * DB-LEVEL regression harness for the registry-based balance refactor.
 *
 * NOT part of the zero-dependency CI suite (it is a .harness.mjs, not a .test.mjs)
 * because it REQUIRES a live database. Run it against staging (or a prod replica)
 * AFTER `prisma migrate deploy` has created the ugc_earnings table:
 *
 *     DATABASE_URL=... node scripts/ugcBalanceRegression.harness.mjs
 *
 * It proves, per real affiliate:
 *   • no-UGC affiliate  →  legacy formula  ==  new getAffiliateBalance   (EXACT)
 *   • with-UGC affiliate →  new  ==  legacy + Σ available UGC earnings    (EXACT)
 *
 * Exit 0 = all match. Exit 1 = at least one mismatch (printed). Exit 2 = no DB.
 * The legacy formula is reproduced inline here as the golden reference.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../src/lib/prisma.js';
import {
  getAffiliateBalance,
  getReferralCommissionComponent, getReferralBonusComponent, getPayoutDeductionComponent,
} from '../src/lib/services/affiliateSystemService.js';
import { getUgcBalanceComponent } from '../src/lib/services/ugcEarningsService.js';
import { composeBalance, serializeAmount } from '../src/lib/balance/composeBalance.js';

const fmt = (n) => Number(n).toFixed(2).padStart(12);

// EXACT legacy getAffiliateBalance formula (pre-refactor golden reference).
async function legacyBalance(affiliateId) {
  const [earned, paid, aff] = await Promise.all([
    prisma.affiliateOrder.aggregate({ where: { affiliateId, status: 'delivered' }, _sum: { commissionAmount: true } }),
    prisma.affiliatePayout.aggregate({ where: { affiliateId, status: 'paid' }, _sum: { amount: true } }),
    prisma.affiliate.findUnique({ where: { id: affiliateId }, select: { bonusBalance: true } }),
  ]);
  const e = earned._sum.commissionAmount ?? 0;
  const p = paid._sum.amount ?? 0;
  const b = aff?.bonusBalance ?? 0;
  return parseFloat((e + b - p).toFixed(2));
}

async function ugcSum(affiliateId) {
  const agg = await prisma.ugcEarning.aggregate({ where: { affiliateId, status: 'available' }, _sum: { amount: true } });
  return agg._sum.amount ?? 0;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('SKIP: DATABASE_URL is not set — this harness needs a live database.');
    process.exit(2);
  }

  const affiliates = await prisma.affiliate.findMany({ select: { id: true } });
  let checkedNoUgc = 0, checkedWithUgc = 0, mismatches = 0, breakdownMismatches = 0;

  console.log('BALANCE BREAKDOWN (referral + bonus + payout + ugc = final):');
  console.log(`${'affiliate'.padEnd(38)}${'referral'.padStart(12)}${'bonus'.padStart(12)}${'payout'.padStart(12)}${'ugc'.padStart(12)}${'final'.padStart(12)}  flags`);

  for (const { id } of affiliates) {
    const ugcCount = await prisma.ugcEarning.count({ where: { affiliateId: id } });

    // Breakdown via the SAME provider functions the balance uses (authoritative).
    const [referral, bonus, payoutSigned, ugcComp] = await Promise.all([
      getReferralCommissionComponent(id),
      getReferralBonusComponent(id),
      getPayoutDeductionComponent(id),   // negative (deduction)
      getUgcBalanceComponent(id),
    ]);
    const referralN = serializeAmount(referral);
    const bonusN    = serializeAmount(bonus);
    const payoutN   = serializeAmount(payoutSigned);
    const ugcN      = serializeAmount(ugcComp);

    const legacy = await legacyBalance(id);
    const now = await getAffiliateBalance(id);

    // Cross-check: the printed components must sum to the composed final balance.
    const summed = serializeAmount(composeBalance([{ amount: referralN }, { amount: bonusN }, { amount: payoutN }, { amount: ugcN }]));
    const flags = [];
    if (summed !== now) { breakdownMismatches++; flags.push('BREAKDOWN≠FINAL'); }

    if (ugcCount === 0) {
      checkedNoUgc++;
      if (legacy !== now) { mismatches++; flags.push(`LEGACY≠NEW(${legacy})`); }
    } else {
      checkedWithUgc++;
      const expected = serializeAmount(composeBalance([{ amount: legacy }, { amount: await ugcSum(id) }]));
      if (expected !== now) { mismatches++; flags.push(`LEGACY+UGC≠NEW(${expected})`); }
    }

    console.log(`${id.padEnd(38)}${fmt(referralN)}${fmt(bonusN)}${fmt(payoutN)}${fmt(ugcN)}${fmt(now)}  ${flags.join(' ')}`);
  }

  console.log(`\naffiliates=${affiliates.length} noUgcChecked=${checkedNoUgc} withUgcChecked=${checkedWithUgc} mismatches=${mismatches} breakdownMismatches=${breakdownMismatches}`);
  mismatches += breakdownMismatches;
  console.log(mismatches === 0 ? 'PASS — balance refactor preserves every affiliate value exactly.' : 'FAIL — see mismatches above.');
  await prisma.$disconnect().catch(() => {});
  process.exit(mismatches === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('harness error:', e?.message ?? e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
