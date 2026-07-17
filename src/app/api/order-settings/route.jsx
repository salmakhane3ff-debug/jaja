/**
 * /api/order-settings
 * ─────────────────────────────────────────────────────────────────────────────
 * GET   → delivery timing config (dispatchAfterHours, inTransitAfterHours, …) [public]
 * PUT   → update timing (validates ascending sequence)                        [admin]
 * POST  → reset to factory defaults                                           [admin]
 *
 * Response shape mirrors the original MongoDB implementation so all existing
 * admin pages that read/write these settings continue to work unchanged.
 *
 * AUTH: the Edge middleware matcher excludes /api, so these exports are the only
 * gate. GET stays public — the customer-facing /track-order page reads the
 * delivery timings anonymously. Writes are admin-only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getOrderSettingsHandler,
  updateOrderSettingsHandler,
  resetOrderSettingsHandler,
} from '@/lib/controllers/settingsController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

// Public — read by the customer-facing /track-order page.
export const GET  = getOrderSettingsHandler;

export const PUT  = withAdminAuth(updateOrderSettingsHandler);
export const POST = withAdminAuth(resetOrderSettingsHandler);
