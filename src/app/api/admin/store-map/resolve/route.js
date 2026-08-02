/**
 * POST /api/admin/store-map/resolve  { url }
 * Resolve a Google Maps SHORT link (maps.app.goo.gl / goo.gl) into coordinates
 * so the Store Map section can build a real embed URL. Short links are HTTP
 * redirects, so this cannot be done client-side.
 *
 * SSRF-safe by construction:
 *   • admin-authenticated
 *   • only the Google short-link hosts are fetched (allow-list, re-checked on
 *     every hop), so this can never be pointed at an internal address
 *   • `redirect: manual` — we read the Location header, never the response body
 *   • hop limit + timeout
 * Returns only the extracted coordinates + the final URL.
 */
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { isShortMapLink, extractLatLng, SHORT_HOSTS } from '@/lib/storeMap';

const MAX_HOPS = 5;
const TIMEOUT_MS = 6000;
const GOOGLE_HOSTS = /(^|\.)google\.(com|[a-z]{2}|co\.[a-z]{2})$/i;

/** A hop is followed only if it is a Google short link or a Google Maps host. */
function hopAllowed(u) {
  const h = u.hostname.toLowerCase();
  return SHORT_HOSTS.has(h) || GOOGLE_HOSTS.test(h);
}

export const POST = withAdminAuth(async (req) => {
  try {
    const { url } = await req.json().catch(() => ({}));
    const input = String(url || '').trim();
    if (!isShortMapLink(input)) {
      return Response.json({ error: 'Lien court Google Maps attendu.', code: 'NOT_SHORT_LINK' }, { status: 400 });
    }

    let current = input;
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      let u;
      try { u = new URL(current); } catch { break; }
      if (u.protocol !== 'https:' || !hopAllowed(u)) break; // never leave the allow-list

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      let res;
      try {
        res = await fetch(u.toString(), { method: 'GET', redirect: 'manual', signal: ctrl.signal });
      } finally { clearTimeout(timer); }

      const loc = res.headers.get('location');
      const coords = extractLatLng(loc || '') || extractLatLng(current);
      if (coords) {
        return Response.json({
          latitude: String(coords.lat), longitude: String(coords.lng),
          resolvedFrom: loc || current,
        });
      }
      if (!loc) break;
      current = new URL(loc, u).toString();
    }

    return Response.json(
      { error: "Impossible d'extraire les coordonnées de ce lien. Ouvrez-le dans Google Maps et copiez la latitude / longitude.", code: 'UNRESOLVED' },
      { status: 422 },
    );
  } catch (err) {
    console.error('admin/store-map/resolve error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});
