/**
 * src/lib/loginThrottle.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-username failed-login throttle. Complements the per-IP limiter in
 * rateLimit.js: IP catches spraying across accounts, username catches targeted
 * guessing against one account.
 *
 * Pure + clock-injectable so it is unit-testable with no timers and no DB. The
 * controller owns a single module-scoped store and passes Date.now().
 *
 * Counts FAILURES only, and a successful login clears the counter — a working
 * admin can never lock themselves out by logging in.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const LOGIN_MAX_FAILURES = 5;          // failures allowed per window
export const LOGIN_WINDOW_MS     = 15 * 60_000; // 15 minutes

// Normalize the account key so "Admin@x.com " and "admin@x.com" share a bucket.
export function throttleKey(email) {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * Record one failed attempt. Returns the updated entry.
 * @param {Map} store  key → { count, firstAt, resetAt }
 */
export function registerFailure(store, key, now = Date.now(), opts = {}) {
  const windowMs = opts.windowMs ?? LOGIN_WINDOW_MS;
  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    const fresh = { count: 1, firstAt: now, resetAt: now + windowMs };
    store.set(key, fresh);
    return fresh;
  }
  entry.count += 1;
  return entry;
}

/**
 * Is this key currently locked out?
 * @returns {{locked: boolean, retryAfterMs: number}}
 */
export function checkLock(store, key, now = Date.now(), opts = {}) {
  const max = opts.max ?? LOGIN_MAX_FAILURES;
  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) return { locked: false, retryAfterMs: 0 };
  if (entry.count >= max) return { locked: true, retryAfterMs: Math.max(0, entry.resetAt - now) };
  return { locked: false, retryAfterMs: 0 };
}

/** Clear on successful login. */
export function clearFailures(store, key) {
  store.delete(key);
}

/** Drop expired entries — call opportunistically to bound memory. */
export function sweep(store, now = Date.now()) {
  for (const [k, v] of store) if (now >= v.resetAt) store.delete(k);
}
