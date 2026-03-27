/**
 * /api/admin/affiliate-payouts
 * GET  → all payout requests
 * PUT  → approve payout (mark as paid)
 */

import {
  adminGetAllPayouts,
  adminApprovePayout,
} from '@/lib/services/affiliateSystemService';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

async function getHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const payouts = await adminGetAllPayouts();
    const filtered = status ? payouts.filter((p) => p.status === status) : payouts;
    return Response.json(filtered);
  } catch (err) {
    console.error('Admin affiliate-payouts GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

async function putHandler(req) {
  try {
    const { id, _id } = await req.json();
    const payoutId = id || _id;

    if (!payoutId) return Response.json({ error: 'id requis' }, { status: 400 });

    const result = await adminApprovePayout(payoutId);
    return Response.json(result);
  } catch (err) {
    console.error('Admin affiliate-payouts PUT error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export const GET = withAdminAuth(getHandler);
export const PUT = withAdminAuth(putHandler);
