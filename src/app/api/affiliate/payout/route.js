/**
 * GET  /api/affiliate/payout  → affiliate's payout list
 * POST /api/affiliate/payout  → request a withdrawal
 */

import { withAffiliateAuth }               from '@/lib/middleware/withAffiliateAuth';
import { requireFinancialAmount }          from '@/lib/utils/validate';
import {
  getAffiliatePayouts,
  requestPayout,
  getAffiliateBalanceBreakdown,
} from '@/lib/services/affiliateSystemService';

async function getHandler(req, _ctx, decoded) {
  try {
    const [payouts, breakdown] = await Promise.all([
      getAffiliatePayouts(decoded.affiliateId),
      getAffiliateBalanceBreakdown(decoded.affiliateId),
    ]);
    // `balance` stays the ONE wallet total (unchanged shape); `withdrawable` is
    // the earnings-only ceiling a payout is validated against server-side.
    return Response.json({
      payouts,
      balance: breakdown.total,
      withdrawable: breakdown.withdrawable,
      topupAvailable: breakdown.topupAvailable,
      pendingPayouts: breakdown.pendingPayouts,
    });
  } catch (err) {
    console.error('Affiliate payout GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

async function postHandler(req, _ctx, decoded) {
  try {
    const body = await req.json();

    let amount;
    try {
      amount = requireFinancialAmount(body?.amount, 'amount', { min: 0.01, max: 1_000_000 });
    } catch {
      return Response.json({ error: 'Montant invalide' }, { status: 400 });
    }

    const payout = await requestPayout(decoded.affiliateId, amount);
    return Response.json(payout, { status: 201 });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_BALANCE' || err.code === 'INVALID_AMOUNT'
        || err.code === 'INCOMPLETE_BANK_INFO' || err.code === 'IDENTITY_NOT_VERIFIED') {
      return Response.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error('Affiliate payout POST error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export const GET  = withAffiliateAuth(getHandler);
export const POST = withAffiliateAuth(postHandler);
