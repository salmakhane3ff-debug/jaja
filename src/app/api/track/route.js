/**
 * /api/track
 * ─────────────────────────────────────────────────────────────────────────────
 * POST → record a single tracking event (public, no auth required)
 * GET  → admin analytics dashboard (protected by withAdminAuth)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { recordEventHandler, getStatsHandler } from '@/lib/controllers/trackingController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const POST = recordEventHandler;
export const GET  = withAdminAuth(getStatsHandler);
