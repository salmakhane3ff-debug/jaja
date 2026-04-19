/**
 * GET /api/feedback/stats
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns global approved-feedback stats: { avg, count }
 * Replaces the 6+ MB /api/feedback fetch on the product page that was used
 * only to compute these two numbers. Single DB aggregate query, ~20-byte JSON.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const now = new Date();

    const agg = await prisma.feedback.aggregate({
      where: {
        OR: [
          { status: 'APPROVED' },
          { status: { in: ['SCHEDULED'] }, scheduledAt: { lte: now } },
        ],
      },
      _avg:   { rating: true },
      _count: { id: true },
    });

    const avg   = parseFloat((agg._avg.rating  ?? 0).toFixed(1));
    const count = agg._count.id ?? 0;

    return Response.json({ avg, count }, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('Feedback stats GET error:', err);
    return Response.json({ avg: 0, count: 0 }, { status: 500 });
  }
}
