/**
 * POST /api/admin/demo/reset
 * Resets all demo stats and starts a new competition cycle.
 */
import { resetCompetition } from '@/lib/services/demoService';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const POST = withAdminAuth(async () => {
  try {
    const result = await resetCompetition(true);
    return Response.json(result);
  } catch (err) {
    console.error('admin/demo/reset error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});
