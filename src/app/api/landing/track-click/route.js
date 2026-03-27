/**
 * POST /api/landing/track-click
 * Records a landing page CTA click event (public, non-blocking).
 */
import { trackClickHandler } from '@/lib/controllers/landingPageController';

export const POST = trackClickHandler;
