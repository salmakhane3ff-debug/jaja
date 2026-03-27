/**
 * POST /api/affiliate/track-click
 * ─────────────────────────────────────────────────────────────────────────────
 * Called fire-and-forget on every page load when affiliateRef is in storage.
 * Body: { affiliateId, page: current URL }
 *
 * Creates an AffiliateClick row and increments affiliate.totalClicks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { recordClick } from '@/lib/services/affiliateService';

export async function POST(req) {
  try {
    const body = await req.json();
    const { affiliateId, page } = body;

    if (!affiliateId?.trim()) {
      return Response.json({ error: 'affiliateId requis' }, { status: 400 });
    }

    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || null;
    const userAgent = req.headers.get('user-agent') || null;
    const referer   = req.headers.get('referer')    || null;

    await recordClick({
      affiliateId: affiliateId.trim(),
      ipAddress,
      userAgent,
      referer,
      landingPage: page || null,
    });

    console.log('[Affiliate] Click tracked | affiliateId:', affiliateId, '| page:', page);

    return Response.json({ ok: true });
  } catch (err) {
    // Don't expose errors — this is fire-and-forget
    console.error('Affiliate track-click error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
