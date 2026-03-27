/**
 * /api/landing-page
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    ?admin=true    → all pages including inactive (admin)
 * GET    ?id=<uuid>     → single page by id (admin)
 * GET                   → active pages only (public)
 * POST                  → create landing page (admin)
 * PUT                   → update landing page (admin)
 * DELETE                → delete landing page (admin)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getLandingPagesHandler,
  createLandingPageHandler,
  updateLandingPageHandler,
  deleteLandingPageHandler,
} from '@/lib/controllers/landingPageController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const GET    = getLandingPagesHandler;             // public read is intentional
export const POST   = withAdminAuth(createLandingPageHandler);
export const PUT    = withAdminAuth(updateLandingPageHandler);
export const DELETE = withAdminAuth(deleteLandingPageHandler);
