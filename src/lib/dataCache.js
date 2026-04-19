/**
 * src/lib/dataCache.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Module-level request deduplication for client-side fetches.
 *
 * Problem: Multiple components on the homepage each call fetch("/api/products")
 * independently, causing 10+ identical network requests on every page load.
 *
 * Solution: The first component to call fetchCached() starts the real fetch.
 * Every subsequent call within the TTL window receives the same Promise —
 * the browser never makes a second request.
 *
 * Usage:
 *   import { fetchCached } from '@/lib/dataCache';
 *   const products = await fetchCached('/api/products');
 * ─────────────────────────────────────────────────────────────────────────────
 */

const cache = new Map(); // url → { promise, ts }
const TTL   = 60_000;   // 60 seconds

/**
 * Fetch with deduplication + TTL cache.
 * Returns parsed JSON. Throws on non-ok response.
 */
export function fetchCached(url, options = {}) {
  const now    = Date.now();
  const cached = cache.get(url);

  // Return cached promise if still fresh
  if (cached && now - cached.ts < TTL) {
    return cached.promise;
  }

  // Start a new fetch and cache the Promise immediately
  // (so concurrent callers get the same Promise, not N requests)
  const promise = fetch(url, { cache: "no-store", ...options })
    .then((r) => {
      if (!r.ok) throw new Error(`${url} → ${r.status}`);
      return r.json();
    })
    .catch((err) => {
      // Evict on error so next call retries
      cache.delete(url);
      throw err;
    });

  cache.set(url, { promise, ts: now });
  return promise;
}

/**
 * Manually invalidate a cached URL (e.g. after a mutation).
 */
export function invalidateCache(url) {
  cache.delete(url);
}

/**
 * Clear the entire cache.
 */
export function clearCache() {
  cache.clear();
}
