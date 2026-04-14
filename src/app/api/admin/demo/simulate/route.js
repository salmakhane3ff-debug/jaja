/**
 * POST /api/admin/demo/simulate
 * Runs one simulation tick (add daily activity to all demo affiliates).
 */
import { simulateTick } from '@/lib/services/demoService';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const POST = withAdminAuth(async () => {
  try {
    const result = await simulateTick();
    return Response.json(result);
  } catch (err) {
    console.error('admin/demo/simulate error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});
