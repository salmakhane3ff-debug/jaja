/**
 * GET /api/demo/leaderboard?limit=20
 * Public endpoint — cached 60 s at service layer.
 */
import { getLeaderboard, getCompetitionInfo } from '@/lib/services/demoService';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '20', 10));
    const [leaderboard, competition] = await Promise.all([
      getLeaderboard(limit),
      getCompetitionInfo(),
    ]);
    return Response.json({ leaderboard, competition }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('demo/leaderboard error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
