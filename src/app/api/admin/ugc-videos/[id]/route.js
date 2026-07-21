/**
 * /api/admin/ugc-videos/[id]
 * ─────────────────────────────────────────────────────────────────────────────
 * GET   → full submission + status history                               [admin]
 * PATCH → { action: 'approve'|'reject'|'start'|'pause'|'resume', reason?, internalNote? }
 *
 * Thin wrapper: resolve id + admin identity, delegate to the injected handler.
 * The state machine + reason/notes rules are enforced in ugcService.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { adminUgcHandlers } from '@/lib/ugcRouteHandlers';

export const dynamic = 'force-dynamic';

const h = adminUgcHandlers();

export const GET = withAdminAuth(async (_req, ctx) => {
  const { id } = await ctx.params;
  return h.getOne(id);
});

export const PATCH = withAdminAuth(async (req, ctx, user) => {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const adminId = user?.userId || user?.id || 'admin';   // from admin session
  return h.patch(id, body, adminId);
});
