#!/usr/bin/env node
/**
 * scripts/storeMap.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * 📍 Store Map — automatic Google-Maps-link conversion + the iframe safety gate.
 *
 * NO GOOGLE IFRAME: Google blocks framing of its Maps pages, so the map is now
 * rendered with Leaflet + OpenStreetMap. Everything here is therefore about
 * COORDINATES — resolved from the admin lat/lng or extracted from any pasted
 * Google Maps link. The "Open in Google Maps" button is a normal link and still
 * points at Google.
 * Run: node scripts/storeMap.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  parseLat, parseLng, parseRating, isShortMapLink,
  extractLatLng, extractPlaceName, resolveCoordinates, linkCoordStatus, buildDirectionsUrl,
  telHref, normalizeStoreMap, computeOpenNow, STORE_MAP_DEFAULTS,
} from "../src/lib/storeMap.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const PLACE = "https://www.google.com/maps/place/House+Electronics/@32.7644,-6.3986,17z/data=!3m1!4b1!4m6!3m5!1s0xda!8m2!3d32.7644!4d-6.3986";
const SHORT = "https://maps.app.goo.gl/aBcDeF123";
const EMBED = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3";

console.log("1) Coordinate & rating parsing:");
{
  ok("numeric string accepted", parseLat("33.5731") === 33.5731);
  ok("negative longitude accepted", parseLng("-7.5898") === -7.5898);
  ok("zero is valid", parseLat(0) === 0);
  ok("empty → null", parseLat("") === null && parseLng(null) === null);
  ok("out of range → null", parseLat(91) === null && parseLng(181) === null);
  ok("rating parsed and rounded", parseRating("4.94") === 4.9);
  ok("rating out of range → null", parseRating(6) === null && parseRating(0) === null && parseRating("") === null);
}

console.log("2) Link classification (no embed URLs anymore):");
{
  ok("short link recognised", isShortMapLink(SHORT) && isShortMapLink("https://goo.gl/maps/x"));
  ok("normal link is not a short link", isShortMapLink(PLACE) === false);
  ok("link with coordinates → ok", linkCoordStatus(PLACE) === "ok");
  ok("short link → needs_resolve", linkCoordStatus(SHORT) === "needs_resolve");
  ok("google link without coords → needs_resolve", linkCoordStatus("https://www.google.com/maps/place/House+Electronics/") === "needs_resolve");
  ok("third-party link → unsupported", linkCoordStatus("https://evil.example.com/x") === "unsupported");
  ok("javascript: → unsupported", linkCoordStatus("javascript:alert(1)") === "unsupported");
  ok("empty → empty", linkCoordStatus("") === "empty");
}

console.log("3) Coordinate / place-name extraction from real link shapes:");
{
  ok("!3d/!4d preferred (exact pin)", (() => { const c = extractLatLng(PLACE); return c.lat === 32.7644 && c.lng === -6.3986; })());
  ok("@lat,lng viewport form", (() => { const c = extractLatLng("https://www.google.com/maps/@33.5731,-7.5898,15z"); return c.lat === 33.5731 && c.lng === -7.5898; })());
  ok("?q=lat,lng form", (() => { const c = extractLatLng("https://maps.google.com/?q=34.02,-6.83"); return c.lat === 34.02 && c.lng === -6.83; })());
  ok("no coordinates → null", extractLatLng("https://www.google.com/maps/place/Some+Shop/") === null);
  ok("place name decoded", extractPlaceName("https://www.google.com/maps/place/House+Electronics/@1,2,17z") === "House Electronics");
  ok("place name url-decoded", extractPlaceName("https://www.google.com/maps/place/Caf%C3%A9%20Central/") === "Café Central");
  ok("no place segment → null", extractPlaceName("https://www.google.com/maps/@1,2,15z") === null);
}

console.log("4) resolveCoordinates — what the Leaflet map centres on:");
{
  ok("explicit lat/lng wins", (() => { const c = resolveCoordinates({ latitude: "33.5731", longitude: "-7.5898", embedUrl: PLACE }); return c.lat === 33.5731 && c.lng === -7.5898; })());
  ok("falls back to coordinates inside the pasted link", (() => { const c = resolveCoordinates({ embedUrl: PLACE }); return c.lat === 32.7644 && c.lng === -6.3986; })());
  ok("short link alone → null (needs resolving first)", resolveCoordinates({ embedUrl: SHORT }) === null);
  ok("nothing configured → null (map hidden, never broken)", resolveCoordinates({}) === null);
  ok("half a coordinate pair → falls through", resolveCoordinates({ latitude: "33.5" }) === null);
  ok("out-of-range coordinates rejected", resolveCoordinates({ latitude: "95", longitude: "10" }) === null);
  ok("address alone gives no map position", resolveCoordinates({ address: "12 Rue Hassan II" }) === null);
}

console.log("6) Directions button:");
{
  ok("explicit button URL wins", buildDirectionsUrl({ buttonUrl: "https://x.test/a", latitude: 1, longitude: 2 }) === "https://x.test/a");
  ok("configured coordinates drive navigation", buildDirectionsUrl({ latitude: 33.5731, longitude: -7.5898 }) === "https://www.google.com/maps/search/?api=1&query=33.5731,-7.5898");
  ok("coordinates inside the link are used too", buildDirectionsUrl({ embedUrl: PLACE }) === "https://www.google.com/maps/search/?api=1&query=32.7644,-6.3986");
  ok("a coordinate-less short link still opens directly", buildDirectionsUrl({ embedUrl: SHORT }) === SHORT);
  ok("address fallback encoded", buildDirectionsUrl({ address: "Rue A, Casa" }).includes("query=Rue%20A%2C%20Casa"));
  ok("nothing configured → null", buildDirectionsUrl({}) === null);
}

console.log("7) Phone (Call button visibility) + normalization:");
{
  ok("formatted phone → tel: digits", telHref("+212 6 12-34-56-78") === "tel:+212612345678");
  ok("no phone → null (Call button hidden)", telHref("") === null && telHref(null) === null);
  ok("non-numeric → null", telHref("---") === null);

  const n = normalizeStoreMap({ title: "  House Electronics  ", phone: 612345678, rating: "4.9" });
  ok("strings trimmed", n.title === "House Electronics");
  ok("numbers coerced", n.phone === "612345678");
  ok("rating normalized to a number", n.rating === 4.9);
  ok("button texts default", n.buttonText === STORE_MAP_DEFAULTS.buttonText && n.callText === STORE_MAP_DEFAULTS.callText);
  ok("garbage input never throws", (() => { try { normalizeStoreMap(null); normalizeStoreMap("x"); return true; } catch { return false; } })());
  ok("all configurable fields present", ["title","subtitle","embedUrl","latitude","longitude","storeName","address","phone","hours","rating","buttonText","callText","buttonUrl"].every((k) => k in n));
}

console.log("8) No Google embed/iframe surface remains:");
{
  const api = Object.keys(await import("../src/lib/storeMap.js"));
  ok("buildEmbedUrl removed", !api.includes("buildEmbedUrl"));
  ok("toEmbedUrl removed", !api.includes("toEmbedUrl"));
  ok("isSafeMapEmbedUrl removed", !api.includes("isSafeMapEmbedUrl"));
  ok("embedFromLatLng removed", !api.includes("embedFromLatLng"));
  ok("resolveCoordinates is the map input", api.includes("resolveCoordinates"));
  // The directions BUTTON is a plain link and may still target Google.
  ok("directions link still points at Google", buildDirectionsUrl({ latitude: 1, longitude: 2 }).startsWith("https://www.google.com/maps/search/"));
}

console.log("9) Open-now badge computed from free-text hours:");
{
  const at = (h, m = 0, day = 3) => { const d = new Date(2026, 7, 5, h, m); return d.getDay() === day ? d : d; };
  ok("inside EN range → open", computeOpenNow("Mon–Sat • 09:00–20:00", at(14)) === true);
  ok("before opening → closed", computeOpenNow("Mon–Sat • 09:00–20:00", at(7)) === false);
  ok("after closing → closed", computeOpenNow("Mon–Sat • 09:00–20:00", at(21)) === false);
  ok("FR format with h", computeOpenNow("Lun-Sam 9h-20h", at(10)) === true);
  ok("time-only applies every day", computeOpenNow("09:00 - 20:00", at(12)) === true);
  ok("minutes respected", computeOpenNow("09:30–10:00", at(9, 15)) === false && computeOpenNow("09:30–10:00", at(9, 45)) === true);
  ok("day outside the range → closed", computeOpenNow("Mon–Fri 09:00–20:00", new Date(2026, 7, 2, 12)) === false); // Sunday
  ok("overnight range wraps midnight", computeOpenNow("20:00–02:00", at(23)) === true && computeOpenNow("20:00–02:00", at(10)) === false);
  ok("unparseable text → null (badge hidden)", computeOpenNow("sur rendez-vous") === null);
  ok("empty → null", computeOpenNow("") === null && computeOpenNow(null) === null);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
