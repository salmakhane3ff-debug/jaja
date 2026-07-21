/**
 * /api/affiliate/ugc
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → the affiliate's own submissions + their UGC earnings stats   [affiliate]
 * POST → create a submission (multipart: video file + fields)         [affiliate]
 *
 * Thin wrappers: this file only wires the real deps + auth. The handler bodies
 * live in ugcRouteHandlers (dependency-injected so they can be tested at runtime
 * with mocked services). Identity is ALWAYS from the session (decoded.affiliateId),
 * never from the body.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { withAffiliateAuth } from '@/lib/middleware/withAffiliateAuth';
import { affiliateUgcHandlers } from '@/lib/ugcRouteHandlers';

export const dynamic = 'force-dynamic';

const h = affiliateUgcHandlers();

export const GET = withAffiliateAuth((_req, _ctx, decoded) => h.list(decoded));
export const POST = withAffiliateAuth((req, _ctx, decoded) => h.create(req, decoded));
