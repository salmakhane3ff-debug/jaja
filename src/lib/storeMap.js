/**
 * src/lib/storeMap.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURE helpers for the 📍 Store Map homepage section.
 *
 * SECURITY: the embed URL ends up in an <iframe src>, so it is validated against
 * a Google Maps allow-list. Anything else (a typo, a pasted third-party widget,
 * a `javascript:` URL) is rejected and the section falls back to building the
 * embed from the configured coordinates. Admin input is never trusted blindly.
 *
 * No React, no DOM, no I/O → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ALLOWED_HOSTS = new Set([
  'google.com', 'www.google.com', 'maps.google.com',
  'maps.googleapis.com', 'www.google.co.ma', 'google.co.ma',
]);

const str = (v) => String(v ?? '').trim();

/** Finite latitude/longitude, or null. Accepts numbers and numeric strings. */
export function parseCoord(value, max) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > max) return null;
  return n;
}
export const parseLat = (v) => parseCoord(v, 90);
export const parseLng = (v) => parseCoord(v, 180);

/** True when `url` is an http(s) Google Maps URL safe to put in an iframe. */
export function isSafeMapEmbedUrl(url) {
  const s = str(url);
  if (!s) return false;
  let u;
  try { u = new URL(s); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  return ALLOWED_HOSTS.has(u.hostname.toLowerCase());
}

/**
 * The iframe URL for the section, or null when nothing is configured.
 * Priority: a valid admin embed URL → coordinates → address search.
 * Coordinate embeds use `q=lat,lng`, which renders Google's standard RED marker.
 */
export function buildEmbedUrl(data = {}) {
  if (isSafeMapEmbedUrl(data.embedUrl)) return str(data.embedUrl);

  const lat = parseLat(data.latitude);
  const lng = parseLng(data.longitude);
  if (lat !== null && lng !== null) {
    return `https://www.google.com/maps?q=${lat},${lng}&z=16&hl=fr&output=embed`;
  }
  const address = str(data.address);
  if (address) {
    return `https://www.google.com/maps?q=${encodeURIComponent(address)}&z=16&hl=fr&output=embed`;
  }
  return null;
}

/**
 * Target of the "📍 Open in Google Maps" button, or null when unconfigured.
 * Priority: explicit admin button URL → coordinates → address.
 */
export function buildDirectionsUrl(data = {}) {
  const explicit = str(data.buttonUrl);
  if (explicit) return explicit;

  const lat = parseLat(data.latitude);
  const lng = parseLng(data.longitude);
  if (lat !== null && lng !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const address = str(data.address);
  if (address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return null;
}

/** Digits-only tel: href (keeps a leading +), or null. */
export function telHref(phone) {
  const s = str(phone);
  if (!s) return null;
  const cleaned = s.replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : null;
}

export const STORE_MAP_DEFAULTS = Object.freeze({
  title: 'Notre magasin',
  subtitle: 'Venez nous rendre visite',
  embedUrl: '',
  latitude: '',
  longitude: '',
  storeName: '',
  address: '',
  phone: '',
  hours: '',
  buttonText: '📍 Ouvrir dans Google Maps',
  buttonUrl: '',
});

/** Normalize stored section data for rendering (never throws). */
export function normalizeStoreMap(raw = {}) {
  const d = raw && typeof raw === 'object' ? raw : {};
  return {
    title:     str(d.title),
    subtitle:  str(d.subtitle),
    embedUrl:  str(d.embedUrl),
    latitude:  str(d.latitude),
    longitude: str(d.longitude),
    storeName: str(d.storeName),
    address:   str(d.address),
    phone:     str(d.phone),
    hours:     str(d.hours),
    buttonText: str(d.buttonText) || STORE_MAP_DEFAULTS.buttonText,
    buttonUrl:  str(d.buttonUrl),
  };
}
