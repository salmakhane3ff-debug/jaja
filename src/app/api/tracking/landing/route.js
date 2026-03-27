/**
 * POST /api/tracking/landing
 * ─────────────────────────────────────────────────────────────────────────────
 * Saves a LandingVisit row when a landing page is viewed.
 *
 * Body: { landingId?, clickId? }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from "@/lib/prisma";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { landingId, clickId } = body;

    await prisma.landingVisit.create({
      data: {
        landingId: landingId || null,
        clickId:   clickId   || null,
      },
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[tracking/landing]", err?.message ?? err);
    return Response.json({ ok: true });
  }
}
