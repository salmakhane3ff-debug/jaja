/**
 * /api/admin/ugc-health
 * ─────────────────────────────────────────────────────────────────────────────
 * GET → operational signal for the UGC module's BEST-EFFORT writes (audit trail,
 *       notifications).                                                  [admin]
 *
 * Those writes are non-fatal by design, but must never fail invisibly. This
 * endpoint reports the in-process failure counters and the most recent structured
 * error records, so a silently degraded audit/notification path is detectable.
 *
 * ⚠️ Counters are per-process and reset on restart; with several PM2 instances
 * each reports only its own. Treat this as "is something wrong right now", and
 * alert on the structured log lines (component:"ugc-ops", severity:"error") for
 * the durable signal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { getUgcOpsMetrics } from '@/lib/ugcOps';

export const dynamic = 'force-dynamic';

export const GET = withAdminAuth(async () => {
  const metrics = getUgcOpsMetrics();
  return Response.json(metrics, { status: metrics.healthy ? 200 : 503 });
});
