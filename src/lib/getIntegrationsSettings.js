import { getSettings } from "./services/settingsService.js";
import { toPublicIntegrations } from "./meta/config.js";

/**
 * Server-side: reads integrations config from the DB and returns ONLY the
 * public half.
 *
 * THE BOUNDARY. layout.jsx passes this result into client components, and
 * Next.js serialises every client-component prop into the RSC payload embedded
 * in the HTML. This function previously returned the RAW settings row, so
 * `metaPixel.accessToken` (the Conversions API token) and `bemob.postbackUrl`
 * were readable by anyone with View Source.
 *
 * toPublicIntegrations() rebuilds the object by ALLOW-LIST, so a secret added
 * to the settings row later cannot leak by being forgotten here. Server code
 * that genuinely needs the token calls getMetaServerConfig() instead — never
 * this function.
 *
 * Returns null when nothing is configured.
 */
export async function getIntegrationsSettings() {
  try {
    const data = await getSettings("integrations");
    if (!data || Object.keys(data).length === 0) return null;
    return toPublicIntegrations(data);
  } catch {
    return null;
  }
}
