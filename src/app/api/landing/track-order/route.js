/**
 * POST /api/landing/track-order
 * Records a conversion (order) event for a landing page (non-blocking).
 * Called from checkout after payment confirmation.
 */
import { trackOrderHandler } from '@/lib/controllers/landingPageController';

export const POST = trackOrderHandler;
