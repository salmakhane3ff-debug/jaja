/**
 * POST /api/admin/fake-orders/tick
 * Manually run ONE fake-orders engine tick (admin-triggered). Useful for
 * validation / environments without the standalone PM2 runner. Respects every
 * per-affiliate limit exactly like the background engine (same core).
 */
import { runFakeOrdersTick } from '@/lib/fakeOrdersEngine';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const dynamic = 'force-dynamic';

export const POST = withAdminAuth(async () => {
  try {
    const result = await runFakeOrdersTick();
    return Response.json(result);
  } catch (err) {
    console.error('admin/fake-orders/tick error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});
