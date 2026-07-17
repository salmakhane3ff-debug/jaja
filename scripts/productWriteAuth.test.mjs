#!/usr/bin/env node
/**
 * scripts/productWriteAuth.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Auth tests for the product write endpoints (/api/products POST/PUT/DELETE).
 *
 * These drive the REAL withAdminAuth wrapper with REAL signed JWTs (minted with
 * the app's own jsonwebtoken against process.env.JWT_SECRET) — not a mock. No
 * test framework, no DB, no server.
 *
 * The route-export checks at the end are source-level assertions: the `@/` alias
 * cannot resolve outside the bundler, so the route module itself can't be
 * imported here. They exist to catch the regression that matters — someone
 * unwrapping a write method later.
 *
 * Run:  node scripts/productWriteAuth.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-auth-tests";

import { readFileSync } from "node:fs";
import jwt from "jsonwebtoken";
import { withAdminAuth } from "../src/lib/middleware/withAdminAuth.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const SECRET = process.env.JWT_SECRET;
const sign = (payload, opts = {}) => jwt.sign(payload, SECRET, { algorithm: "HS256", ...opts });

const ADMIN_TOKEN   = sign({ id: "u-admin", role: "ADMIN" });
const USER_TOKEN    = sign({ id: "u-user",  role: "USER"  });
const EXPIRED_TOKEN = sign({ id: "u-admin", role: "ADMIN" }, { expiresIn: -60 });
const WRONG_SECRET  = jwt.sign({ id: "u-admin", role: "ADMIN" }, "a-different-secret", { algorithm: "HS256" });

// ── Request doubles ───────────────────────────────────────────────────────────
// withAdminAuth reads the token from req.cookies.get('auth_token') and falls
// back to parsing the raw Cookie header — both sources are exercised below.
const reqWithCookieStore = (token) => ({
  cookies: { get: (n) => (n === "auth_token" && token ? { value: token } : undefined) },
  headers: { get: () => null },
});
const reqWithCookieHeader = (token) => ({
  cookies: undefined,
  headers: { get: (n) => (n === "cookie" && token ? `other=1; auth_token=${token}; x=2` : null) },
});
const reqAnonymous = () => ({ cookies: { get: () => undefined }, headers: { get: () => null } });

// A stub standing in for createProductHandler / updateProductHandler /
// deleteProductHandler. Records every invocation so we can prove the wrapper
// fails CLOSED — rejecting is not enough if the handler still ran.
function makeHandler(label) {
  const calls = [];
  const handler = async (req, context, user) => {
    calls.push({ req, context, user });
    return Response.json({ ok: true, label });
  };
  return { handler, calls };
}

const run = async (req) => {
  const { handler, calls } = makeHandler("x");
  const res = await withAdminAuth(handler)(req, {});
  return { status: res.status, body: await res.json(), calls };
};

console.log("1) unauthenticated writes are rejected (401) and never reach the handler:");
for (const method of ["POST", "PUT", "DELETE"]) {
  const { handler, calls } = makeHandler(method);
  const res = await withAdminAuth(handler)(reqAnonymous(), {});
  ok(`${method} without a token → 401`, res.status === 401);
  ok(`${method} handler never invoked (fails closed)`, calls.length === 0);
}
{
  const { body } = await run(reqAnonymous());
  ok("401 body says authentication required", body.error === "Authentication required");
}

console.log("2) non-admin token is rejected (403):");
for (const method of ["POST", "PUT", "DELETE"]) {
  const { handler, calls } = makeHandler(method);
  const res = await withAdminAuth(handler)(reqWithCookieStore(USER_TOKEN), {});
  ok(`${method} with role=USER → 403`, res.status === 403);
  ok(`${method} handler never invoked for non-admin`, calls.length === 0);
}
{
  const { body } = await run(reqWithCookieStore(USER_TOKEN));
  ok("403 body says admin access required", body.error === "Admin access required");
}

console.log("3) valid admin token → the wrapped handler runs:");
for (const method of ["POST", "PUT", "DELETE"]) {
  const { handler, calls } = makeHandler(method);
  const res = await withAdminAuth(handler)(reqWithCookieStore(ADMIN_TOKEN), {});
  ok(`${method} with role=ADMIN → handler invoked`, calls.length === 1);
  ok(`${method} returns the handler's response (200)`, res.status === 200);
}
{
  const { handler, calls } = makeHandler("ctx");
  await withAdminAuth(handler)(reqWithCookieStore(ADMIN_TOKEN), { params: { a: 1 } });
  ok("handler receives (req, context, user)", calls[0].context?.params?.a === 1 && calls[0].user?.role === "ADMIN");
  ok("decoded admin identity is passed through", calls[0].user?.id === "u-admin");
}

console.log("4) token sources:");
{
  const viaStore = await run(reqWithCookieStore(ADMIN_TOKEN));
  ok("cookies store source supported", viaStore.status === 200 && viaStore.calls.length === 1);
  const viaHeader = await run(reqWithCookieHeader(ADMIN_TOKEN));
  ok("raw Cookie header source supported", viaHeader.status === 200 && viaHeader.calls.length === 1);
  ok("auth_token parsed out of a multi-cookie header", viaHeader.body.ok === true);
  const headerNonAdmin = await run(reqWithCookieHeader(USER_TOKEN));
  ok("role is enforced on the header path too", headerNonAdmin.status === 403 && headerNonAdmin.calls.length === 0);
}

console.log("5) invalid / expired tokens → 401, never a 500:");
for (const [label, token] of [
  ["garbage token",        "not.a.jwt"],
  ["expired admin token",  EXPIRED_TOKEN],
  ["token signed with the wrong secret", WRONG_SECRET],
  ["empty token value",    ""],
]) {
  const { status, calls } = await run(reqWithCookieStore(token));
  ok(`${label} → 401`, status === 401);
  ok(`${label} → handler never invoked`, calls.length === 0);
}
{
  const { body } = await run(reqWithCookieStore("not.a.jwt"));
  ok("invalid token reports a token error, not a crash", body.error === "Invalid or expired token");
}

console.log("6) route exports (source-level regression guard):");
{
  const src = readFileSync(new URL("../src/app/api/products/route.js", import.meta.url), "utf8");
  ok("withAdminAuth is imported", /import\s*\{\s*withAdminAuth\s*\}\s*from/.test(src));
  // GET is scoped per request (public read vs ?status=all) rather than wrapped
  // wholesale — the public/privileged split itself is covered by
  // scripts/productReadScope.test.mjs.
  ok("GET is scoped, not wrapped wholesale", !/export\s+const\s+GET\s*=\s*withAdminAuth/.test(src));
  ok("GET still serves the public read via getProductsHandler", /return\s+getProductsHandler\(/.test(src));
  for (const [method, handler] of [
    ["POST",   "createProductHandler"],
    ["PUT",    "updateProductHandler"],
    ["DELETE", "deleteProductHandler"],
  ]) {
    ok(`${method} export is wrapped in withAdminAuth`,
       new RegExp(`export\\s+const\\s+${method}\\s*=\\s*withAdminAuth\\(\\s*${handler}\\s*\\)`).test(src));
  }
  ok("PATCH is still not implemented (nothing to protect)", !/export\s+const\s+PATCH/.test(src));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
