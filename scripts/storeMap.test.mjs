#!/usr/bin/env node
/**
 * scripts/storeMap.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * 📍 Store Map homepage section — URL building + the iframe security gate.
 * The embed URL is rendered inside an <iframe src>, so anything that is not a
 * Google Maps URL must be rejected (and the section must fall back to the
 * configured coordinates) rather than embedded.
 * Run: node scripts/storeMap.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  parseLat, parseLng, isSafeMapEmbedUrl, buildEmbedUrl, buildDirectionsUrl,
  telHref, normalizeStoreMap, STORE_MAP_DEFAULTS,
} from "../src/lib/storeMap.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

console.log("1) Coordinate parsing:");
{
  ok("numeric string accepted", parseLat("33.5731") === 33.5731);
  ok("negative longitude accepted", parseLng("-7.5898") === -7.5898);
  ok("zero is a valid coordinate", parseLat(0) === 0 && parseLng(0) === 0);
  ok("empty → null", parseLat("") === null && parseLng(null) === null);
  ok("non-numeric → null", parseLat("abc") === null);
  ok("latitude out of range → null", parseLat(91) === null && parseLat(-91) === null);
  ok("longitude out of range → null", parseLng(181) === null);
  ok("latitude 90 / longitude 180 are in range", parseLat(90) === 90 && parseLng(-180) === -180);
}

console.log("2) SECURITY — only Google Maps URLs may be embedded:");
{
  ok("google.com/maps embed accepted", isSafeMapEmbedUrl("https://www.google.com/maps/embed?pb=!1m18"));
  ok("maps.google.com accepted", isSafeMapEmbedUrl("https://maps.google.com/maps?q=1,2&output=embed"));
  ok("arbitrary third-party host rejected", isSafeMapEmbedUrl("https://evil.example.com/track?x=1") === false);
  ok("javascript: URL rejected", isSafeMapEmbedUrl("javascript:alert(1)") === false);
  ok("data: URL rejected", isSafeMapEmbedUrl("data:text/html,<script>alert(1)</script>") === false);
  ok("lookalike host rejected", isSafeMapEmbedUrl("https://google.com.evil.net/maps") === false);
  ok("garbage / empty rejected", isSafeMapEmbedUrl("not a url") === false && isSafeMapEmbedUrl("") === false);
}

console.log("3) Embed URL priority: valid admin URL → coordinates → address:");
{
  const admin = "https://www.google.com/maps/embed?pb=!1m18!custom";
  ok("valid admin embed URL wins", buildEmbedUrl({ embedUrl: admin, latitude: 1, longitude: 2 }) === admin);
  ok("UNSAFE admin URL is ignored, coordinates used instead", (() => {
    const u = buildEmbedUrl({ embedUrl: "https://evil.example.com/x", latitude: 33.5731, longitude: -7.5898 });
    return u.includes("google.com/maps") && u.includes("q=33.5731,-7.5898");
  })());
  ok("coordinate embed uses q= (renders the red marker) + output=embed", (() => {
    const u = buildEmbedUrl({ latitude: 33.5731, longitude: -7.5898 });
    return u.startsWith("https://www.google.com/maps?q=33.5731,-7.5898") && u.includes("output=embed");
  })());
  ok("address fallback is URL-encoded", buildEmbedUrl({ address: "12 Rue Hassan II, Casablanca" }).includes("12%20Rue%20Hassan%20II"));
  ok("nothing configured → null (section hides the map)", buildEmbedUrl({}) === null);
  ok("partial coordinates → falls through, not a broken embed", buildEmbedUrl({ latitude: 33.5 }) === null);
}

console.log("4) Directions button URL:");
{
  ok("explicit admin button URL wins", buildDirectionsUrl({ buttonUrl: "https://maps.app.goo.gl/abc", latitude: 1, longitude: 2 }) === "https://maps.app.goo.gl/abc");
  ok("coordinates build a search link", buildDirectionsUrl({ latitude: 33.5731, longitude: -7.5898 }) === "https://www.google.com/maps/search/?api=1&query=33.5731,-7.5898");
  ok("address fallback encoded", buildDirectionsUrl({ address: "Rue A, Casa" }).includes("query=Rue%20A%2C%20Casa"));
  ok("nothing configured → null (button hidden)", buildDirectionsUrl({}) === null);
}

console.log("5) Phone link + normalization:");
{
  ok("formatted phone → tel: digits", telHref("+212 6 12-34-56-78") === "tel:+212612345678");
  ok("empty phone → null", telHref("") === null && telHref(null) === null);
  ok("non-numeric phone → null", telHref("---") === null);

  const n = normalizeStoreMap({ title: "  Notre magasin  ", phone: 612345678, latitude: 33.5 });
  ok("strings trimmed", n.title === "Notre magasin");
  ok("numbers coerced to strings", n.phone === "612345678" && n.latitude === "33.5");
  ok("button text falls back to the default", n.buttonText === STORE_MAP_DEFAULTS.buttonText);
  ok("null/garbage input never throws", (() => { try { normalizeStoreMap(null); normalizeStoreMap("x"); return true; } catch { return false; } })());
  ok("every configurable field is present", ["title","subtitle","embedUrl","latitude","longitude","storeName","address","phone","hours","buttonText","buttonUrl"].every((k) => k in n));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
