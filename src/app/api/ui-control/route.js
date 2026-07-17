/**
 * /api/ui-control
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  — returns all settings as a flat key→value object            [public]
 * POST — upserts one or many settings { key, value } | [{ key, value }, …] [admin]
 *
 * Values stored as JSON strings in DB ("true", "false", '"#111827"').
 * GET returns parsed JS values directly.
 *
 * AUTH: the Edge middleware matcher excludes /api, so these exports are the only
 * gate. GET MUST stay public — UIControlProvider is mounted in the root
 * providers.tsx, so every storefront visitor reads it anonymously. POST is
 * admin-only: it drives Landing-Page-Only Mode, so an anonymous write could
 * redirect the whole storefront to an arbitrary destination.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from "@/lib/prisma";
import { UI_DEFAULTS } from "@/lib/ui-defaults";
import { withAdminAuth } from "@/lib/middleware/withAdminAuth";

// Public — read by every storefront page via UIControlProvider.
export async function GET() {
  try {
    const rows = await prisma.uIControlSetting.findMany();
    const result = { ...UI_DEFAULTS };
    for (const row of rows) {
      try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
    }
    return Response.json(result);
  } catch (err) {
    console.error("[ui-control GET]", err?.message ?? err);
    return Response.json(UI_DEFAULTS); // Always return defaults on error
  }
}

async function _POST(request) {
  try {
    const body = await request.json();
    // Accept single { key, value } or array [{ key, value }, …]
    const pairs = Array.isArray(body) ? body : [body];

    await Promise.all(
      pairs.map(({ key, value }) =>
        prisma.uIControlSetting.upsert({
          where:  { key },
          create: { key, value: JSON.stringify(value) },
          update: { value: JSON.stringify(value) },
        })
      )
    );

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[ui-control POST]", err?.message ?? err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
export const POST = withAdminAuth(_POST);
