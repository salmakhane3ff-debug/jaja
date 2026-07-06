import { withAdminAuth } from "@/lib/middleware/withAdminAuth";
import { botControlPost } from "@/lib/whatsappBotControl";

export const dynamic = "force-dynamic";

// POST /api/admin/whatsapp-bot/send-test  { phone, message }
// Proxies to the bot, which sends immediately and does NOT create a dedupe entry.
export const POST = withAdminAuth(async (req) => {
  let body = {};
  try { body = await req.json(); } catch {}
  const phone   = String(body.phone   || "").trim();
  const message = String(body.message || "").trim();

  if (!phone)   return Response.json({ ok: false, error: "phone required" },   { status: 400 });
  if (!message) return Response.json({ ok: false, error: "message required" }, { status: 400 });

  return Response.json(await botControlPost("/send-test", { phone, message }));
});
