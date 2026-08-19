/**
 * src/lib/meta/capi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SERVER-ONLY delivery to the Meta Conversions API.
 *
 * Responsibilities kept deliberately narrow: hash PII, build the event
 * envelope, POST it with a bounded timeout, and classify the outcome. It never
 * decides WHETHER an event should be sent (events.js) and never reads settings
 * itself (config.js) — callers pass the resolved credentials in.
 *
 * OUTCOME CLASSIFICATION MATTERS: the Purchase idempotency guard may only mark
 * an order as delivered when Meta actually accepted the request. A timeout, a
 * network failure or a 500 must stay retryable, so this returns a discriminated
 * result instead of throwing, and never conflates "we tried" with "it landed".
 *
 * SECRETS: the access token is passed in the query string as Meta requires, but
 * it is stripped from every error path — no message, log line or return value
 * ever contains it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import crypto from 'crypto';
import {
  normalizePhone, normalizeEmail, splitFullName, normalizeCity,
  normalizeCountry, normalizeZip, isValidFbp, isValidFbc, STORE_CURRENCY,
} from './normalize.js';

/**
 * Graph API version. ONE constant, server-side.
 * v21.0 is current-generation and accepts exactly the payload shape built here
 * (data[], event_name/event_time/event_id/action_source, user_data, custom_data,
 * test_event_code) — no field used below was added or removed after v19.
 */
export const GRAPH_API_VERSION = 'v21.0';

/** Meta is a dependency of a background side effect, never of the response. */
const CAPI_TIMEOUT_MS = 8000;

/** Outcome kinds. `ok` is the ONLY one that may mark an order as delivered. */
export const CAPI_RESULT = Object.freeze({
  OK: 'ok',
  SKIPPED: 'skipped',        // integration disabled / not configured — not a failure
  TIMEOUT: 'timeout',
  NETWORK: 'network_error',
  REJECTED: 'rejected',      // Meta answered, but not 2xx
  MALFORMED: 'malformed_response',
});

/** SHA-256 of an ALREADY-NORMALISED value. Empty input yields null, never a hash of "". */
export function sha256(value) {
  if (value === null || value === undefined) return null;
  const s = String(value);
  if (!s) return null;
  return crypto.createHash('sha256').update(s).digest('hex');
}

/**
 * Build Meta `user_data`.
 *
 * Hashed (Meta requirement): em, ph, fn, ln, ct, st, zp, country, external_id.
 * NOT hashed (Meta requirement): fbp, fbc, client_ip_address, client_user_agent.
 *
 * Every field is normalised first and omitted entirely when absent — an empty
 * string hashed to a real-looking digest is worse than sending nothing, because
 * Meta counts it as a failed match instead of an absent signal.
 */
export function buildUserData({
  email, phone, fullName, firstName, lastName,
  city, state, zip, country,
  externalId, fbp, fbc, clientIp, userAgent,
} = {}) {
  const out = {};

  if (clientIp)   out.client_ip_address = String(clientIp);
  if (userAgent)  out.client_user_agent = String(userAgent);
  if (isValidFbp(fbp)) out.fbp = fbp.trim();
  if (isValidFbc(fbc)) out.fbc = fbc.trim();

  const em = sha256(normalizeEmail(email));
  if (em) out.em = [em];

  const ph = sha256(normalizePhone(phone));
  if (ph) out.ph = [ph];

  let fn = firstName, ln = lastName;
  if ((!fn || !ln) && fullName) {
    const split = splitFullName(fullName);
    fn = fn || split.fn;
    ln = ln || split.ln;
  }
  const fnHash = sha256(typeof fn === 'string' ? normalizeCity(fn) : null);
  const lnHash = sha256(typeof ln === 'string' ? normalizeCity(ln) : null);
  if (fnHash) out.fn = [fnHash];
  if (lnHash) out.ln = [lnHash];

  const ct = sha256(normalizeCity(city));
  if (ct) out.ct = [ct];
  const st = sha256(normalizeCity(state));
  if (st) out.st = [st];
  const zp = sha256(normalizeZip(zip));
  if (zp) out.zp = [zp];

  // Country is only sent when we have a real signal, or alongside other
  // Moroccan address data — never as a blanket default on an empty profile.
  if (country || ct || zp) {
    const cn = sha256(normalizeCountry(country));
    if (cn) out.country = [cn];
  }

  const ext = sha256(externalId ? String(externalId).trim().toLowerCase() : null);
  if (ext) out.external_id = [ext];

  return out;
}

