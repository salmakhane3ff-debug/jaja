/**
 * src/lib/storeMap.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURE helpers for the 📍 Store Map homepage section.
 *
 * NO GOOGLE IFRAME. Google blocks framing of its Maps pages, which produced a
 * broken map, so the section now renders with Leaflet + OpenStreetMap tiles
 * (no API key, no embed URL). Everything here is therefore about COORDINATES:
 * the map needs a { lat, lng }, which is resolved from the admin latitude /
 * longitude fields or extracted from any Google Maps link the admin pasted.
 *
 * The "Open in Google Maps" BUTTON still links to Google — that is a normal
 * link, not an iframe, so it works fine.
 *
 * No React, no DOM, no I/O → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ALLOWED_HOSTS = new Set([
  'google.com', 'www.google.com', 'maps.google.com',
  'maps.googleapis.com', 'www.google.co.ma', 'google.co.ma',
]);
/** Short-link hosts that must be resolved server-side (they are redirects). */
export const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co']);

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

const urlOf = (s) => { try { return new URL(str(s)); } catch { return null; } };

/** True when the link is a Google short link needing a server-side redirect follow. */
export function isShortMapLink(url) {
  const u = urlOf(url);
  return !!u && SHORT_HOSTS.has(u.hostname.toLowerCase());
}

/**
 * Pull coordinates out of any Google Maps URL shape.
 * Priority: !3d/!4d (the exact place pin) → @lat,lng (viewport) → q=/ll=/center=.
 * @returns {{lat:number,lng:number}|null}
 */
export function extractLatLng(url) {
  const s = str(url);
  if (!s) return null;
  const pats = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|center|daddr|sll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
  ];
  for (const re of pats) {
    const m = s.match(re);
    if (!m) continue;
    const lat = parseLat(m[1]);
    const lng = parseLng(m[2]);
    if (lat !== null && lng !== null) return { lat, lng };
  }
  return null;
}

/** Human place name from `/maps/place/<Name>/…`, or null. */
export function extractPlaceName(url) {
  const u = urlOf(url);
  if (!u) return null;
  const m = u.pathname.match(/\/maps\/place\/([^/@]+)/);
  if (!m) return null;
  try {
    const name = decodeURIComponent(m[1]).replace(/\+/g, ' ').trim();
    return name && !/^-?\d+(\.\d+)?,/.test(name) ? name : null;
  } catch { return null; }
}

/**
 * The coordinates the Leaflet map should centre on, or null when the section is
 * not configured yet. Priority: explicit admin latitude/longitude → coordinates
 * embedded in the pasted Google Maps link.
 * @returns {{lat:number, lng:number}|null}
 */
export function resolveCoordinates(data = {}) {
  const lat = parseLat(data.latitude);
  const lng = parseLng(data.longitude);
  if (lat !== null && lng !== null) return { lat, lng };
  return extractLatLng(data.embedUrl) || null;
}

/**
 * Admin hint for a pasted link — what, if anything, we could get out of it.
 * 'ok'            → coordinates were read straight from the link
 * 'needs_resolve' → a short link; resolve it server-side (it is a redirect)
 * 'unsupported'   → not a Google Maps link with usable coordinates
 */
export function linkCoordStatus(input) {
  const s = str(input);
  if (!s) return 'empty';
  if (extractLatLng(s)) return 'ok';
  if (isShortMapLink(s)) return 'needs_resolve';
  const u = urlOf(s);
  if (u && ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return 'needs_resolve';
  return 'unsupported';
}

/**
 * Target of the "Open in Google Maps" button, or null when unconfigured.
 * Priority: explicit button URL → the pasted link (short links open fine) →
 * coordinates → address.
 */
export function buildDirectionsUrl(data = {}) {
  const explicit = str(data.buttonUrl);
  if (explicit) return explicit;

  // Coordinates give the most accurate navigation target.
  const coords = resolveCoordinates(data);
  if (coords) return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;

  // Otherwise the pasted Google link opens perfectly on its own (it is a link,
  // not an iframe), and finally the address.
  const pasted = str(data.embedUrl);
  const u = urlOf(pasted);
  if (pasted && (isShortMapLink(pasted) || (u && ALLOWED_HOSTS.has(u.hostname.toLowerCase())))) return pasted;

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

// ── "Open now" from free-text working hours ──────────────────────────────────
// Understands the common shapes an admin actually types, in EN or FR:
//   "Mon–Sat • 09:00–20:00"   "Lun-Sam 9h-20h"   "09:00 - 20:00"
// Returns null when the text cannot be parsed confidently — the badge is then
// hidden rather than guessing whether the store is open.
const DAY_TOKENS = [
  ['sun', 'dim'], ['mon', 'lun'], ['tue', 'mar'], ['wed', 'mer'],
  ['thu', 'jeu'], ['fri', 'ven'], ['sat', 'sam'],
];

function dayIndexOf(token) {
  const t = token.toLowerCase();
  for (let i = 0; i < DAY_TOKENS.length; i++) {
    if (DAY_TOKENS[i].some((p) => t.startsWith(p))) return i;
  }
  return -1;
}

/** Minutes since midnight from "9", "9h", "09:00", "9h30". */
function toMinutes(h, m) {
  const hh = Number(h), mm = Number(m || 0);
  if (!Number.isFinite(hh) || hh < 0 || hh > 24) return null;
  if (!Number.isFinite(mm) || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/**
 * @returns {boolean|null} true = open, false = closed, null = unknown/unparseable
 */
export function computeOpenNow(hours, now = new Date()) {
  const s = str(hours);
  if (!s) return null;

  const time = s.match(/(\d{1,2})\s*[:h.]?\s*(\d{2})?\s*(?:[-–—]|à|to|–)\s*(\d{1,2})\s*[:h.]?\s*(\d{2})?/i);
  if (!time) return null;
  const open = toMinutes(time[1], time[2]);
  const close = toMinutes(time[3], time[4]);
  if (open === null || close === null) return null;

  // Optional day range ("Mon–Sat", "Lun-Sam"). Absent → every day.
  const days = s.match(/([a-zA-Zéû]{3,9})\s*[-–—]\s*([a-zA-Zéû]{3,9})/);
  if (days) {
    const from = dayIndexOf(days[1]);
    const to = dayIndexOf(days[2]);
    if (from >= 0 && to >= 0) {
      const today = now.getDay();
      const inRange = from <= to
        ? today >= from && today <= to
        : today >= from || today <= to;   // wraps the week (e.g. Sat–Mon)
      if (!inRange) return false;
    }
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();
  return close > open
    ? nowMin >= open && nowMin < close
    : nowMin >= open || nowMin < close;   // crosses midnight
}

export const STORE_MAP_DEFAULTS = Object.freeze({
  title: 'Notre magasin',
  subtitle: 'Venez nous rendre visite',
  embedUrl: '',
  latitude: '',
  longitude: '',
  storeName: '',
  address: '',
  city: '',
  phone: '',
  hours: '',
  rating: '',
  buttonText: '📍 Ouvrir dans Google Maps',
  callText: '📞 Appeler',
  buttonUrl: '',
});

/** Rating as a 0–5 number, or null when unset/invalid. */
export function parseRating(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 5) return null;
  return Math.round(n * 10) / 10;
}

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
    city:      str(d.city),
    phone:     str(d.phone),
    hours:     str(d.hours),
    rating:    parseRating(d.rating),
    buttonText: str(d.buttonText) || STORE_MAP_DEFAULTS.buttonText,
    callText:   str(d.callText) || STORE_MAP_DEFAULTS.callText,
    buttonUrl:  str(d.buttonUrl),
  };
}
