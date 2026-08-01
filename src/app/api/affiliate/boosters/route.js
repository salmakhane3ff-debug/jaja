/**
 * GET  /api/affiliate/boosters → packages + own purchases + current balance
 * POST /api/affiliate/boosters → purchase { packageId, method: 'BALANCE'|'CARD' }
 * Both affiliate-authenticated. Balance payments are atomic (Serializable tx in
 * the service): re-check balance → deduct (derived) → activate in one write.
 */
import { withAffiliateAuth } from '@/lib/middleware/withAffiliateAuth';
import { getAffiliateBalance } from '@/lib/services/affiliateSystemService';
import {
  getBoosterConfig, publicBoosterPackages, listBoosterPurchases, purchaseBooster,
} from '@/lib/services/boosterService';

async function getHandler(req, _ctx, decoded) {
  try {
    const [config, purchases, balance] = await Promise.all([
      getBoosterConfig(),
      listBoosterPurchases(decoded.affiliateId),
      getAffiliateBalance(decoded.affiliateId),
    ]);
    return Response.json({
      enabled: config.enabled,
      allowStacking: config.allowStacking,
      packages: publicBoosterPackages(config),
      purchases,
      balance,
    });
  } catch (err) {
    console.error('affiliate/boosters GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

async function postHandler(req, _ctx, decoded) {
  try {
    const body = await req.json().catch(() => ({}));
    const purchase = await purchaseBooster({
      affiliateId: decoded.affiliateId,
      packageId: String(body?.packageId || ''),
      method: body?.method === 'CARD' ? 'CARD' : 'BALANCE',
    });
    return Response.json(purchase, { status: 201 });
  } catch (err) {
    const known = ['INVALID_METHOD', 'BOOSTERS_DISABLED', 'PACKAGE_NOT_FOUND', 'ALREADY_OWNED', 'INSUFFICIENT_BALANCE'];
    if (known.includes(err.code)) {
      return Response.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error('affiliate/boosters POST error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export const GET  = withAffiliateAuth(getHandler);
export const POST = withAffiliateAuth(postHandler);
