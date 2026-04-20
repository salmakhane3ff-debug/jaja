/**
 * /api/setting
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  ?type=store|delivery|homepage_layout|…  → public (storefront rendering)
 * GET  ?type=integrations|payment              → admin only (contains API keys)
 * POST ?type=…                                 → admin only (all writes)
 *
 * AUTHORIZATION MATRIX:
 *   Public types (storefront reads):
 *     store, delivery, homepage_layout, ui-control, discount_rules,
 *     conversion_optimization, spin_wheel_config, bank-settings (checkout)
 *   Admin-only types (sensitive data):
 *     integrations, payment, and any unrecognised type (safe default)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getSettingsHandler,
  upsertSettingsHandler,
} from '@/lib/controllers/settingsController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

// Types the storefront may read without authentication
const PUBLIC_TYPES = new Set([
  'store',
  'delivery',
  'homepage_layout',
  'ui-control',
  'discount_rules',
  'conversion_optimization',
  'conversion-settings',   // storefront conversion badges
  'spin_wheel_config',
  'bank-settings',         // checkout needs payment method info
  'spin-wheel',            // spin-wheel widget config
  'feedback-settings',     // homepage reviews section
  'support-benefits',      // support/trust badges section
  'preloader',             // preloader config
  'footer',                // footer content
  'social',                // social links
  'language-settings',     // store default language (storefront reads on first visit)
]);

export function GET(req) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'store';

  if (!PUBLIC_TYPES.has(type)) {
    // integrations (API keys), payment, unknown types → admin only
    return withAdminAuth(getSettingsHandler)(req);
  }
  return getSettingsHandler(req);
}

// ALL writes are admin-only regardless of type
export const POST = withAdminAuth(upsertSettingsHandler);
