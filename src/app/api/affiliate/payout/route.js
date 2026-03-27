/**
 * GET  /api/affiliate/payout  → affiliate's payout list
 * POST /api/affiliate/payout  → request a withdrawal
 */

import { withAffiliateAuth }               from '@/lib/middleware/withAffiliateAuth';
import {
  getAffiliatePayouts,
  requestPayout,
  getAffiliateBalance,
} from '@/lib/services/affiliateSystemService';

async function getHandler(req, _ctx, decoded) {
  try {
    const [payouts, balance] = await Promise.all([
      getAffiliatePayouts(decoded.affiliateId),
      getAffiliateBalance(decoded.affiliateId),
    ]);
    return Response.json({ payouts, balance });
  } catch (err) {
    console.error('Affiliate payout GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

async function postHandler(req, _ctx, decoded) {
  try {
    const { amount } = await req.json();

    if (!amount || isNaN(parseFloat(amount))) {
      return Response.json({ error: 'Montant invalide' }, { status: 400 });
    }

    const payout = await requestPayout(decoded.affiliateId, parseFloat(amount));
    return Response.json(payout, { status: 201 });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_BALANCE' || err.code === 'INVALID_AMOUNT') {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error('Affiliate payout POST error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export const GET  = withAffiliateAuth(getHandler);
export const POST = withAffiliateAuth(postHandler);
