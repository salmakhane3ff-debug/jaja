import { withAdminAuth } from "@/lib/middleware/withAdminAuth";
import { botControlProxy } from "@/lib/whatsappBotControl";

export const dynamic = "force-dynamic";

// GET /api/admin/whatsapp-bot/qr — current QR (only while awaiting scan). Never
// exposes session files; the bot returns null once connected.
export const GET = withAdminAuth(async () => Response.json(await botControlProxy("/qr")));
