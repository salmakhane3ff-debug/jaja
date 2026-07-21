/**
 * /api/admin/ugc-notifications
 * ─────────────────────────────────────────────────────────────────────────────
 * GET   → recent "new UGC submission awaiting review" notifications + unread count [admin]
 * PATCH → mark them read                                                           [admin]
 *
 * These rows are written EVENT-DRIVEN by the UGC service when a submission (or a
 * replacement) enters review. Reads degrade to an empty feed if the additive
 * migration has not been applied yet.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import {
  listAdminNotifications,
  markAdminNotificationsRead,
} from '@/lib/services/adminNotificationService';

export const dynamic = 'force-dynamic';

export const GET = withAdminAuth(async () => {
  const { notifications, unread } = await listAdminNotifications({ limit: 20 });
  return Response.json({ notifications, unread });
});

export const PATCH = withAdminAuth(async () => {
  const count = await markAdminNotificationsRead({});
  return Response.json({ marked: count });
});
