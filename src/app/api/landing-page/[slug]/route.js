/**
 * /api/landing-page/[slug]
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → fetch active landing page by slug + increment view counter (public)
 * POST → record a CTA click for this landing page (public)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getLandingPageBySlugHandler,
  recordLandingPageClickHandler,
} from '@/lib/controllers/landingPageController';

export const GET  = getLandingPageBySlugHandler;
export const POST = recordLandingPageClickHandler;
