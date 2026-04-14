/**
 * POST /api/affiliate/record-order
 * Public — called fire-and-forget from checkout pages after order creation.
 * Body: { username?, affiliateId?, orderId, clientName, clientPhone, productTitle, total }
 *
 * Accepts EITHER username OR affiliateId (or both — affiliateId takes priority).
 */

import { recordAffiliateOrder } from '@/lib/services/affiliateSystemService';
import { rateLimit } from '@/lib/rateLimit';

/** Extract real IP from Next.js request headers */
function getIp(req) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return null;
}

export async function POST(req) {
  const limited = rateLimit(req, 'affiliate-record', { max: 20, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { username, affiliateId, orderId, clientName, clientPhone, productTitle, total } = body;

    // Need at least one identifier and a total
    if ((!username?.trim() && !affiliateId?.trim()) || total == null) {
      return Response.json({ error: 'username ou affiliateId requis, ainsi que total' }, { status: 400 });
    }

    // Validate total: must be a finite, non-negative number
    const parsedTotal = parseFloat(total);
    if (!isFinite(parsedTotal) || isNaN(parsedTotal) || parsedTotal < 0) {
      return Response.json({ error: 'total must be a finite non-negative number' }, { status: 400 });
    }

    const ipAddress = getIp(req);

    const result = await recordAffiliateOrder({
      username:     username     || null,
      affiliateId:  affiliateId  || null,
      orderId:      orderId      || null,
      clientName:   clientName   || '',
      clientPhone:  clientPhone  || null,
      productTitle: productTitle || '',
      total:        parsedTotal,
      ipAddress,
    });

    if (!result) {
      return Response.json({ error: 'Affilié introuvable' }, { status: 404 });
    }

    console.log('[Affiliate] Order recorded | affiliateId:', result.affiliateId, '| orderId:', orderId, '| total:', parsedTotal);

    return Response.json(result, { status: 201 });
  } catch (err) {
    console.error('Affiliate record-order error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
