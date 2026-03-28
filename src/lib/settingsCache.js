/**
 * Client-side in-memory cache for API settings calls.
 *
 * All components that need the same key will share one in-flight
 * promise and one resolved value — no matter how many call simultaneously.
 *
 * TTL: 5 minutes (configurable). After that the next consumer re-fetches.
 *
 * Usage:
 *   fetchSetting("discount_rules")            → GET /api/setting?type=discount_rules
 *   fetchSetting("__ui-control__", "/api/ui-control")  → GET /api/ui-control
 */

const cache = new Map(); // key → { promise, data, ts }
const TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function fetchSetting(key, customUrl) {
  const url = customUrl ?? `/api/setting?type=${key}`;
  const now  = Date.now();
  const hit  = cache.get(key);

  // Return cached data if still fresh
  if (hit && hit.data !== undefined && now - hit.ts < TTL_MS) {
    return hit.data;
  }

  // Return in-flight promise if already pending
  if (hit && hit.promise) {
    return hit.promise;
  }

  // New fetch
  const promise = fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      cache.set(key, { data, ts: Date.now(), promise: null });
      return data;
    })
    .catch(() => {
      cache.delete(key); // allow retry on error
      return null;
    });

  cache.set(key, { promise, data: undefined, ts: now });
  return promise;
}

/** Force-invalidate a cached key (call after admin saves settings). */
export function invalidateSetting(key) {
  cache.delete(key);
}
