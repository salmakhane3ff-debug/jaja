/**
 * GET /api/admin/boosters → all purchases (recent first, affiliate name attached)
 * PUT /api/admin/boosters → review a CARD purchase { id, action: 'approve'|'reject' }
 * Admin-only. Review is idempotent (conditional update gated on PENDING).
 * Package management itself lives in the generic admin settings route
 * (POST /api/setting?type=booster-packages).
 */
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { listAllBoosterPurchases, reviewBoosterPurchase } from '@/lib/services/boosterService';
import { adminListSimulations, adminSimulationAction } from '@/lib/services/boosterSimulationService';

const SIM_ACTIONS = ['pause', 'resume', 'complete', 'reset', 'add', 'remove'];

export const GET = withAdminAuth(async () => {
  try {
    const [purchases, simulations] = await Promise.all([
      listAllBoosterPurchases(),
      adminListSimulations().catch(() => []),
    ]);
    return Response.json({ purchases, simulations });
  } catch (err) {
    console.error('admin/boosters GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});

export const PUT = withAdminAuth(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));

    // Simulation controls (pause/resume/reset/add/remove/complete) — these only
    // ever write booster_simulations, never a purchase, so nothing is refunded.
    if (SIM_ACTIONS.includes(body?.action)) {
      const sim = await adminSimulationAction(String(body?.purchaseId || ''), body.action, body?.value);
      return Response.json(sim);
    }

    // Payment review (approve/reject a CARD purchase) — unchanged.
    const purchase = await reviewBoosterPurchase(String(body?.id || ''), body?.action);
    return Response.json(purchase);
  } catch (err) {
    if (['INVALID_ACTION', 'NOT_PENDING', 'SIM_NOT_FOUND', 'INVALID_SIM_STATUS'].includes(err.code)) {
      return Response.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error('admin/boosters PUT error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});
