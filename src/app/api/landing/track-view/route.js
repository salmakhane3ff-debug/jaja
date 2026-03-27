/**
 * POST /api/landing/track-view
 * Records a landing page view event (public, non-blocking).
 */
import { trackViewHandler } from '@/lib/controllers/landingPageController';

export const POST = trackViewHandler;
