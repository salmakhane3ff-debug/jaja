/**
 * /api/admin/ugc-settings
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → current UGC settings (full)                                     [admin]
 * POST → validate + save UGC settings                                    [admin]
 *
 * Persisted in the generic settings store (id='ugc'). Validation lives in the
 * pure ugcSettings module; this file just wires the injected handler.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { adminUgcHandlers } from '@/lib/ugcRouteHandlers';

export const dynamic = 'force-dynamic';

const h = adminUgcHandlers();

export const GET = withAdminAuth(() => h.getSettings());

export const POST = withAdminAuth(async (req, _ctx, user) => {
  const body = await req.json().catch(() => ({}));
  const adminId = user?.userId || user?.id || 'admin';   // recorded in the audit trail
  return h.saveSettings(body, adminId);
});
