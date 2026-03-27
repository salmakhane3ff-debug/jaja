/**
 * src/app/api/admin/promo/route.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin-protected CRUD for promo codes.
 *
 * GET    /api/admin/promo          → list all promos
 * POST   /api/admin/promo          → create promo
 * PUT    /api/admin/promo          → update promo by id
 * DELETE /api/admin/promo          → delete promo by id
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import {
  getAllPromos,
  createPromo,
  updatePromo,
  deletePromo,
} from '@/lib/services/promoService';

// ── GET ───────────────────────────────────────────────────────────────────────

export const GET = withAdminAuth(async () => {
  try {
    const rows = await getAllPromos();
    return Response.json(rows);
  } catch (err) {
    console.error('Admin promo GET error:', err);
    return Response.json({ error: 'Failed to fetch promos' }, { status: 500 });
  }
});

// ── POST ──────────────────────────────────────────────────────────────────────

export const POST = withAdminAuth(async (req) => {
  try {
    const body = await req.json();

    if (!body.code?.trim())
      return Response.json({ error: 'code is required' }, { status: 400 });
    if (!body.type)
      return Response.json({ error: 'type is required (percent | fixed)' }, { status: 400 });
    if (body.value === undefined || body.value === null)
      return Response.json({ error: 'value is required' }, { status: 400 });

    const promo = await createPromo(body);
    return Response.json(promo, { status: 201 });
  } catch (err) {
    if (err.code === 'P2002') {
      return Response.json({ error: 'Ce code promo existe déjà' }, { status: 409 });
    }
    console.error('Admin promo POST error:', err);
    return Response.json({ error: 'Failed to create promo' }, { status: 500 });
  }
});

// ── PUT ───────────────────────────────────────────────────────────────────────

export const PUT = withAdminAuth(async (req) => {
  try {
    const body = await req.json();
    const id = body._id || body.id;

    if (!id)
      return Response.json({ error: 'id is required' }, { status: 400 });

    const promo = await updatePromo(id, body);
    if (!promo)
      return Response.json({ error: 'Promo not found' }, { status: 404 });

    return Response.json(promo);
  } catch (err) {
    if (err.code === 'P2002') {
      return Response.json({ error: 'Ce code promo existe déjà' }, { status: 409 });
    }
    console.error('Admin promo PUT error:', err);
    return Response.json({ error: 'Failed to update promo' }, { status: 500 });
  }
});

// ── DELETE ────────────────────────────────────────────────────────────────────

export const DELETE = withAdminAuth(async (req) => {
  try {
    const body = await req.json();
    const id = body._id || body.id;

    if (!id)
      return Response.json({ error: 'id is required' }, { status: 400 });

    const deleted = await deletePromo(id);
    if (!deleted)
      return Response.json({ error: 'Promo not found' }, { status: 404 });

    return Response.json({ message: 'Promo supprimé', _id: id });
  } catch (err) {
    console.error('Admin promo DELETE error:', err);
    return Response.json({ error: 'Failed to delete promo' }, { status: 500 });
  }
});
