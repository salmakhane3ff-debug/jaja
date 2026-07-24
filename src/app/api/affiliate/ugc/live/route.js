/**
 * /api/affiliate/ugc/live
 * ─────────────────────────────────────────────────────────────────────────────
 * GET → cheap live snapshot for the dashboard's short poll:               [affiliate]
 *       { lastEarningId, lastEarningAt, todayEarnings, todaySales, totalEarnings, totalSales }
 *
 * Thin wrapper: identity from the session; response is no-store so a new simulated
 * sale is reflected without any cache. Full stats are refetched by the client only
 * when lastEarningId changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { withAffiliateAuth } from '@/lib/middleware/withAffiliateAuth';
import { affiliateUgcHandlers } from '@/lib/ugcRouteHandlers';

export const dynamic = 'force-dynamic';

const h = affiliateUgcHandlers();

export const GET = withAffiliateAuth((_req, _ctx, decoded) => h.live(decoded));
