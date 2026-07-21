/**
 * /api/admin/ugc-videos
 * ─────────────────────────────────────────────────────────────────────────────
 * GET → paginated list of submissions with optional filters             [admin]
 *       ?status=&affiliateId=&productId=&page=&pageSize=
 *
 * Thin wrapper: parse query, delegate to the injected admin handler.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { adminUgcHandlers } from '@/lib/ugcRouteHandlers';

export const dynamic = 'force-dynamic';

const h = adminUgcHandlers();

export const GET = withAdminAuth((req) => {
  const { searchParams } = new URL(req.url);
  return h.list({
    status:      searchParams.get('status') || undefined,
    affiliateId: searchParams.get('affiliateId') || undefined,
    productId:   searchParams.get('productId') || undefined,
    page:        Number(searchParams.get('page')) || 1,
    pageSize:    Number(searchParams.get('pageSize')) || 20,
  });
});
