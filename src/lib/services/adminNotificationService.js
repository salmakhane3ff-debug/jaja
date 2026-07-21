/**
 * src/lib/services/adminNotificationService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Read/ack side of the admin notification feed (written event-driven by
 * ugcNotifications.emitUgcEvent when a submission enters review).
 *
 * NON-FATAL BY CONTRACT, like the writer: if the additive `admin_notifications`
 * migration has not been applied yet, listing returns an empty feed and marking
 * read is a no-op — the admin pages keep working either way.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';
import { ADMIN_NOTIFICATION_TYPE } from '../ugcNotifications.js';
import { recordUgcOpsFailure, UGC_OPS_OPERATION } from '../ugcOps.js';

/** Recent notifications (newest first) + the unread count. Never throws. */
export async function listAdminNotifications({
  type = ADMIN_NOTIFICATION_TYPE.UGC_REVIEW_PENDING,
  limit = 20,
  db = prisma,
  onFailure = recordUgcOpsFailure,
} = {}) {
  try {
    if (!db?.adminNotification?.findMany) return { notifications: [], unread: 0 };
    const where = type ? { type } : {};
    const [notifications, unread] = await Promise.all([
      db.adminNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(1, Number(limit) || 20), 100),
      }),
      db.adminNotification.count({ where: { ...where, read: false } }),
    ]);
    return { notifications, unread };
  } catch (err) {
    onFailure({ operation: UGC_OPS_OPERATION.ADMIN_NOTIF_READ, error: err });
    return { notifications: [], unread: 0 };
  }
}

/** Mark a type (or a specific set of ids) as read. Returns the count. Never throws. */
export async function markAdminNotificationsRead({
  type = ADMIN_NOTIFICATION_TYPE.UGC_REVIEW_PENDING,
  ids = null,
  db = prisma,
  onFailure = recordUgcOpsFailure,
} = {}) {
  try {
    if (!db?.adminNotification?.updateMany) return 0;
    const where = ids?.length ? { id: { in: ids } } : { type, read: false };
    const r = await db.adminNotification.updateMany({ where, data: { read: true } });
    return r?.count ?? 0;
  } catch (err) {
    onFailure({ operation: UGC_OPS_OPERATION.ADMIN_NOTIF_ACK, error: err });
    return 0;
  }
}
