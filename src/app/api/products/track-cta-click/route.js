/**
 * POST /api/products/track-cta-click
 * ─────────────────────────────────────────────────────────────────────────────
 * Records a REAL PURCHASE-INTENT click in ProductAnalytics.ctaClicks.
 *
 * Fired only on deliberate CTA actions:
 *   • "Buy Now"      (handleBuyNow)
 *   • "Add to Cart"  (handleAddToCart)
 *   • Checkout CTA   (offer/landing page order buttons)
 *
 * Bot / spam protection (two-layer):
 *   1. Client-side: localStorage key `cta_<productId>` with 10-second TTL
 *      prevents accidental double-fires from rapid re-clicks.
 *   2. Server-side: validates productId is a non-empty string.
 *      (Stateless — no per-IP tracking to keep the endpoint O(1).)
 *
 * Body:   { productId: string }
 * Return: { ok: true }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '@/lib/prisma';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { productId } = body;

    if (!productId || typeof productId !== 'string') {
      return Response.json({ ok: false, error: 'productId required' }, { status: 400 });
    }

    // Atomic upsert — row is auto-created on first CTA for any product
    await prisma.productAnalytics.upsert({
      where:  { productId },
      create: { productId, ctaClicks: 1 },
      update: { ctaClicks: { increment: 1 } },
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[track-cta-click]', err?.message ?? err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
