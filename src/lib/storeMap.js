/**
 * src/lib/storeMap.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURE helpers for the 📍 Store Map homepage section.
 *
 * THE EMBED PROBLEM: a normal Google Maps link (`/maps/place/…`, `/maps/@…`)
 * CANNOT be put in an iframe — Google refuses to render it and the visitor sees
 * a broken frame. Only two forms actually embed:
 *     • https://www.google.com/maps/embed?pb=…        (official embed)
 *     • https://…/maps?q=<query>&output=embed         (classic embed, no API key)
 * So `toEmbedUrl()` accepts ANY Google Maps link the admin pastes and converts
 * it: it extracts coordinates (!3d/!4d, @lat,lng, q=/ll=) or the place name and
 * rebuilds a real embed URL. Short `maps.app.goo.gl` links are redirects that
 * cannot be resolved without a network call, so they are reported as
 * `needsResolve` and the admin resolves them with one click (server-side).
 *
 * SECURITY: whatever ends up in the iframe is BUILT here or validated against a
 * Google host allow-list. Admin input is never passed through blindly.
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

/** True when `url` is an http(s) Google Maps URL that genuinely renders in an iframe. */
export function isSafeMapEmbedUrl(url) {
  const u = urlOf(url);
  if (!u) return false;
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return false;
  // Embeddable forms only — a /maps/place link on a Google host is NOT one.
  return u.pathname.startsWith('/maps/embed') || u.searchParams.get('output') === 'embed';
}

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

const embedFromQuery = (q) => `https://www.google.com/maps?q=${q}&z=16&hl=fr&output=embed`;
export const embedFromLatLng = (lat, lng) => embedFromQuery(`${lat},${lng}`);

/**
 * Convert ANY pasted Google Maps link into something that actually embeds.
 * The admin never has to know what an "embed URL" is.
 *
 * @returns {{ url: string|null, status: 'ok'|'empty'|'needs_resolve'|'unsupported', source?: string }}
 *   ok            → `url` is safe to put in an iframe
 *   empty         → nothing pasted
 *   needs_resolve → a maps.app.goo.gl short link; resolve it server-side first
 *   unsupported   → not a Google Maps link we can convert (never render it)
 */
export function toEmbedUrl(input) {
  const s = str(input);
  if (!s) return { url: null, status: 'empty' };

  // Already embeddable (official embed or ?output=embed).
  if (isSafeMapEmbedUrl(s)) return { url: s, status: 'ok', source: 'embed' };

  if (isShortMapLink(s)) {
    // A redirect — coordinates are not in the short URL itself.
    const coords = extractLatLng(s);
    if (coords) return { url: embedFromLatLng(coords.lat, coords.lng), status: 'ok', source: 'coords' };
    return { url: null, status: 'needs_resolve' };
  }

  const u = urlOf(s);
  if (!u || !ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return { url: null, status: 'unsupported' };

  // A normal Google Maps link → rebuild an embeddable URL from its contents.
  const coords = extractLatLng(s);
  if (coords) return { url: embedFromLatLng(coords.lat, coords.lng), status: 'ok', source: 'coords' };

  const place = extractPlaceName(s);
  if (place) return { url: embedFromQuery(encodeURIComponent(place)), status: 'ok', source: 'place' };

  const q = u.searchParams.get('q') || u.searchParams.get('query');
  if (q) return { url: embedFromQuery(encodeURIComponent(q)), status: 'ok', source: 'query' };

  return { url: null, status: 'unsupported' };
}

/**
 * The iframe URL for the section, or null when nothing usable is configured.
 * Priority: converted admin link → coordinates → address. A link that cannot be
 * converted NEVER reaches the iframe (no broken frame for visitors).
 */
export function buildEmbedUrl(data = {}) {
  const converted = toEmbedUrl(data.embedUrl);
  if (converted.status === 'ok') return converted.url;

  const lat = parseLat(data.latitude);
  const lng = parseLng(data.longitude);
  if (lat !== null && lng !== null) return embedFromLatLng(lat, lng);

  const address = str(data.address);
  if (address) return embedFromQuery(encodeURIComponent(address));
  return null;
}

/**
 * Target of the "Open in Google Maps" button, or null when unconfigured.
 * Priority: explicit button URL → the pasted link (short links open fine) →
 * coordinates → address.
 */
export function buildDirectionsUrl(data = {}) {
  const explicit = str(data.buttonUrl);
  if (explicit) return explicit;

  const pasted = str(data.embedUrl);
  if (pasted && (isShortMapLink(pasted) || ALLOWED_HOSTS.has(urlOf(pasted)?.hostname?.toLowerCase()))) {
    if (!isSafeMapEmbedUrl(pasted)) return pasted; // a normal maps link opens perfectly
  }

  const lat = parseLat(data.latitude);
  const lng = parseLng(data.longitude);
  if (lat !== null && lng !== null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

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
    phone:     str(d.phone),
    hours:     str(d.hours),
    rating:    parseRating(d.rating),
    buttonText: str(d.buttonText) || STORE_MAP_DEFAULTS.buttonText,
    callText:   str(d.callText) || STORE_MAP_DEFAULTS.callText,
    buttonUrl:  str(d.buttonUrl),
  };
}
