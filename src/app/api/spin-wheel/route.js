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
/**
 * ⚠️ TEMPORARY PUBLIC SECURITY EXCEPTION — tracked in scripts/routeAuth.test.mjs
 *
 * Why it is currently public:
 *   The spin-wheel widget marks a prize as copied/ordered from the visitor's
 *   browser. The visitor is anonymous — there is no customer session to attach.
 *
 * Known risk:
 *   Anonymous state mutation with NO identity check. Any caller can flip the
 *   copied/ordered flag on any spin event id it can guess or observe, corrupting
 *   spin analytics and prize-redemption state.
 *
 * Required follow-up fix:
 *   Bind the mutation to the spin's own secret — require the sessionId/clickId
 *   issued when the spin was created, and reject a PATCH that cannot present the
 *   value for that event.
 *
 * Hardening applied (Batch #2, endpoint unchanged):
 *   updateSpinEventHandler is now rate-limited. Stronger per-spin ownership proof
 *   needs a server-issued token in the POST response plus a frontend change, so
 *   it remains the follow-up fix; the flags mutated here are analytics-only.
 */
export const PATCH = updateSpinEventHandler;
