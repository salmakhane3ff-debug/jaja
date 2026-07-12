/**
 * src/lib/landingMode.js
 * ─────────────────────────────────────────────────────────────────────────────
 * "Landing Page Only Mode" — pure, dependency-free decision logic.
 *
 * Edge-safe: uses only global URL / URLSearchParams (no Node, Prisma, or fs), so
 * it runs inside Next.js middleware AND is fully unit-testable. All I/O (reading
 * the admin config) is done by the caller and passed in as `config`.
 *
 * When enabled, public storefront requests are redirected (temporary 307) to a
 * single configured landing page. Infrastructure routes (admin/api/_next/uploads/
 * static/favicon/robots/sitemap), the configured allowed paths, and the landing
 * page itself are always allowed. Fails OPEN (never blocks) on any invalid config.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Route prefixes that must never be redirected.
const ALWAYS_PREFIXES = ["/admin", "/api", "/_next", "/uploads"];
// Exact infrastructure files.
const ALWAYS_EXACT = new Set([
  "/favicon.ico", "/robots.txt", "/sitemap.xml",
  "/manifest.webmanifest", "/manifest.json", "/sw.js",
]);
// Static asset extensions (anything file-like is treated as an asset).
const STATIC_EXT = /\.(ico|png|jpe?g|gif|webp|avif|svg|css|js|mjs|json|txt|xml|woff2?|ttf|otf|eot|map|webmanifest|mp4|webm|mov|pdf)$/i;

/** True if the string contains an ASCII control character (unsafe in a URL/path). */
function hasControlChar(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) return true;
  }
  return false;
}

/** Normalize a path: ensure leading slash, collapse "//", drop trailing slash. */
export function normalizePath(p) {
  let s = String(p ?? "").trim();
  if (!s) return "/";
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/{2,}/g, "/");
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s || "/";
}

/**
 * Validate/parse the admin-configured redirect target.
 * Accepts an internal path ("/landing/x") or a complete HTTPS URL.
 * Rejects javascript:, data:, protocol-relative ("//x"), http:, traversal, and
 * anything malformed. Returns null when unsafe (caller must fail OPEN).
 *
 * @returns {{type:'internal',pathname:string,query:string} |
 *           {type:'external',href:string,origin:string,pathname:string} | null}
 */
export function validateRedirectUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (hasControlChar(s)) return null;

  if (s.startsWith("/")) {
    if (s.startsWith("//")) return null;          // protocol-relative → unsafe
    if (s.includes("\\")) return null;
    const noHash = s.split("#")[0];
    const qi = noHash.indexOf("?");
    const pathname = qi >= 0 ? noHash.slice(0, qi) : noHash;
    const query = qi >= 0 ? noHash.slice(qi + 1) : "";
    if (pathname.includes("..")) return null;      // traversal
    return { type: "internal", pathname: normalizePath(pathname), query };
  }

  let u;
  try { u = new URL(s); } catch { return null; }
  // Only complete HTTPS URLs (rejects javascript:, data:, http:, ftp:, …).
  if (u.protocol !== "https:") return null;
  return { type: "external", href: u.href, origin: u.origin, pathname: u.pathname };
}

/** Normalize allowed public paths (array or comma-separated string) → string[]. */
export function normalizeAllowedPaths(input) {
  let list = [];
  if (Array.isArray(input)) list = input;
  else if (typeof input === "string") list = input.split(",");
  const out = list
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .filter((x) => x.startsWith("/") && !x.startsWith("//") && !x.includes("..") && !hasControlChar(x))
    .map(normalizePath);
  return Array.from(new Set(out));
}

/** True when `pathname` equals `base` or is nested under it. */
export function pathMatches(pathname, base) {
  const a = normalizePath(pathname);
  const b = normalizePath(base);
  return a === b || a.startsWith(b + "/");
}

/** Infrastructure / static routes that must always be reachable. */
export function isAlwaysAllowed(pathname) {
  if (!pathname) return true;
  if (ALWAYS_EXACT.has(pathname)) return true;
  for (const p of ALWAYS_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + "/")) return true;
  }
  return STATIC_EXT.test(pathname);
}

/** True when `pathname` is covered by one of the admin-allowed public paths. */
export function isPathAllowed(pathname, allowedList) {
  return (allowedList || []).some((base) => pathMatches(pathname, base));
}

/** Merge an incoming query string into an internal destination (incoming wins, no dupes). */
function mergeInternal(pathname, destQuery, incomingSearch) {
  const params = new URLSearchParams(destQuery || "");
  const incoming = new URLSearchParams(String(incomingSearch || "").replace(/^\?/, ""));
  for (const [k, v] of incoming) params.set(k, v); // preserve click_id/utm_*/fbclid/etc.
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Merge an incoming query string into an external HTTPS destination. */
function mergeExternal(href, incomingSearch) {
  try {
    const u = new URL(href);
    const incoming = new URLSearchParams(String(incomingSearch || "").replace(/^\?/, ""));
    for (const [k, v] of incoming) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return href;
  }
}

/**
 * Decide what to do with a public request under Landing Page Only Mode.
 *
 * @param {object} o
 * @param {string} o.pathname   request pathname
 * @param {string} [o.search]   request query string (with or without leading "?")
 * @param {string} [o.origin]   request origin (for same-origin loop protection)
 * @param {{enabled:boolean, redirectUrl:string, allowedPaths:string[]}} o.config
 * @returns {{action:'next'} |
 *           {action:'next', failOpen:true, reason:string} |
 *           {action:'redirect', destination:string, status:number, reason:string}}
 */
export function evaluateLandingRedirect({ pathname, search = "", origin = "", config }) {
  // Disabled (or no config) → behave exactly as before.
  if (!config || config.enabled !== true) return { action: "next" };

  // Never touch infrastructure / static.
  if (isAlwaysAllowed(pathname)) return { action: "next" };

  // Invalid/missing redirect target → FAIL OPEN (keep the site accessible).
  const target = validateRedirectUrl(config.redirectUrl);
  if (!target) return { action: "next", failOpen: true, reason: "invalid-redirect-url" };

  // Loop protection: the landing page itself (and nested routes) never redirects.
  const landingPathname =
    target.type === "internal"
      ? target.pathname
      : (origin && target.origin === origin ? target.pathname : null); // same-origin external
  if (landingPathname && pathMatches(pathname, landingPathname)) {
    return { action: "next", reason: "is-landing" };
  }

  // Admin-configured allowlist (e.g. /checkout/success, /privacy).
  if (isPathAllowed(pathname, config.allowedPaths)) return { action: "next", reason: "allowed" };

  // Redirect (temporary 307 — never a permanent 301/308, protects SEO).
  const destination =
    target.type === "external"
      ? mergeExternal(target.href, search)
      : mergeInternal(target.pathname, target.query, search);
  return { action: "redirect", destination, status: 307, reason: "blocked" };
}
