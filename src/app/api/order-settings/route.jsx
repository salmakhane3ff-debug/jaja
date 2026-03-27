/**
 * /api/order-settings
 * ─────────────────────────────────────────────────────────────────────────────
 * GET   → delivery timing config (dispatchAfterHours, inTransitAfterHours, …)
 * PUT   → update timing (validates ascending sequence)
 * POST  → reset to factory defaults
 *
 * Response shape mirrors the original MongoDB implementation so all existing
 * admin pages that read/write these settings continue to work unchanged.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getOrderSettingsHandler,
  updateOrderSettingsHandler,
  resetOrderSettingsHandler,
} from '@/lib/controllers/settingsController';

export const GET  = getOrderSettingsHandler;
export const PUT  = updateOrderSettingsHandler;
export const POST = resetOrderSettingsHandler;
