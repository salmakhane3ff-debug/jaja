/**
 * src/lib/controllers/settingsController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles generic settings (store / payment / integrations) and the dedicated
 * delivery-timing (order-settings) endpoint.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getSettings,
  upsertSettings,
  getDeliverySettings,
  upsertDeliverySettings,
} from '../services/settingsService.js';
import { badRequest, serverError } from '../utils/apiResponse.js';

// ── Generic settings (/api/setting) ──────────────────────────────────────────

/**
 * GET /api/setting?type=store|payment|delivery|integrations
 * Returns the raw settings object (or {} if the row doesn't exist).
 * Mirrors old MongoDB response: the entire settings document.
 */
export async function getSettingsHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'store';

    const data = await getSettings(type);
    // Return an object that looks like the old Mongoose document
    return Response.json({ ...data, _id: type });
  } catch (err) {
    console.error('Settings GET error:', err);
    return serverError('Failed to fetch settings');
  }
}

/**
 * POST /api/setting?type=store|payment|delivery|integrations
 * Body: { ...settingsFields }
 * Upserts the settings row and returns { message, data }.
 */
export async function upsertSettingsHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'store';
    const body = await req.json();

    const saved = await upsertSettings(type, body);
    return Response.json({ message: 'Saved', data: { ...saved, _id: type } });
  } catch (err) {
    console.error('Settings POST error:', err);
    return serverError('Failed to save settings');
  }
}

// ── Delivery timing settings (/api/order-settings) ───────────────────────────

/**
 * GET /api/order-settings
 * Returns the delivery timing config with all timing fields at the top level.
 */
export async function getOrderSettingsHandler() {
  try {
    const data = await getDeliverySettings();
    return Response.json({ ...data, _id: 'delivery' });
  } catch (err) {
    console.error('Order Settings GET error:', err);
    return serverError('Failed to fetch order settings');
  }
}

/**
 * PUT /api/order-settings
 * Body: { dispatchAfterHours, inTransitAfterHours, outForDeliveryAfterHours,
 *         deliveredAfterHours, autoUpdateStatus }
 * Validates the timing sequence before saving.
 */
export async function updateOrderSettingsHandler(req) {
  try {
    const body = await req.json();
    const {
      dispatchAfterHours,
      inTransitAfterHours,
      outForDeliveryAfterHours,
      deliveredAfterHours,
      autoUpdateStatus,
    } = body;

    const result = await upsertDeliverySettings({
      dispatchAfterHours,
      inTransitAfterHours,
      outForDeliveryAfterHours,
      deliveredAfterHours,
      autoUpdateStatus,
    });

    if (result.error) return badRequest(result.error);
    return Response.json({ ...result, _id: 'delivery' });
  } catch (err) {
    console.error('Order Settings PUT error:', err);
    return serverError('Failed to update order settings');
  }
}

/**
 * POST /api/order-settings   (reset to defaults)
 * Deletes the current row and recreates it with factory defaults.
 */
export async function resetOrderSettingsHandler() {
  try {
    const defaults = {
      dispatchAfterHours:       24,
      inTransitAfterHours:      48,
      outForDeliveryAfterHours: 96,
      deliveredAfterHours:      120,
      autoUpdateStatus:         true,
    };

    // upsertDeliverySettings skips validation for the safe defaults
    await upsertDeliverySettings(defaults);
    return Response.json({ ...defaults, defaultSettings: true, _id: 'delivery' }, { status: 201 });
  } catch (err) {
    console.error('Order Settings POST error:', err);
    return serverError('Failed to reset order settings');
  }
}
