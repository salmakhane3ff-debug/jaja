/**
 * GET /api/affiliate/deposits/[id]/proof
 * Streams the affiliate's OWN transfer proof (never another affiliate's). The
 * affiliateId is taken from the session and matched against the request owner.
 */
import { withAffiliateAuth } from '@/lib/middleware/withAffiliateAuth';
import { getDepositProofForAffiliate } from '@/lib/services/depositService';

export const dynamic = 'force-dynamic';

export const GET = withAffiliateAuth(async (_req, ctx, decoded) => {
  try {
    const { id } = await ctx.params;
    const file = await getDepositProofForAffiliate(decoded.affiliateId, id);
    if (!file) return new Response('Not found', { status: 404 });
    return new Response(file.buffer, {
      status: 200,
      headers: {
        'Content-Type':        file.contentType,
        'Content-Length':      String(file.buffer.length),
        'Cache-Control':       'no-store, private',
        'Content-Disposition': 'inline',
      },
    });
  } catch (err) {
    console.error('affiliate/deposits proof error:', err);
    return new Response('Server error', { status: 500 });
  }
});
