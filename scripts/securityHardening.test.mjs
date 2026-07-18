#!/usr/bin/env node
/**
 * scripts/securityHardening.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Batch #2A internal hardening — pure logic only (no DB, no HTTP, no framework).
 *
 * Scope of THIS suite: the login failed-attempt throttle (src/lib/loginThrottle.js).
 * The other Batch #2A changes are rate-limit / order-existence wiring inside route
 * handlers that need a live request + DB, so they are covered by the manual steps
 * in the report rather than here.
 *
 * NOTE: affiliate commission hardening was deliberately excluded from Batch #2A —
 * this file does not touch affiliateSystemService or any payout math.
 *
 * Run:  node scripts/securityHardening.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  throttleKey, registerFailure, checkLock, clearFailures, sweep,
  LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS,
} from "../src/lib/loginThrottle.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

console.log("1) login throttle — lockout after N failures:");
{
  const s = new Map();
  const k = throttleKey("Admin@Example.com ");
  ok("key normalized (case + trim)", k === "admin@example.com");
  const t0 = 1_000_000;
  for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
    ok(`failure ${i + 1}: not yet locked`, checkLock(s, k, t0).locked === false);
    registerFailure(s, k, t0);
  }
  ok(`locked after ${LOGIN_MAX_FAILURES} failures`, checkLock(s, k, t0).locked === true);
  ok("retryAfter is positive and within the window",
     checkLock(s, k, t0).retryAfterMs > 0 && checkLock(s, k, t0).retryAfterMs <= LOGIN_WINDOW_MS);
}

console.log("2) successful login clears the counter (no self-lockout):");
{
  const s = new Map();
  const k = throttleKey("user@x.com");
  const t0 = 5_000_000;
  for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) registerFailure(s, k, t0);
  ok("one below the threshold → not locked", checkLock(s, k, t0).locked === false);
  clearFailures(s, k);                       // success
  ok("counter cleared", !s.has(k));
  // A fresh failure after success starts from 1, so a working admin never locks.
  registerFailure(s, k, t0);
  ok("post-success failure count restarts at 1", s.get(k).count === 1);
}

console.log("3) window expiry resets the lockout:");
{
  const s = new Map();
  const k = throttleKey("expire@x.com");
  const t0 = 9_000_000;
  for (let i = 0; i < LOGIN_MAX_FAILURES; i++) registerFailure(s, k, t0);
  ok("locked at t0", checkLock(s, k, t0).locked === true);
  const later = t0 + LOGIN_WINDOW_MS + 1;
  ok("unlocked after the window elapses", checkLock(s, k, later).locked === false);
  // A failure after expiry opens a NEW window rather than resuming the old count.
  registerFailure(s, k, later);
  ok("count restarts in the new window", s.get(k).count === 1);
}

console.log("4) throttle isolates accounts + enumeration resistance:");
{
  const s = new Map();
  const a = throttleKey("a@x.com"), b = throttleKey("b@x.com");
  const t0 = 2_000_000;
  for (let i = 0; i < LOGIN_MAX_FAILURES; i++) registerFailure(s, a, t0);
  ok("account A locked", checkLock(s, a, t0).locked === true);
  ok("account B unaffected", checkLock(s, b, t0).locked === false);
  // The store throttles any key it is given, existent or not — a lockout can never
  // signal whether the username maps to a real account.
  registerFailure(s, throttleKey("does-not-exist@x.com"), t0);
  ok("unknown usernames are throttled too (no existence signal via lockout)",
     s.has("does-not-exist@x.com"));
}

console.log("5) sweep drops only expired entries:");
{
  const s = new Map();
  const t0 = 3_000_000;
  registerFailure(s, "old@x.com", t0);
  registerFailure(s, "new@x.com", t0 + LOGIN_WINDOW_MS);   // newer window
  sweep(s, t0 + LOGIN_WINDOW_MS + 1);
  ok("expired entry swept", !s.has("old@x.com"));
  ok("live entry kept", s.has("new@x.com"));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