/**
 * Assemble one server event.
 * `custom_data` keys with no value are omitted so Meta never receives nulls.
 */
export function buildServerEvent({
  eventName, eventId, eventSourceUrl, eventTime,
  userData = {}, value, currency = STORE_CURRENCY,
  contentIds, contents, numItems, orderId, contentName,
}) {
  const event = {
    event_name: eventName,
    event_time: Number.isFinite(eventTime) ? Math.trunc(eventTime) : Math.floor(Date.now() / 1000),
    action_source: 'website',
    user_data: userData,
  };
  if (eventId) event.event_id = eventId;
  if (eventSourceUrl) event.event_source_url = eventSourceUrl;

  const custom = { currency };
  if (typeof value === 'number') custom.value = value;
  if (contentIds?.length) { custom.content_ids = contentIds; custom.content_type = 'product'; }
  if (contents?.length) custom.contents = contents;
  if (Number.isFinite(numItems) && numItems > 0) custom.num_items = Math.trunc(numItems);
  if (orderId) custom.order_id = String(orderId);
  if (contentName) custom.content_name = String(contentName);

  // Only attach custom_data when it carries more than the currency default.
  if (Object.keys(custom).length > 1) event.custom_data = custom;

  return event;
}

/**
 * POST events to Meta.
 *
 * Never throws and never leaks the token. Returns a discriminated result the
 * idempotency guard can act on.
 *
 * @returns {Promise<{result:string, status?:number, received?:number, detail?:string}>}
 */
export async function sendCapiEvents(events, { pixelId, accessToken, testEventCode } = {}, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  if (!Array.isArray(events) || events.length === 0) {
    return { result: CAPI_RESULT.SKIPPED, detail: 'no_events' };
  }
  if (!pixelId || !accessToken) {
    return { result: CAPI_RESULT.SKIPPED, detail: 'not_configured' };
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(pixelId)}/events`;
  const body = { data: events };
  if (testEventCode) body.test_event_code = testEventCode;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs || CAPI_TIMEOUT_MS);

  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      // The token travels in the body, never the URL, so it cannot end up in an
      // upstream access log or a redirect Referer.
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, access_token: accessToken }),
      signal: controller.signal,
    });
  } catch (err) {
    return err?.name === 'AbortError'
      ? { result: CAPI_RESULT.TIMEOUT }
      : { result: CAPI_RESULT.NETWORK };
  } finally {
    clearTimeout(timer);
  }

  const status = Number(res?.status) || 0;
  if (status < 200 || status >= 300) {
    // Read a short reason for the SERVER log only — never returned to a client.
    let detail = '';
    try { detail = String(await res.text()).slice(0, 300); } catch { /* body unreadable */ }
    return { result: CAPI_RESULT.REJECTED, status, detail: redactToken(detail, accessToken) };
  }

  let json;
  try { json = await res.json(); } catch { return { result: CAPI_RESULT.MALFORMED, status }; }
  if (!json || typeof json !== 'object') return { result: CAPI_RESULT.MALFORMED, status };

  return { result: CAPI_RESULT.OK, status, received: Number(json.events_received) || 0 };
}

/** Defence in depth: strip the token from anything about to be logged. */
export function redactToken(text, token) {
  if (typeof text !== 'string' || !text) return '';
  let out = text;
  if (token) out = out.split(token).join('[REDACTED]');
  return out.replace(/access_token=[^&"'\s]+/gi, 'access_token=[REDACTED]');
}
