/**
 * src/lib/controllers/shippingCompanyController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    /api/shipping-companies          → active companies (public, checkout)
 *        ?admin=true                      → all companies incl. inactive (admin)
 * POST   /api/shipping-companies          → create company (admin)
 * PATCH  /api/shipping-companies          → update company by id (admin)
 * DELETE /api/shipping-companies          → delete company by id (admin)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getActiveShippingCompanies,
  getAllShippingCompanies,
  createShippingCompany,
  updateShippingCompany,
  deleteShippingCompany,
} from '../services/shippingCompanyService.js';
import { badRequest, notFound, serverError } from '../utils/apiResponse.js';

// ── GET /api/shipping-companies ───────────────────────────────────────────────

export async function getShippingCompaniesHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const isAdmin = searchParams.get('admin') === 'true';

    const rows = isAdmin
      ? await getAllShippingCompanies()
      : await getActiveShippingCompanies();

    return Response.json(rows);
  } catch (err) {
    console.error('ShippingCompany GET error:', err);
    return serverError('Failed to fetch shipping companies');
  }
}

// ── POST /api/shipping-companies ──────────────────────────────────────────────

export async function createShippingCompanyHandler(req) {
  try {
    const body = await req.json();

    if (!body.name?.trim()) return badRequest('name is required');

    const company = await createShippingCompany(body);
    return Response.json(company, { status: 201 });
  } catch (err) {
    console.error('ShippingCompany POST error:', err);
    return serverError('Failed to create shipping company');
  }
}

// ── PATCH /api/shipping-companies ─────────────────────────────────────────────

export async function updateShippingCompanyHandler(req) {
  try {
    const body = await req.json();
    const id = body._id || body.id;

    if (!id) return badRequest('id is required');

    const company = await updateShippingCompany(id, body);
    if (!company) return notFound('Shipping company not found');

    return Response.json(company);
  } catch (err) {
    console.error('ShippingCompany PATCH error:', err);
    return serverError('Failed to update shipping company');
  }
}

// ── DELETE /api/shipping-companies ────────────────────────────────────────────

export async function deleteShippingCompanyHandler(req) {
  try {
    const body = await req.json();
    const id = body._id || body.id;

    if (!id) return badRequest('id is required');

    const deleted = await deleteShippingCompany(id);
    if (!deleted) return notFound('Shipping company not found');

    return Response.json({ message: 'Shipping company deleted', _id: id });
  } catch (err) {
    console.error('ShippingCompany DELETE error:', err);
    return serverError('Failed to delete shipping company');
  }
}
