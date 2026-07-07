import { withAdminAuth } from "@/lib/middleware/withAdminAuth";
import { getSettings, upsertSettings } from "@/lib/services/settingsService";

export const dynamic = "force-dynamic";

const KEYS = ["NEW", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"];
const SETTING_TYPE = "whatsapp-bot";

// GET → current templates from the generic Setting store.
export const GET = withAdminAuth(async () => {
  const data = await getSettings(SETTING_TYPE);
  const t = (data && data.templates) || {};
  const templates = {};
  for (const k of KEYS) templates[k] = typeof t[k] === "string" ? t[k] : "";
  const abandonedTemplate = typeof (data && data.abandonedTemplate) === "string" ? data.abandonedTemplate : "";
  return Response.json({ templates, abandonedTemplate });
});

// POST { templates, abandonedTemplate } → persist to the Setting store
// (no Prisma schema change). Real-order and abandoned templates stay separate.
export const POST = withAdminAuth(async (req) => {
  let body = {};
  try { body = await req.json(); } catch {}
  const incoming = (body && body.templates) || {};

  // Keep only the known keys; store as strings.
  const templates = {};
  for (const k of KEYS) templates[k] = typeof incoming[k] === "string" ? incoming[k] : "";
  const abandonedTemplate = typeof (body && body.abandonedTemplate) === "string" ? body.abandonedTemplate : "";

  // Merge with any other keys already in the row (defensive).
  const existing = await getSettings(SETTING_TYPE);
  const saved = await upsertSettings(SETTING_TYPE, { ...existing, templates, abandonedTemplate });
  return Response.json({ ok: true, templates: saved.templates, abandonedTemplate: saved.abandonedTemplate });
});
