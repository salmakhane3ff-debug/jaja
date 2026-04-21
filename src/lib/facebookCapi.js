/**
 * src/lib/facebookCapi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side helper for the Facebook Conversions API (CAPI).
 *
 * CAPI sends events directly from our server to Facebook's Graph API,
 * bypassing ad blockers and iOS privacy restrictions that block the browser
 * pixel (~30-40% of traffic). Used alongside the browser pixel with matching
 * event_id for deduplication (Facebook counts it once).
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api/
 * ─────────────────────────────────────────────────────────────────────────────
 */

import crypto from 'crypto';

const GRAPH_API_VERSION = 'v19.0';

/**
 * SHA-256 hash a PII string for Facebook.
 * All PII (email, phone, city…) must be hashed before sending.
 * Normalisation: lowercase + trim (Facebook requirement).
 *
 * @param {string} value  Raw PII value
 * @returns {string|null} Hex-encoded SHA-256 hash, or null if empty
 */
export function sha256(value) {
  if (!value) return null;
  return crypto
    .createHash('sha256')
    .update(String(value).toLowerCase().trim())
    .digest('hex');
}

/**
 * Send one or more server events to the Facebook Conversions API.
 *
 * @param {object[]} events      Array of server event objects
 * @param {string}   pixelId     Facebook Pixel / Dataset ID
 * @param {string}   accessToken Conversions API access token (from Events Manager)
 * @returns {Promise<object>}    Facebook Graph API JSON response
 * @throws {Error}               On non-2xx responses
 */
export async function sendCapiEvents(events, pixelId, accessToken) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`
    + `?access_token=${encodeURIComponent(accessToken)}`;

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ data: events }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Facebook CAPI ${res.status}: ${text}`);
  }

  return res.json();
}
