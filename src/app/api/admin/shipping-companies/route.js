/**
 * /api/admin/shipping-companies
 * Admin-protected CRUD for shipping companies.
 *
 * GET    → list ALL companies (active + inactive)
 * POST   → create new company
 * PUT    → update company fields
 * DELETE → delete company
 */

import {
  getAllShippingCompanies,
  createShippingCompany,
  updateShippingCompany,
  deleteShippingCompany,
} from '@/lib/services/shippingCompanyService';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

// ── GET ───────────────────────────────────────────────────────────────────────

async function getHandler() {
  try {
    const companies = await getAllShippingCompanies();
    return Response.json(companies);
  } catch (err) {
    console.error('Admin shipping-companies GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

async function postHandler(req) {
  try {
    const body = await req.json();
    const { name } = body;

    if (!name?.trim()) {
      return Response.json({ error: 'Le nom est requis' }, { status: 400 });
    }

    const company = await createShippingCompany(body);
    return Response.json(company, { status: 201 });
  } catch (err) {
    console.error('Admin shipping-companies POST error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── PUT ───────────────────────────────────────────────────────────────────────

async function putHandler(req) {
  try {
    const body = await req.json();
    const { id, _id, ...data } = body;
    const companyId = id || _id;

    if (!companyId) {
      return Response.json({ error: 'id requis' }, { status: 400 });
    }

    const company = await updateShippingCompany(companyId, data);
    if (!company) {
      return Response.json({ error: 'Société introuvable' }, { status: 404 });
    }
    return Response.json(company);
  } catch (err) {
    console.error('Admin shipping-companies PUT error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

async function deleteHandler(req) {
  try {
    const { id, _id } = await req.json();
    const companyId = id || _id;

    if (!companyId) {
      return Response.json({ error: 'id requis' }, { status: 400 });
    }

    const deleted = await deleteShippingCompany(companyId);
    if (!deleted) {
      return Response.json({ error: 'Société introuvable' }, { status: 404 });
    }
    return Response.json({ ok: true, id: companyId });
  } catch (err) {
    console.error('Admin shipping-companies DELETE error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const GET    = withAdminAuth(getHandler);
export const POST   = withAdminAuth(postHandler);
export const PUT    = withAdminAuth(putHandler);
export const DELETE = withAdminAuth(deleteHandler);
