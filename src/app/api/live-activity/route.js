/**
 * GET /api/live-activity
 * Public, read-only snapshot of the single server-side Live Activity engine.
 * Shared by the landing page (/tsajlim3ana) and the affiliate dashboard so both
 * always show the SAME events + counters. Demo/presentation data only (no PII).
 */
import { getLiveActivitySnapshot } from '@/lib/services/liveActivityEngine';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snap = await getLiveActivitySnapshot();
    return Response.json(snap, {
      headers: { 'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=3' },
    });
  } catch (err) {
    console.error('live-activity error:', err);
    return Response.json({ enabled: false, counters: null, events: [], config: null });
  }
}
