/**
 * src/lib/controllers/promoController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    /api/promo?code=<CODE>  → validate promo code (public, checkout Step 1)
 * GET    /api/promo?admin=true   → list all promos (admin)
 * POST   /api/promo              → create promo (admin)
 * PATCH  /api/promo              → update promo by id (admin)
 * DELETE /api/promo              → delete promo by id (admin)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getPromoByCode,
  getAllPromos,
  createPromo,
  updatePromo,
  deletePromo,
} from '../services/promoService.js';
import { badRequest, notFound, serverError } from '../utils/apiResponse.js';

// ── GET /api/promo ────────────────────────────────────────────────────────────

export async function getPromoHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const code    = searchParams.get('code')  || null;
    const isAdmin = searchParams.get('admin') === 'true';

    // Admin list — return all promos
    if (isAdmin) {
      const rows = await getAllPromos();
      return Response.json(rows);
    }

    // Public validation — ?code=XXXXX
    if (!code) return badRequest('code query parameter is required');

    const promo = await getPromoByCode(code);

    if (!promo) {
      return Response.json({ valid: false, error: 'كود الخصم غير صحيح أو منتهي الصلاحية' }, { status: 400 });
    }

    return Response.json({
      valid:    true,
      code:     promo.code,
      type:     promo.type,       // "percent" | "fixed"
      value:    promo.value,
      minOrder: promo.minOrder,
    });
  } catch (err) {
    console.error('Promo GET error:', err);
    return serverError('Failed to fetch promo');
  }
}

// ── POST /api/promo ───────────────────────────────────────────────────────────

export async function createPromoHandler(req) {
  try {
    const body = await req.json();

    if (!body.code?.trim())  return badRequest('code is required');
    if (!body.type)          return badRequest('type is required (percent | fixed)');
    if (body.value === undefined || body.value === null) return badRequest('value is required');

    const promo = await createPromo(body);
    return Response.json(promo, { status: 201 });
  } catch (err) {
    // Unique constraint violation on code
    if (err.code === 'P2002') {
      return Response.json({ error: 'Promo code already exists' }, { status: 409 });
    }
    console.error('Promo POST error:', err);
    return serverError('Failed to create promo');
  }
}

// ── PATCH /api/promo ──────────────────────────────────────────────────────────

export async function updatePromoHandler(req) {
  try {
    const body = await req.json();
    const id = body._id || body.id;

    if (!id) return badRequest('id is required');

    const promo = await updatePromo(id, body);
    if (!promo) return notFound('Promo not found');

    return Response.json(promo);
  } catch (err) {
    if (err.code === 'P2002') {
      return Response.json({ error: 'Promo code already exists' }, { status: 409 });
    }
    console.error('Promo PATCH error:', err);
    return serverError('Failed to update promo');
  }
}

// ── DELETE /api/promo ─────────────────────────────────────────────────────────

export async function deletePromoHandler(req) {
  try {
    const body = await req.json();
    const id = body._id || body.id;

    if (!id) return badRequest('id is required');

    const deleted = await deletePromo(id);
    if (!deleted) return notFound('Promo not found');

    return Response.json({ message: 'Promo deleted', _id: id });
  } catch (err) {
    console.error('Promo DELETE error:', err);
    return serverError('Failed to delete promo');
  }
}
