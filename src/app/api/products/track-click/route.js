/**
 * POST /api/products/track-click
 * ─────────────────────────────────────────────────────────────────────────────
 * Records a PRODUCT PAGE VIEW in ProductAnalytics.views.
 *
 * Deduplication is handled client-side (localStorage key `pc_<productId>`,
 * 24-hour TTL), keeping this endpoint stateless and fast.
 *
 * The legacy `clicks` field is no longer incremented; `views` is the canonical
 * page-view counter going forward.  Backward-compatible: old clients that still
 * call this endpoint continue to work — they just populate `views`.
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

    // Single atomic upsert — no race conditions, one DB round-trip
    await prisma.productAnalytics.upsert({
      where:  { productId },
      create: { productId, views: 1 },
      update: { views: { increment: 1 } },
    });

    return Response.json({ ok: true });
  } catch (err) {
    // Never crash the storefront — tracking is non-critical
    console.error('[track-view]', err?.message ?? err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
