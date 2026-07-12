/**
 * /api/landing-mode
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight, cacheable public config for "Landing Page Only Mode".
 *
 * Read by the Edge middleware (which cannot query Prisma directly) to decide
 * whether to redirect public storefront requests. Returns ONLY the three landing
 * keys from the existing UI Control store (uIControlSetting), never secrets.
 *
 * Fails safe: on any error it reports { enabled:false } so the site stays open.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from "@/lib/prisma";
import { UI_DEFAULTS } from "@/lib/ui-defaults";
import { normalizeAllowedPaths } from "@/lib/landingMode";

export const dynamic = "force-dynamic";

const KEYS = ["landingOnlyMode", "landingRedirectUrl", "landingAllowedPaths"];

export async function GET() {
  try {
    const rows = await prisma.uIControlSetting.findMany({ where: { key: { in: KEYS } } });
    const cfg = {
      landingOnlyMode:     UI_DEFAULTS.landingOnlyMode,
      landingRedirectUrl:  UI_DEFAULTS.landingRedirectUrl,
      landingAllowedPaths: UI_DEFAULTS.landingAllowedPaths,
    };
    for (const r of rows) {
      try { cfg[r.key] = JSON.parse(r.value); } catch { cfg[r.key] = r.value; }
    }

    return Response.json(
      {
        enabled:      cfg.landingOnlyMode === true,
        redirectUrl:  String(cfg.landingRedirectUrl || ""),
        allowedPaths: normalizeAllowedPaths(cfg.landingAllowedPaths),
      },
      { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" } }
    );
  } catch (err) {
    console.error("[landing-mode GET]", err?.message ?? err);
    // Fail OPEN — never let a config read error take the site into redirect mode.
    return Response.json({ enabled: false, redirectUrl: "", allowedPaths: [], error: "internal" });
  }
}
