/**
 * src/lib/services/settingsService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD for the `settings` table.
 *
 * Row keys (matching old MongoDB "_id" strings):
 *   "store"        → storefront info (name, logo, currency, contact)
 *   "payment"      → gateway credentials (Stripe, Razorpay, …)
 *   "delivery"     → fulfilment timing in hours
 *   "integrations" → Cloudinary, social links, blog, …
 *
 * All settings are stored in a JSONB `data` column.
 * The service unwraps the column so callers get plain objects.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

// ── Generic helpers ───────────────────────────────────────────────────────────

/**
 * Fetch the JSONB data for a settings row.
 * Returns {} when the row does not exist.
 */
export async function getSettings(type) {
  const row = await prisma.setting.findUnique({ where: { id: type } });
  return row?.data ?? {};
}

/**
 * Create-or-update a settings row with the given data object.
 * Strips meta keys (_id, id, createdAt, updatedAt) before saving.
 * Returns the saved data object.
 */
export async function upsertSettings(type, data) {
  // Remove any meta keys that shouldn't be persisted
  const { _id, id: _id2, createdAt: _createdAt, updatedAt: _updatedAt, ...clean } = data ?? {};

  const row = await prisma.setting.upsert({
    where:  { id: type },
    update: { data: clean },
    create: { id: type, data: clean },
  });
  return row.data;
}

// ── Specialised getters (shared by multiple routes) ───────────────────────────

/** Returns `{ currencySymbol, storeCurrency }` from the "store" settings row. */
export async function getStoreSettings() {
  const data = await getSettings('store');
  return {
    currencySymbol: data.currencySymbol ?? '$',
    storeCurrency:  data.storeCurrency  ?? 'USD',
  };
}

/**
 * Returns the delivery timing config from the "delivery" settings row.
 * Falls back to the same defaults that the old MongoDB route used.
 */
export async function getDeliverySettings() {
  const data = await getSettings('delivery');
  return {
    dispatchAfterHours:          data.dispatchAfterHours          ?? 24,
    inTransitAfterHours:         data.inTransitAfterHours         ?? 48,
    outForDeliveryAfterHours:    data.outForDeliveryAfterHours    ?? 96,
    deliveredAfterHours:         data.deliveredAfterHours         ?? 120,
    autoUpdateStatus:            data.autoUpdateStatus            ?? true,
  };
}

/**
 * Save delivery timing settings.
 * Validates that the hour sequence is strictly ascending before saving.
 * Returns { error } on validation failure, or the saved data on success.
 */
export async function upsertDeliverySettings({
  dispatchAfterHours,
  inTransitAfterHours,
  outForDeliveryAfterHours,
  deliveredAfterHours,
  autoUpdateStatus,
}) {
  if (
    dispatchAfterHours        < 0 ||
    inTransitAfterHours       < 0 ||
    outForDeliveryAfterHours  < 0 ||
    deliveredAfterHours       < 0
  ) {
    return { error: 'Hours cannot be negative' };
  }
  if (inTransitAfterHours <= dispatchAfterHours) {
    return { error: 'In-transit time must be after dispatch time' };
  }
  if (outForDeliveryAfterHours <= inTransitAfterHours) {
    return { error: 'Out-for-delivery time must be after in-transit time' };
  }
  if (deliveredAfterHours <= outForDeliveryAfterHours) {
    return { error: 'Delivered time must be after out-for-delivery time' };
  }

  const data = {
    dispatchAfterHours,
    inTransitAfterHours,
    outForDeliveryAfterHours,
    deliveredAfterHours,
    autoUpdateStatus: autoUpdateStatus ?? true,
    defaultSettings:  true,
  };

  await upsertSettings('delivery', data);
  return data;
}
