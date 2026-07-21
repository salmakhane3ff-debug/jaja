/**
 * /api/affiliate/ugc/[id]
 * ─────────────────────────────────────────────────────────────────────────────
 * GET   → the affiliate's own submission (internal notes stripped)    [affiliate]
 * PATCH → replace (multipart: new video) | pause/resume (JSON action) [affiliate]
 *
 * Thin wrappers: dispatch by content-type, delegate to the injected handlers.
 * Ownership + transitions are enforced in ugcService. Identity is from session.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { withAffiliateAuth } from '@/lib/middleware/withAffiliateAuth';
import { affiliateUgcHandlers } from '@/lib/ugcRouteHandlers';

export const dynamic = 'force-dynamic';

const h = affiliateUgcHandlers();

export const GET = withAffiliateAuth(async (_req, ctx, decoded) => {
  const { id } = await ctx.params;
  return h.getOne(id, decoded);
});

export const PATCH = withAffiliateAuth(async (req, ctx, decoded) => {
  const { id } = await ctx.params;
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    return h.replace(req, id, decoded);
  }
  const body = await req.json().catch(() => ({}));
  return h.pauseResume(id, decoded, body.action);
});
