/**
 * /api/admin/deposits
 * GET  ?status=PENDING|APPROVED|REJECTED|all → deposit requests (no storage keys)
 * PUT  → { id, action:'approve'|'reject', reason? }  (idempotent, amount from DB)
 */
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { adminListDeposits, adminApproveDeposit, adminRejectDeposit } from '@/lib/services/depositService';

export const dynamic = 'force-dynamic';

export const GET = withAdminAuth(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') || 'all').toUpperCase();
    const list = await adminListDeposits(status === 'ALL' ? null : status);
    return Response.json(list);
  } catch (err) {
    console.error('admin/deposits GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});

export const PUT = withAdminAuth(async (req, _ctx, user) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { id, action, reason } = body;
    if (!id || !action) return Response.json({ error: 'id et action requis' }, { status: 400 });
    const adminId = user?.id || user?.email || user?.userId || null;

    if (action === 'approve') return Response.json(await adminApproveDeposit(id, adminId));
    if (action === 'reject')  return Response.json(await adminRejectDeposit(id, reason, adminId));
    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (err) {
    if (err.code === 'REJECTION_REASON_REQUIRED') {
      return Response.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error('admin/deposits PUT error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});
