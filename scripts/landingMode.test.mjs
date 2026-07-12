#!/usr/bin/env node
/**
 * scripts/landingMode.test.mjs — unit tests for src/lib/landingMode.js.
 * Pure logic, no server/DB. Run: node --experimental-detect-module scripts/landingMode.test.mjs
 */

import {
  evaluateLandingRedirect, validateRedirectUrl, normalizeAllowedPaths,
  isAlwaysAllowed, isPathAllowed, normalizePath,
} from "../src/lib/landingMode.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const ORIGIN = "https://shop.example.com";
const cfg = (over = {}) => ({
  enabled: true,
  redirectUrl: "/landing/my-offer",
  allowedPaths: normalizeAllowedPaths("/checkout/success, /privacy, /terms"),
  ...over,
});
const ev = (pathname, over = {}, extra = {}) =>
  evaluateLandingRedirect({ pathname, origin: ORIGIN, ...extra, config: cfg(over) });

console.log("1) mode disabled → homepage works normally");
ok("disabled → next", ev("/", { enabled: false }).action === "next");

console.log("2) mode enabled → homepage redirects");
{ const r = ev("/"); ok("home → 307 redirect to landing", r.action === "redirect" && r.status === 307 && r.destination.startsWith("/landing/my-offer")); }

console.log("3) product page redirects");
ok("/products/123 → redirect", ev("/products/123").action === "redirect");
ok("/collections/x → redirect", ev("/collections/x").action === "redirect");
ok("/blog → redirect", ev("/blog").action === "redirect");

console.log("4) landing page itself does not redirect");
ok("landing exact → next", ev("/landing/my-offer").action === "next");
ok("landing nested → next", ev("/landing/my-offer/step-2").action === "next");

console.log("5) admin route is allowed");
ok("/admin → next", ev("/admin").action === "next");
ok("/admin/ui-control → next", ev("/admin/ui-control").action === "next");

console.log("6) API route is allowed");
ok("/api/ui-control → next", ev("/api/ui-control").action === "next");

console.log("7) _next/static route is allowed");
ok("/_next/static/chunk.js → next", ev("/_next/static/chunk.js").action === "next");

console.log("8) uploads route is allowed");
ok("/uploads/x.jpg → next", ev("/uploads/1699-photo.jpg").action === "next");

console.log("9) allowed checkout path works");
ok("/checkout/success → next", ev("/checkout/success").action === "next");
ok("/privacy → next", ev("/privacy").action === "next");

console.log("10) blocked checkout path redirects");
ok("/checkout/payment → redirect", ev("/checkout/payment").action === "redirect");
ok("/checkout (base, not allowed) → redirect", ev("/checkout").action === "redirect");

console.log("11) query parameters are preserved");
{
  const r = ev("/", {}, { search: "click_id=abc&clickid=z&cid=1&subid=2&utm_source=fb&utm_campaign=c&fbclid=xyz&ref=r" });
  const has = (k, v) => r.destination.includes(`${k}=${v}`);
  ok("preserves all tracking params", r.action === "redirect" &&
     has("click_id", "abc") && has("clickid", "z") && has("cid", "1") && has("subid", "2") &&
     has("utm_source", "fb") && has("utm_campaign", "c") && has("fbclid", "xyz") && has("ref", "r"));
  ok("destination has no duplicate '?'", (r.destination.match(/\?/g) || []).length === 1);
}
{
  // dest already has a param + incoming overrides without duplicating
  const r = ev("/", { redirectUrl: "/landing/x?utm_source=default" }, { search: "utm_source=fb&click_id=1" });
  ok("incoming overrides dest param (no dup)", r.destination.includes("utm_source=fb") && !r.destination.includes("utm_source=default") && r.destination.includes("click_id=1"));
}

console.log("12) invalid redirect URL fails open");
ok("empty redirect → fail open (next)", ev("/", { redirectUrl: "" }).failOpen === true);
ok("javascript: redirect → fail open (next)", (() => { const r = ev("/", { redirectUrl: "javascript:alert(1)" }); return r.action === "next" && r.failOpen === true; })());
ok("garbage redirect → fail open", ev("/", { redirectUrl: "not a url" }).failOpen === true);

console.log("13) redirect loop is prevented");
ok("landing path never redirects (internal)", ev("/landing/my-offer").action === "next");
ok("same-origin external landing → treated as landing (no loop)",
   evaluateLandingRedirect({ pathname: "/promo", origin: ORIGIN, config: cfg({ redirectUrl: `${ORIGIN}/promo` }) }).action === "next");

console.log("14) external HTTPS landing-page URL is supported");
{
  const r = evaluateLandingRedirect({ pathname: "/", origin: ORIGIN, search: "fbclid=1", config: cfg({ redirectUrl: "https://ext.example.com/offer" }) });
  ok("external → 307 to https URL", r.action === "redirect" && r.status === 307 && r.destination.startsWith("https://ext.example.com/offer"));
  ok("external preserves incoming params", r.destination.includes("fbclid=1"));
}

console.log("15) javascript/data/unsafe URLs are rejected by validation");
ok("javascript: → null", validateRedirectUrl("javascript:alert(1)") === null);
ok("data: → null", validateRedirectUrl("data:text/html,x") === null);
ok("protocol-relative //evil → null", validateRedirectUrl("//evil.com") === null);
ok("http:// (not https) → null", validateRedirectUrl("http://x.com") === null);
ok("traversal /a/../b → null", validateRedirectUrl("/a/../b") === null);
ok("valid internal → object", validateRedirectUrl("/landing/my-offer")?.type === "internal");
ok("valid https → object", validateRedirectUrl("https://x.com/y")?.type === "external");

console.log("extra) helpers");
ok("normalizePath collapses + trims", normalizePath("/a//b/") === "/a/b");
ok("normalizeAllowedPaths dedups + filters", JSON.stringify(normalizeAllowedPaths("/a, /a, bad, /b/")) === JSON.stringify(["/a", "/b"]));
ok("isAlwaysAllowed static ext", isAlwaysAllowed("/logo.png") && isAlwaysAllowed("/robots.txt"));
ok("isPathAllowed nested", isPathAllowed("/checkout/success/x", ["/checkout/success"]));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
