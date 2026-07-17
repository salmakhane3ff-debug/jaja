/**
 * /api/gifts/[id]
 * ─────────────────────────────────────────────────────────────────────────────
 * PUT    → update a gift  [admin]
 * DELETE → delete a gift  [admin]
 *
 * AUTH: the Edge middleware matcher excludes /api, so these exports are the only
 * gate. The parent /api/gifts was already admin-wrapped while this child was
 * not — auth was added to the parent and forgotten on the child.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from "@/lib/prisma";
import { withAdminAuth } from "@/lib/middleware/withAdminAuth";

async function _PUT(req, { params }) {
  try {
    const body = await req.json();
    const gift = await prisma.gift.update({
      where: { id: params.id },
      data: {
        productId:        body.productId,
        thresholdAmount:  parseFloat(body.thresholdAmount),
        active:           body.active,
        countdownMinutes: parseInt(body.countdownMinutes, 10) || 0,
      },
    });
    return Response.json(gift);
  } catch (e) {
    console.error("PUT /api/gifts/[id]:", e);
    return Response.json({ error: "Failed to update gift" }, { status: 500 });
  }
}
export const PUT = withAdminAuth(_PUT);

async function _DELETE(_, { params }) {
  try {
    await prisma.gift.delete({ where: { id: params.id } });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/gifts/[id]:", e);
    return Response.json({ error: "Failed to delete gift" }, { status: 500 });
  }
}
export const DELETE = withAdminAuth(_DELETE);
