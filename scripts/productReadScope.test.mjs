#!/usr/bin/env node
/**
 * scripts/productReadScope.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the public/privileged split on GET /api/products.
 *
 * Two layers:
 *   1. the pure allowlist (src/lib/productReadScope.js)
 *   2. the route's actual decision, reproduced against the REAL withAdminAuth
 *      with REAL signed JWTs — proving a privileged read 401s and a public read
 *      never touches auth at all.
 *
 * No framework, no DB, no server. Run:
 *   node scripts/productReadScope.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-auth-tests";

import { readFileSync } from "node:fs";
import jwt from "jsonwebtoken";
import { withAdminAuth } from "../src/lib/middleware/withAdminAuth.js";
import { isPublicProductRead, requiresAdminRead, PUBLIC_PRODUCT_STATUS } from "../src/lib/productReadScope.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const SECRET = process.env.JWT_SECRET;
const ADMIN_TOKEN = jwt.sign({ id: "u-admin", role: "ADMIN" }, SECRET, { algorithm: "HS256" });
const USER_TOKEN  = jwt.sign({ id: "u-user",  role: "USER"  }, SECRET, { algorithm: "HS256" });

const req = (url, token) => ({
  url,
  cookies: { get: (n) => (n === "auth_token" && token ? { value: token } : undefined) },
  headers: { get: () => null },
});

// Reproduces the route's GET exactly: scope by query param, then either call the
// handler directly (public) or through withAdminAuth (privileged).
function makeRouteGet() {
  const calls = [];
  const handler = async (r, ctx, user) => { calls.push({ user }); return Response.json([{ _id: "p1" }]); };
  const GET = async (r, context) => {
    const status = new URL(r.url).searchParams.get("status");
    if (isPublicProductRead(status)) return handler(r, context);
    return withAdminAuth(handler)(r, context);
  };
  return { GET, calls };
}
const call = async (url, token) => {
  const { GET, calls } = makeRouteGet();
  const res = await GET(req(url, token), {});
  return { status: res.status, calls };
};

const BASE = "https://shop.test/api/products";

console.log("1) public reads need no auth:");
{
  const noStatus = await call(BASE);
  ok("GET /api/products (no status) → public, handler invoked", noStatus.status === 200 && noStatus.calls.length === 1);
  ok("no auth context was required", noStatus.calls[0].user === undefined);

  const active = await call(`${BASE}?status=Active`);
  ok("GET ?status=Active → public", active.status === 200 && active.calls.length === 1);

  const ids = await call(`${BASE}?ids=a,b,c`);
  ok("GET ?ids=… (cart/checkout fast path) → public", ids.status === 200 && ids.calls.length === 1);

  const emptyStatus = await call(`${BASE}?status=`);
  ok("GET ?status= (empty) → public, same as default", emptyStatus.status === 200 && emptyStatus.calls.length === 1);
}

console.log("2) privileged reads are rejected without auth (401):");
for (const status of ["all", "Inactive", "Draft"]) {
  const r = await call(`${BASE}?status=${status}`);
  ok(`GET ?status=${status} without auth → 401`, r.status === 401);
  ok(`GET ?status=${status} → handler never invoked (fails closed)`, r.calls.length === 0);
}
{
  const unknown = await call(`${BASE}?status=Archived`);
  ok("unknown status → privileged by default (allowlist, not denylist)", unknown.status === 401 && unknown.calls.length === 0);
  const lower = await call(`${BASE}?status=all&ids=a,b`);
  ok("?ids= cannot smuggle a privileged status", lower.status === 401 && lower.calls.length === 0);
}

console.log("3) privileged reads with a valid ADMIN token:");
for (const status of ["all", "Inactive", "Draft"]) {
  const r = await call(`${BASE}?status=${status}`, ADMIN_TOKEN);
  ok(`GET ?status=${status} as ADMIN → handler invoked`, r.calls.length === 1 && r.status === 200);
  ok(`GET ?status=${status} as ADMIN → admin identity passed`, r.calls[0].user?.role === "ADMIN");
}

console.log("4) non-admin token on a privileged read → 403:");
for (const status of ["all", "Inactive"]) {
  const r = await call(`${BASE}?status=${status}`, USER_TOKEN);
  ok(`GET ?status=${status} with role=USER → 403`, r.status === 403);
  ok(`GET ?status=${status} with role=USER → handler never invoked`, r.calls.length === 0);
}
{
  // A logged-in non-admin must still be able to browse the shop.
  const r = await call(BASE, USER_TOKEN);
  ok("public read still works for a non-admin session", r.status === 200 && r.calls.length === 1);
}

console.log("5) the allowlist itself:");
{
  ok("absent → public", isPublicProductRead(null) === true && isPublicProductRead(undefined) === true);
  ok("empty → public", isPublicProductRead("") === true);
  ok("Active → public", isPublicProductRead("Active") === true);
  ok("all → privileged", isPublicProductRead("all") === false);
  ok("Inactive → privileged", isPublicProductRead("Inactive") === false);
  ok("Draft → privileged", isPublicProductRead("Draft") === false);
  ok("case variants are NOT public (strict allowlist)",
     isPublicProductRead("active") === false && isPublicProductRead("ACTIVE") === false);
  ok("requiresAdminRead is the inverse", requiresAdminRead("all") === true && requiresAdminRead(null) === false);
  ok("the one public status is Active", PUBLIC_PRODUCT_STATUS === "Active");
}

console.log("6) source guards:");
{
  const route = readFileSync(new URL("../src/app/api/products/route.js", import.meta.url), "utf8");
  ok("GET is scoped, not blindly wrapped", /export\s+async\s+function\s+GET/.test(route));
  ok("GET consults the read-scope allowlist", /isPublicProductRead\(\s*status\s*\)/.test(route));
  ok("GET routes privileged reads through withAdminAuth", /withAdminAuth\(\s*getProductsHandler\s*\)/.test(route));
  ok("GET is NOT wrapped wholesale", !/export\s+const\s+GET\s*=\s*withAdminAuth/.test(route));
  // Writes must stay protected — this change must not have loosened them.
  for (const [m, h] of [["POST", "createProductHandler"], ["PUT", "updateProductHandler"], ["DELETE", "deleteProductHandler"]]) {
    ok(`${m} remains wrapped in withAdminAuth`,
       new RegExp(`export\\s+const\\s+${m}\\s*=\\s*withAdminAuth\\(\\s*${h}\\s*\\)`).test(route));
  }

  const checkout = readFileSync(new URL("../src/app/checkout/payment/page.jsx", import.meta.url), "utf8");
  ok("checkout no longer requests the privileged status=all", !/api\/products\?status=all/.test(checkout));
  ok("checkout uses the public ?ids= fast path", /api\/products\?ids=\$\{productIds\.join/.test(checkout));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
