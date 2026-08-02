#!/usr/bin/env node
/**
 * scripts/storeMap.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * 📍 Store Map — automatic Google-Maps-link conversion + the iframe safety gate.
 *
 * THE BUG THIS PINS: a normal `/maps/place/…` link CANNOT be iframed (Google
 * refuses to render it), so pasting one used to produce a broken frame. Such a
 * link must be CONVERTED into an embeddable `?output=embed` URL — and anything
 * that cannot be converted must never reach the iframe at all.
 * Run: node scripts/storeMap.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  parseLat, parseLng, parseRating, isSafeMapEmbedUrl, isShortMapLink,
  extractLatLng, extractPlaceName, toEmbedUrl, buildEmbedUrl, buildDirectionsUrl,
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

console.log("2) SECURITY — only genuinely embeddable Google URLs pass:");
{
  ok("official /maps/embed accepted", isSafeMapEmbedUrl(EMBED));
  ok("?output=embed accepted", isSafeMapEmbedUrl("https://maps.google.com/maps?q=1,2&output=embed"));
  ok("/maps/place on a Google host REJECTED (cannot be iframed)", isSafeMapEmbedUrl(PLACE) === false);
  ok("third-party host rejected", isSafeMapEmbedUrl("https://evil.example.com/x") === false);
  ok("javascript: rejected", isSafeMapEmbedUrl("javascript:alert(1)") === false);
  ok("data: rejected", isSafeMapEmbedUrl("data:text/html,<script>") === false);
  ok("lookalike host rejected", isSafeMapEmbedUrl("https://google.com.evil.net/maps?output=embed") === false);
  ok("short link recognised", isShortMapLink(SHORT) && isShortMapLink("https://goo.gl/maps/x"));
  ok("normal link is not a short link", isShortMapLink(PLACE) === false);
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

console.log("4) toEmbedUrl converts ANY pasted link (the broken-map fix):");
{
  ok("already an embed → passed through", toEmbedUrl(EMBED).status === "ok" && toEmbedUrl(EMBED).url === EMBED);
  const conv = toEmbedUrl(PLACE);
  ok("/maps/place CONVERTED to an embeddable url", conv.status === "ok" && conv.source === "coords");
  ok("converted url is embeddable", isSafeMapEmbedUrl(conv.url) && conv.url.includes("q=32.7644,-6.3986"));
  const placeOnly = toEmbedUrl("https://www.google.com/maps/place/House+Electronics/");
  ok("place without coords → query embed", placeOnly.status === "ok" && placeOnly.source === "place" && isSafeMapEmbedUrl(placeOnly.url));
  ok("short link → needs_resolve (never a broken iframe)", toEmbedUrl(SHORT).status === "needs_resolve" && toEmbedUrl(SHORT).url === null);
  ok("empty → empty", toEmbedUrl("").status === "empty");
  ok("third-party link → unsupported, no url", (() => { const r = toEmbedUrl("https://evil.example.com/maps"); return r.status === "unsupported" && r.url === null; })());
  ok("javascript: → unsupported", toEmbedUrl("javascript:alert(1)").status === "unsupported");
}

console.log("5) buildEmbedUrl priority + never renders a broken frame:");
{
  ok("converted link wins", buildEmbedUrl({ embedUrl: PLACE }).includes("q=32.7644,-6.3986"));
  ok("unresolvable short link falls back to coordinates", (() => {
    const u = buildEmbedUrl({ embedUrl: SHORT, latitude: 33.5731, longitude: -7.5898 });
    return u.includes("q=33.5731,-7.5898") && isSafeMapEmbedUrl(u);
  })());
  ok("unsupported link falls back to coordinates", buildEmbedUrl({ embedUrl: "https://evil.example.com", latitude: 1, longitude: 2 }).includes("q=1,2"));
  ok("address fallback encoded", buildEmbedUrl({ address: "12 Rue Hassan II, Casablanca" }).includes("12%20Rue%20Hassan%20II"));
  ok("nothing usable → null (map hidden, not broken)", buildEmbedUrl({ embedUrl: SHORT }) === null);
  ok("every produced url is iframe-safe", [
    buildEmbedUrl({ embedUrl: PLACE }), buildEmbedUrl({ latitude: 1, longitude: 2 }), buildEmbedUrl({ address: "X" }),
  ].every((u) => isSafeMapEmbedUrl(u)));
}

console.log("6) Directions button:");
{
  ok("explicit button URL wins", buildDirectionsUrl({ buttonUrl: "https://x.test/a", latitude: 1, longitude: 2 }) === "https://x.test/a");
  ok("short link opens directly (works outside an iframe)", buildDirectionsUrl({ embedUrl: SHORT }) === SHORT);
  ok("place link opens directly", buildDirectionsUrl({ embedUrl: PLACE }) === PLACE);
  ok("coordinates build a search link", buildDirectionsUrl({ latitude: 33.5731, longitude: -7.5898 }) === "https://www.google.com/maps/search/?api=1&query=33.5731,-7.5898");
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

console.log("8) The iframe NEVER receives a place/search/short link (broken-frame fix):");
{
  // Even carrying ?output=embed, these paths are refused by Google in a frame.
  ok("/maps/place + output=embed still rejected", isSafeMapEmbedUrl("https://www.google.com/maps/place/X/?output=embed") === false);
  ok("/maps/search + output=embed still rejected", isSafeMapEmbedUrl("https://www.google.com/maps/search/?api=1&query=1,2&output=embed") === false);
  ok("maps.app.goo.gl never embeddable", isSafeMapEmbedUrl("https://maps.app.goo.gl/x?output=embed") === false);
  ok("bare /maps?q=…&output=embed IS embeddable", isSafeMapEmbedUrl("https://www.google.com/maps?q=1,2&output=embed"));
  ok("official /maps/embed IS embeddable", isSafeMapEmbedUrl(EMBED));

  // A /maps/search link with coordinates is converted, not passed through.
  const search = toEmbedUrl("https://www.google.com/maps/search/?api=1&query=32.7644,-6.3986");
  ok("/maps/search converted to a bare embed", search.status === "ok" && search.url.startsWith("https://www.google.com/maps?q=32.7644,-6.3986"));

  // Whatever the input, anything handed to the iframe passes the strict gate.
  const inputs = [PLACE, SHORT, EMBED, "https://www.google.com/maps/search/?api=1&query=1,2",
    "https://www.google.com/maps/place/X/?output=embed", "https://evil.example.com/x", "", "javascript:alert(1)"];
  ok("every buildEmbedUrl output is strictly embeddable or null", inputs.every((i) => {
    const u = buildEmbedUrl({ embedUrl: i });
    return u === null || isSafeMapEmbedUrl(u);
  }));
  ok("with a lat/lng fallback every input yields a valid embed", inputs.every((i) =>
    isSafeMapEmbedUrl(buildEmbedUrl({ embedUrl: i, latitude: 32.7, longitude: -6.3 }))));
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
