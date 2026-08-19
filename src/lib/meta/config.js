/**
 * src/lib/meta/config.js
 * ─────────────────────────────────────────────────────────────────────────────
 * THE public/private boundary for Meta configuration.
 *
 * Meta settings live in the existing generic `Setting` row `id="integrations"`,
 * under the `metaPixel` sub-key, written by /admin/app-integrations:
 *
 *   metaPixel: {
 *     enabled, pixelIds: [{ name, id }], accessToken, testEventCode,
 *     domainVerificationCode,
 *   }
 *
 * THE LEAK THIS CLOSES: layout.jsx read that row with getIntegrationsSettings()
 * and passed the WHOLE object as a prop to <ScriptInjector>, a client component.
 * Next.js serialises every client-component prop into the RSC payload embedded
 * in the HTML, so `accessToken` was readable by anyone with View Source.
 *
 * From here on there are exactly two accessors and they are not interchangeable:
 *
 *   toPublicMetaConfig(raw) / getMetaPublicConfig()
 *       { enabled, pixelIds: string[] } — validated, de-duplicated, NO secrets.
 *       This is the ONLY shape allowed to cross into a client component.
 *
 *   getMetaServerConfig()
 *       adds accessToken + testEventCode. SERVER ONLY. Never returned from a
 *       route, never passed as a prop, never logged.
 *
 * `toPublicMetaConfig` is pure so tests can prove the secret cannot survive it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getSettings } from '../services/settingsService.js';

/** Meta pixel/dataset IDs are numeric strings, currently 15-16 digits. */
const PIXEL_ID_RE = /^[0-9]{15,16}$/;

/** Keys that must never appear in anything handed to the browser. */
export const SECRET_KEYS = Object.freeze(['accessToken', 'testEventCode']);

/** True when the value looks like a real Meta pixel ID. */
export function isValidPixelId(id) {
  if (typeof id === 'number') return PIXEL_ID_RE.test(String(id));
  if (typeof id !== 'string') return false;
  return PIXEL_ID_RE.test(id.trim());
}

/**
 * Validated, de-duplicated pixel IDs, in configuration order.
 *
 * Accepts the admin's `[{ name, id }]` shape and a plain string array. Anything
 * that is not a well-formed pixel ID is DROPPED rather than passed to
 * fbq('init', …) — an arbitrary string there silently breaks the whole pixel.
 *
 * @returns {string[]}
 */
export function normalizePixelIds(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const entry of list) {
    const value = entry && typeof entry === 'object' ? entry.id : entry;
    const id = typeof value === 'number' ? String(value) : String(value ?? '').trim();
    if (!isValidPixelId(id)) continue;
    if (out.includes(id)) continue;            // duplicates would double every event
    out.push(id);
  }
  return out;
}

/**
 * The ONLY Meta shape a client component may receive.
 *
 * Built by allow-list, not by deletion: a future secret added to the settings
 * row cannot leak by being forgotten here.
 *
 * @returns {{enabled: boolean, pixelIds: string[]}}
 */
export function toPublicMetaConfig(rawIntegrations) {
  const meta = rawIntegrations && typeof rawIntegrations === 'object'
    ? rawIntegrations.metaPixel
    : null;

  const pixelIds = normalizePixelIds(meta?.pixelIds);
  // Enabled means "actually able to fire": a flag with no usable pixel is off.
  const enabled = Boolean(meta?.enabled) && pixelIds.length > 0;

  return { enabled, pixelIds: enabled ? pixelIds : [] };
}

/**
 * Sanitise the WHOLE integrations object for client use.
 *
 * ScriptInjector still needs GA/GTM/Ads/custom-code, so this rebuilds that
 * object by allow-list too — `metaPixel.accessToken`, `bemob.postbackUrl` and
 * anything else server-side never survive the copy.
 */
export function toPublicIntegrations(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const idList = (v) => (Array.isArray(v) ? v.filter((x) => x && x.id).map((x) => ({ id: String(x.id) })) : []);

  return {
    googleAnalytics: {
      enabled: Boolean(raw.googleAnalytics?.enabled),
      trackingIds: idList(raw.googleAnalytics?.trackingIds),
    },
    googleTagManager: {
      enabled: Boolean(raw.googleTagManager?.enabled),
      containerIds: idList(raw.googleTagManager?.containerIds),
    },
    googleAds: {
      enabled: Boolean(raw.googleAds?.enabled),
      conversionIds: idList(raw.googleAds?.conversionIds),
    },
    customCode: {
      enabled: Boolean(raw.customCode?.enabled),
      scripts: Array.isArray(raw.customCode?.scripts)
        ? raw.customCode.scripts.filter((s) => s && s.code).map((s) => ({ code: String(s.code) }))
        : [],
    },
    // Meta is injected by <MetaPixel>, not by ScriptInjector — but the public
    // half travels here so the layout makes exactly one settings read.
    metaPixel: toPublicMetaConfig(raw),
    // Domain verification is a public <meta> tag by definition.
    metaDomainVerification:
      typeof raw.metaPixel?.domainVerificationCode === 'string' && raw.metaPixel.domainVerificationCode.trim()
        ? raw.metaPixel.domainVerificationCode.trim()
        : null,
  };
}

// ── Server-side accessors ────────────────────────────────────────────────────

/** Public Meta config, read server-side. Safe to pass to a client component. */
export async function getMetaPublicConfig() {
  try {
    return toPublicMetaConfig(await getSettings('integrations'));
  } catch {
    return { enabled: false, pixelIds: [] };
  }
}

/**
 * FULL Meta config including the CAPI access token. SERVER ONLY.
 *
 * The token is read here, from the database, at request time — it is never
 * imported into a client module, never embedded in a prop, and never returned
 * by any route. Callers must treat the return value as a secret.
 *
 * @returns {Promise<{enabled:boolean, pixelIds:string[], accessToken:string|null, testEventCode:string|null}>}
 */
export async function getMetaServerConfig() {
  let raw;
  try {
    raw = await getSettings('integrations');
  } catch {
    return { enabled: false, pixelIds: [], accessToken: null, testEventCode: null };
  }

  const pub = toPublicMetaConfig(raw);
  const meta = raw?.metaPixel || {};
  const token = typeof meta.accessToken === 'string' ? meta.accessToken.trim() : '';
  const testCode = typeof meta.testEventCode === 'string' ? meta.testEventCode.trim() : '';

  return {
    ...pub,
    accessToken: token || null,
    testEventCode: testCode || null,
  };
}

/** True when server-side CAPI can actually run. */
export function canSendCapi(cfg) {
  return Boolean(cfg?.enabled && cfg?.pixelIds?.length && cfg?.accessToken);
}
