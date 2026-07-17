/**
 * src/lib/productReadScope.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Decides whether a GET /api/products read is public or privileged.
 *
 * Only two reads are public, and they are the same two the controller already
 * treats as publicly cacheable (`!statusFilter || statusFilter === 'Active'`):
 *
 *   /api/products              → default: Active products only
 *   /api/products?status=Active → explicitly the same set
 *
 * Everything else — `all`, `Inactive`, `Draft`, or any unknown value — can expose
 * unpublished catalogue data (draft titles, prices, unreleased products) and
 * therefore requires an admin session.
 *
 * This is an ALLOWLIST, deliberately: a new status value added to the product
 * model later becomes privileged by default rather than silently public.
 *
 * Pure — no DB, no network. Lives here rather than inline in the route so the
 * rule is unit-testable (the route module's `@/` imports cannot resolve outside
 * the bundler).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// The only product status a non-admin may ask for by name.
export const PUBLIC_PRODUCT_STATUS = "Active";

/**
 * @param {string|null|undefined} status  the raw `status` query param
 * @returns {boolean} true when the read may proceed without authentication
 */
export function isPublicProductRead(status) {
  // Absent or empty → the controller's default (Active only). `?status=` with an
  // empty value reaches the controller as null via `searchParams.get(...) || null`,
  // so it must be treated as the default here too.
  if (status === null || status === undefined || status === "") return true;
  return status === PUBLIC_PRODUCT_STATUS;
}

/** Convenience inverse — a read that must be admin-authenticated. */
export function requiresAdminRead(status) {
  return !isPublicProductRead(status);
}
