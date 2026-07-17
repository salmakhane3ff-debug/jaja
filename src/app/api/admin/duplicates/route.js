/**
 * /api/admin/duplicates
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  ?confidence=&collection=&brand=&status=
 *      → { groups: [{ groupKey, confidence, reasons, fingerprint, products }], total, truncated }
 *
 * POST { groupKey, fingerprint, productIds }
 *      → ignore a group (idempotent upsert)
 *
 * REVIEW ONLY — there is deliberately no delete here. Deleting a product stays
 * on the normal Products page and its existing flow.
 *
 * Both handlers are wrapped in withAdminAuth, matching the 44 other admin routes.
 * (Note: /api/products' own writes are NOT auth-wrapped and the middleware
 * matcher excludes /api — a pre-existing gap reported separately, untouched here.)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/middleware/withAdminAuth";
import { getDuplicateGroups, ignoreDuplicateGroup } from "@/lib/services/duplicateService";
import { CONFIDENCE_ORDER } from "@/lib/duplicates";

export const dynamic = "force-dynamic";

async function _GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("confidence");
    const confidence = CONFIDENCE_ORDER.includes(raw) ? raw : null;

    const result = await getDuplicateGroups({
      confidence,
      collection: searchParams.get("collection") || null,
      brand:      searchParams.get("brand")      || null,
      status:     searchParams.get("status")     || null,
    });

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("GET /api/admin/duplicates error:", err);
    return NextResponse.json({ error: "Failed to detect duplicates" }, { status: 500 });
  }
}
export const GET = withAdminAuth(_GET);

async function _POST(req) {
  try {
    let body = {};
    try { body = await req.json(); } catch { /* handled below */ }

    const groupKey    = (body?.groupKey    || "").toString().trim();
    const fingerprint = (body?.fingerprint || "").toString().trim();
    const productIds  = Array.isArray(body?.productIds) ? body.productIds.filter(Boolean) : [];

    if (!groupKey || !fingerprint) {
      return NextResponse.json({ error: "Missing groupKey or fingerprint" }, { status: 400 });
    }

    await ignoreDuplicateGroup({ groupKey, fingerprint, productIds });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/admin/duplicates error:", err);
    return NextResponse.json({ error: "Failed to ignore group" }, { status: 500 });
  }
}
export const POST = withAdminAuth(_POST);
