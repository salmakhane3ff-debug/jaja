/**
 * POST /api/tsajlim3ana/track  { event, source }
 * Lightweight, public, fire-and-forget counter for the recruitment landing.
 * Records WhatsApp-CTA clicks / logins under source="tsajlim3ana" in the
 * recruitment-landing settings row (no PII). Never throws to the client.
 */
import { getSettings, upsertSettings } from "@/lib/services/settingsService";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["whatsapp_cta", "login", "view"]);

export async function POST(req) {
  const limited = rateLimit(req, "tsajlim_track", { max: 60, windowMs: 60_000 });
  if (limited) return limited;
  try {
    const body = await req.json().catch(() => ({}));
    const event = String(body?.event || "").trim();
    if (body?.source !== "tsajlim3ana" || !ALLOWED.has(event)) {
      return Response.json({ ok: true }); // ignore anything unexpected, silently
    }
    const current = (await getSettings("recruitment-landing").catch(() => null)) || {};
    const stats = (current.stats && typeof current.stats === "object") ? current.stats : {};
    stats[event] = (Number(stats[event]) || 0) + 1;
    await upsertSettings("recruitment-landing", { ...current, stats }).catch(() => {});
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: true }); // tracking must never surface an error
  }
}
