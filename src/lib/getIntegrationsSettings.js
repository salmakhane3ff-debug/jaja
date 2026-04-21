import { getSettings } from "./services/settingsService.js";

/**
 * Server-side: reads integrations config directly from DB.
 * Safe to call from layout.jsx (no auth required — server context).
 *
 * Returns only the fields the storefront needs to inject scripts:
 *   - googleAnalytics.enabled / trackingIds
 *   - metaPixel.enabled / pixelIds
 *   - googleTagManager.enabled / containerIds
 *   - googleAds.enabled / conversionIds
 *   - customCode.enabled / scripts
 *
 * NOTE: This does NOT expose secret API keys — only the public-facing
 * tracking IDs that must be embedded in the page HTML anyway.
 */
export async function getIntegrationsSettings() {
  try {
    const data = await getSettings("integrations");
    if (!data || Object.keys(data).length === 0) return null;
    return data;
  } catch {
    return null;
  }
}
