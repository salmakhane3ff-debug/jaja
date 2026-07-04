/**
 * src/lib/siteUrl.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the site's public origin, so the same codebase can
 * be deployed for different stores without hardcoded domains.
 *
 * Priority:
 *   1. NEXT_PUBLIC_SITE_URL  (available on server AND client, inlined at build)
 *   2. SITE_URL              (server-only)
 *   3. fallback for this shopgold_store2 deployment
 *
 * Trailing slash is stripped so `${SITE_ORIGIN}/path` is always well-formed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const SITE_ORIGIN =
  (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://houseelectronic.ma").replace(/\/$/, "");

/** Build an absolute URL from a path, e.g. absoluteUrl("/products") → SITE_ORIGIN + "/products". */
export function absoluteUrl(path = "") {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}${cleanPath}`;
}
