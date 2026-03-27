/**
 * /api/track/conversion
 * ─────────────────────────────────────────────────────────────────────────────
 * POST  { campaignId, revenue }  → record a conversion + revenue (public)
 *
 * Public — called from the checkout thank-you page after a successful order.
 * The caller stores campaignId in sessionStorage when the visitor first arrives
 * via a campaign link, then reads it here at checkout completion.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { recordConversionHandler } from '@/lib/controllers/adTrackingController';

export const POST = recordConversionHandler;
