import { withAdminAuth } from "@/lib/middleware/withAdminAuth";
import { botControlProxy } from "@/lib/whatsappBotControl";

export const dynamic = "force-dynamic";

// GET /api/admin/whatsapp-bot/status — read-only bot connection status.
export const GET = withAdminAuth(async () => Response.json(await botControlProxy("/status")));
