/**
 * /api/spin-wheel
 * ─────────────────────────────────────────────────────────────────────────────
 * GET   ?admin=true  → spin stats (admin only)
 * POST               → record a spin event (public — fires from the widget)
 * PATCH              → update copied / ordered flag (public — no auth available)
 *
 * Spin wheel config (segments, trigger, etc.) is read/written via
 * /api/setting?type=spin-wheel — not this route.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getSpinWheelHandler,
  createSpinEventHandler,
  updateSpinEventHandler,
} from '@/lib/controllers/spinWheelController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

// Admin only — returns aggregate stats + recent events
export const GET = withAdminAuth(getSpinWheelHandler);

// Public — spin widget calls these without auth
export const POST  = createSpinEventHandler;
export const PATCH = updateSpinEventHandler;
