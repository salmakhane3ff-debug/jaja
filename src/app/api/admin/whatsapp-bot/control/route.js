import { withAdminAuth } from "@/lib/middleware/withAdminAuth";
import { botControlPost } from "@/lib/whatsappBotControl";

export const dynamic = "force-dynamic";

// Allow-listed control actions only (WhatsApp client lifecycle inside the bot
// process — NOT PM2 process control, NOT message sending).
const ACTIONS = {
  start:      "/start",
  stop:       "/stop",
  restart:    "/restart",
  reconnect:  "/reconnect",
  logout:     "/logout",
  "clear-logs": "/clear-logs",
};

// POST /api/admin/whatsapp-bot/control  { action }
export const POST = withAdminAuth(async (req) => {
  let action;
  try { ({ action } = await req.json()); } catch { action = null; }

  const path = ACTIONS[action];
  if (!path) return Response.json({ ok: false, error: "invalid action" }, { status: 400 });

  return Response.json(await botControlPost(path, {}));
});
