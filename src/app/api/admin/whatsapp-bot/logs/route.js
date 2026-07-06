import { withAdminAuth } from "@/lib/middleware/withAdminAuth";
import { botControlProxy } from "@/lib/whatsappBotControl";

export const dynamic = "force-dynamic";

// GET /api/admin/whatsapp-bot/logs — recent bot log lines (read-only).
export const GET = withAdminAuth(async () => Response.json(await botControlProxy("/logs")));
