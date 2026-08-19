/**
 * GET /api/feedback/stats            → { avg, count } across every publishable review
 * GET /api/feedback/stats?productId= → { avg, count } for that product only
 * ─────────────────────────────────────────────────────────────────────────────
 * The rating summary under a product title needs exactly two numbers. Serving
 * them from a single COUNT+AVG aggregate replaces waiting on /api/feedback,
 * whose payload reaches megabytes because customer-submitted photos are stored
 * as base64 data URLs in `images`.
 *
 * `productId` is OPTIONAL and purely additive: omitting it keeps the original
 * store-wide behaviour byte for byte. WHICH reviews to count is decided by the
 * caller from `productFeedbackSource` (via feedbackFilterProductId) — this
 * endpoint has no opinion about it and no default product filter.
 *
 * One aggregate query, no N+1, and no review rows or image data are ever read.
 * The visibility rule is the same one getPublicFeedback() applies: APPROVED, or
 * SCHEDULED whose publishAt has passed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '@/lib/prisma';
import { roundAverage } from '@/lib/feedbackSummary';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = (searchParams.get('productId') || '').trim();

    const now = new Date();
    const where = {
      OR: [
        { status: 'APPROVED' },
        { status: 'SCHEDULED', publishAt: { lte: now } },
      ],
    };
    // Only narrow when a product was actually asked for — an absent/blank param
    // must keep the store-wide meaning, never silently match productId: null.
    if (productId) where.productId = productId;

    const agg = await prisma.feedback.aggregate({
      where,
      _avg:   { rating: true },
      _count: { id: true },
    });

    const avg   = roundAverage(agg._avg.rating);
    const count = agg._count.id ?? 0;

    return Response.json({ avg, count }, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('Feedback stats GET error:', err);
    return Response.json({ avg: 0, count: 0 }, { status: 500 });
  }
}
