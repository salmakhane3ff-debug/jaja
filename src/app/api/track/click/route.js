/**
 * /api/track/click
 * ─────────────────────────────────────────────────────────────────────────────
 * POST  { campaignId }  → record one click for the given campaign (public)
 *
 * Public — called by the campaign landing page pixel / redirect handler.
 * No auth required so it can be fired from the browser immediately on arrival.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { recordClickHandler } from '@/lib/controllers/adTrackingController';

export const POST = recordClickHandler;
