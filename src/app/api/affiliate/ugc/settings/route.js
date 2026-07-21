/**
 * /api/affiliate/ugc/settings
 * ─────────────────────────────────────────────────────────────────────────────
 * GET → UGC intro settings for the affiliate (commission, instructions, example
 *       video, video limits, potential-earnings ESTIMATE).                 [affiliate]
 *
 * Exposes ONLY intro-relevant fields — never the engine/generation settings or
 * any admin-only configuration. Instructions are bounded plain text (render as
 * TEXT on the client, never HTML). Thin wrapper over the injected handler.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { withAffiliateAuth } from '@/lib/middleware/withAffiliateAuth';
import { affiliateUgcHandlers } from '@/lib/ugcRouteHandlers';

export const dynamic = 'force-dynamic';

const h = affiliateUgcHandlers();

export const GET = withAffiliateAuth(() => h.settings());
