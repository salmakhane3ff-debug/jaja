/**
 * src/lib/bemobApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side helper for sending S2S conversion postbacks to Bemob.
 *
 * How Bemob postbacks work:
 *   Bemob's panel gives the merchant a postback URL template containing
 *   literal placeholders, e.g.:
 *     https://xxxxx.bemobtrk.com/postback?cid=REPLACE&payout=OPTIONAL&txid=REPLACE&status=REPLACE
 *   "cid" (click ID) is the only obligatory parameter; "payout", "txid", and
 *   "status" are optional and only sent if the admin's template includes
 *   them. We never invent Bemob's URL shape — the admin pastes their own
 *   template (copied from the Bemob panel) into the integrations settings,
 *   and this module's job is only to fill in the values for whichever named
 *   parameters are actually present in that template.
 *
 *   Substitution is done by matching the parameter NAME in the query string
 *   (cid / payout / txid / status), not by the order placeholders appear in.
 *   "REPLACE" is reused by Bemob for more than one parameter (e.g. both cid
 *   and txid), so matching by occurrence order would risk writing an order
 *   ID into the wrong slot — matching by name is unambiguous regardless of
 *   which placeholder word a given parameter happens to use.
 *
 * This module is intentionally decoupled from:
 *   - the Setting/integrations table (the caller resolves config and passes
 *     it in as plain arguments — same separation facebookCapi.js uses)
 *   - order business logic (no Prisma calls, no order status concepts here)
 *
 * Docs: https://docs.bemob.com/en/postback-settings-of-affiliate-network
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Recognised Bemob query parameter names and what each one is filled from.
// Only parameters actually present in the admin's template are touched —
// a template missing "status", for example, is left exactly as configured.
const PARAM_SOURCES = {
  cid:    'clickId',
  payout: 'payout',
  txid:   'orderId',
  status: 'status',
};

/**
 * Fill an admin-configured Bemob postback URL template with real values.
 *
 * Looks for `cid=`, `payout=`, `txid=`, `status=` in the template's query
 * string (case-sensitive, matching Bemob's own documented parameter names)
 * and replaces whatever placeholder value follows (REPLACE, OPTIONAL, or
 * any other literal) with the corresponding value from `params`. Parameters
 * not present in the template are left untouched — nothing is appended.
 *
 * @param {string} template — admin-configured postback URL (from the Bemob
 *                             panel), containing REPLACE/OPTIONAL or similar.
 * @param {object} params
 * @param {string} params.clickId    — required; Bemob's click ID ("cid").
 * @param {number} [params.payout]   — conversion revenue, if available.
 * @param {string} [params.orderId]  — our order ID, for the "txid" slot.
 * @param {string} [params.status]   — conversion status, for the "status"
 *                                      slot (e.g. "approved"), if the
 *                                      template uses Bemob's status feature.
 * @returns {string} the postback URL with known parameters filled in.
 * @throws {Error} if template or clickId is missing, or cid is not present
 *                  in the template's query string.
 */
export function buildPostbackUrl(template, { clickId, payout, orderId, status } = {}) {
  if (!template) {
    throw new Error('Bemob postback URL template is not configured');
  }
  if (!clickId) {
    throw new Error('clickId is required to build a Bemob postback URL');
  }

  const values = {
    clickId,
    payout: payout != null ? String(payout) : '',
    orderId: orderId || '',
    status: status || '',
  };

  let url = template;
  let cidPresent = false;

  for (const [paramName, valueKey] of Object.entries(PARAM_SOURCES)) {
    const pattern = new RegExp(`([?&]${paramName}=)([^&]*)`);
    if (pattern.test(url)) {
      if (paramName === 'cid') cidPresent = true;
      url = url.replace(pattern, (_match, prefix) => prefix + encodeURIComponent(values[valueKey]));
    }
  }

  if (!cidPresent) {
    throw new Error('Bemob postback URL template has no "cid" parameter — cannot attach click ID');
  }

  return url;
}

/**
 * Send the Bemob conversion postback.
 *
 * GET request, per Bemob's documented postback mechanism (tracking
 * platforms call our endpoints the same way — see the existing
 * /api/tracking/postback receiver in this codebase for the inbound analog).
 *
 * @param {string} template — admin-configured postback URL template.
 * @param {object} params    — see buildPostbackUrl.
 * @returns {Promise<{ ok: true, status: number }>} on a 2xx response.
 * @throws {Error} on a missing template/clickId, or non-2xx response.
 */
export async function sendBemobPostback(template, params) {
  const url = buildPostbackUrl(template, params);

  const res = await fetch(url, { method: 'GET' });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bemob postback ${res.status}: ${text}`);
  }

  return { ok: true, status: res.status };
}
