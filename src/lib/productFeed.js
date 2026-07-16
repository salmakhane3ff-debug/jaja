/**
 * src/lib/productFeed.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure logic for the All-Products infinite feed. No React, no DB, no Buffer —
 * isomorphic (server + browser) and unit-testable with plain Node.
 *
 * Contains:
 *   • the opaque keyset cursor codec  (server encodes/decodes; client only relays)
 *   • the filter signature            (identifies "which list are we showing")
 *   • the feed URL builder
 *   • feedReducer                     (append / reset / dedupe / retry state)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const PAGE_SIZE = 16;
export const MAX_PAGE_SIZE = 48;

// ── Cursor ────────────────────────────────────────────────────────────────────
// Opaque base64 of the last row's keyset (createdAt, id). Opaque on purpose: the
// client must never construct or interpret one — it only echoes it back.
// btoa/atob (not Buffer) so this module also loads in the browser bundle.

export function encodeCursor(row) {
  if (!row || !row.id || !row.createdAt) return null;
  const createdAt =
    row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt);
  return btoa(JSON.stringify({ t: createdAt, i: String(row.id) }));
}

// Returns { createdAt: ISO string, id } — or null for absent//malformed/tampered
// input, in which case the caller must fall back to "first page" rather than error.
export function decodeCursor(cursor) {
  if (!cursor || typeof cursor !== "string") return null;
  try {
    const parsed = JSON.parse(atob(cursor));
    if (!parsed || typeof parsed.t !== "string" || typeof parsed.i !== "string") return null;
    if (Number.isNaN(Date.parse(parsed.t))) return null;
    return { createdAt: parsed.t, id: parsed.i };
  } catch {
    return null;
  }
}

// ── Filters ───────────────────────────────────────────────────────────────────

export function normalizeFilters({ collection, q } = {}) {
  const c = typeof collection === "string" && collection.trim() ? collection.trim() : null;
  const s = typeof q === "string" && q.trim() ? q.trim() : null;
  return { collection: c, q: s };
}

// Identifies the current list. When it changes, the feed must reset: in-flight
// requests are stale and already-loaded items belong to a different list.
export function filterSignature(filters) {
  const { collection, q } = normalizeFilters(filters);
  return `c=${collection ?? ""}|q=${q ?? ""}`;
}

export function buildFeedUrl({ cursor, collection, q, limit } = {}) {
  const f = normalizeFilters({ collection, q });
  const params = new URLSearchParams();
  if (f.collection) params.set("collection", f.collection);
  if (f.q) params.set("q", f.q);
  if (cursor) params.set("cursor", cursor);
  if (limit && limit !== PAGE_SIZE) params.set("limit", String(limit));
  const qs = params.toString();
  return `/api/products/feed${qs ? `?${qs}` : ""}`;
}

export function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

// ── Back-navigation restore ───────────────────────────────────────────────────

export const RESTORE_TTL_MS = 30 * 60 * 1000;
export const RESTORE_MAX_ITEMS = 200; // keeps the sessionStorage write under quota

// Keyed by COLLECTION ONLY — deliberately NOT by the search text. The page
// remounts with an empty search box, so a q-keyed entry could never be found
// again; the search text is restored FROM the payload instead of identifying it.
// Collection stays in the key so one collection's feed never adopts another's.
export function restoreKey(collection) {
  const { collection: c } = normalizeFilters({ collection });
  return `productFeed:c=${c ?? ""}`;
}

// Everything needed to put the user back exactly where they were.
export function serializeFeedState({ items, cursor, hasMore, total, q, scrollY, now = Date.now() } = {}) {
  return {
    items:   (Array.isArray(items) ? items : []).slice(0, RESTORE_MAX_ITEMS),
    cursor:  cursor ?? null,
    hasMore: Boolean(hasMore),
    total:   total ?? null,
    q:       typeof q === "string" ? q : "",   // travels WITH the list, not in the key
    scrollY: Number.isFinite(scrollY) ? scrollY : 0,
    ts:      now,
  };
}

// Returns the restorable state, or null when absent / malformed / expired.
export function parseRestoredState(raw, now = Date.now()) {
  if (!raw) return null;
  let saved;
  try {
    saved = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!saved || !Array.isArray(saved.items) || saved.items.length === 0) return null;
  if (!Number.isFinite(saved.ts) || now - saved.ts > RESTORE_TTL_MS) return null;
  return {
    items:   saved.items,
    cursor:  saved.cursor ?? null,
    hasMore: Boolean(saved.hasMore),
    total:   saved.total ?? null,
    q:       typeof saved.q === "string" ? saved.q : "",
    scrollY: Number.isFinite(saved.scrollY) ? saved.scrollY : 0,
  };
}

// ── Feed state ────────────────────────────────────────────────────────────────
// status: "idle" | "loading" | "error"

export function initialFeedState({ items = [], cursor = null, hasMore = false, signature = "", total = null } = {}) {
  const list = Array.isArray(items) ? items : [];
  return {
    items: list,
    ids: new Set(list.map((p) => p._id)),
    cursor,
    hasMore: Boolean(hasMore),
    status: "idle",
    error: null,
    signature,
    total,
  };
}

export function feedReducer(state, action) {
  switch (action.type) {
    // A new list (search changed) — drop everything and start over.
    case "RESET":
      return { ...initialFeedState({ signature: action.signature, hasMore: true }), status: "loading" };

    // A new list whose first page the SERVER already rendered (collection change,
    // or search cleared) — adopt it directly, no network round-trip.
    case "SSR_RESET":
      return initialFeedState({
        items: action.items,
        cursor: action.cursor,
        hasMore: action.hasMore,
        signature: action.signature,
        total: action.total ?? null,
      });

    // Restored from sessionStorage on back-navigation.
    case "HYDRATE":
      return initialFeedState({
        items: action.items,
        cursor: action.cursor,
        hasMore: action.hasMore,
        signature: action.signature,
        total: action.total ?? null,
      });

    case "LOAD_START":
      if (action.signature !== state.signature) return state;
      return { ...state, status: "loading", error: null };

    case "LOAD_SUCCESS": {
      if (action.signature !== state.signature) return state; // stale response
      // Dedupe: never show the same product twice, even if a concurrent write
      // shifted rows between pages.
      const incoming = (action.items || []).filter((p) => p && !state.ids.has(p._id));
      const ids = new Set(state.ids);
      for (const p of incoming) ids.add(p._id);
      return {
        ...state,
        items: state.items.concat(incoming),
        ids,
        cursor: action.nextCursor ?? null,
        hasMore: Boolean(action.hasMore),
        status: "idle",
        error: null,
        total: action.total ?? state.total,
      };
    }

    case "LOAD_ERROR":
      if (action.signature !== state.signature) return state;
      // Keep whatever is already on screen — the page must never blank out.
      return { ...state, status: "error", error: action.error || "load failed" };

    default:
      return state;
  }
}
