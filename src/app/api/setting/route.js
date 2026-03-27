/**
 * /api/setting
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  ?type=store|payment|delivery|integrations  → settings object
 * POST ?type=store|payment|delivery|integrations  → upsert settings
 *
 * Response shape is identical to the original MongoDB implementation:
 *   GET  → { ...settingsFields, _id: type }
 *   POST → { message: "Saved", data: { ...settingsFields, _id: type } }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getSettingsHandler,
  upsertSettingsHandler,
} from '@/lib/controllers/settingsController';

export const GET  = getSettingsHandler;
export const POST = upsertSettingsHandler;
