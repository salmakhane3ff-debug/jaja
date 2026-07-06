import { withAdminAuth } from "@/lib/middleware/withAdminAuth";
import { botControlProxy } from "@/lib/whatsappBotControl";

export const dynamic = "force-dynamic";

// GET /api/admin/whatsapp-bot/stats — sent today/week, pending, failed, last 100.
export const GET = withAdminAuth(async () => Response.json(await botControlProxy("/stats")));
