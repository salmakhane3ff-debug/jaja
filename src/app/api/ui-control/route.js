/**
 * /api/ui-control
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  — returns all settings as a flat key→value object
 * POST — upserts one or many settings { key, value } | [{ key, value }, …]
 *
 * Values stored as JSON strings in DB ("true", "false", '"#111827"').
 * GET returns parsed JS values directly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from "@/lib/prisma";
import { UI_DEFAULTS } from "@/lib/ui-defaults";

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

export async function POST(request) {
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
