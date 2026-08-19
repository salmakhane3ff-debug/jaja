"use client";

import { useReducer, useEffect, useRef, useState, useCallback } from "react";
import {
  feedReducer, initialFeedState, filterSignature, buildFeedUrl, PAGE_SIZE,
  restoreKey, serializeFeedState, parseRestoredState,
} from "@/lib/productFeed";

// Start the next fetch while the sentinel is still a screen away, so the user
// meets rendered cards instead of a spinner — the main lever for smooth mobile
// scrolling.
const PREFETCH_MARGIN = "600px";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Drives the All-Products infinite feed.
 *
 * The first page arrives already server-rendered (initialItems), so this hook
 * performs NO fetch on mount — it only fetches when the sentinel comes into view
 * or when the search text changes.
 *
 * The search text lives HERE rather than in the page component: restoring a feed
 * means restoring its items, its cursor AND the query that produced them, and
 * splitting that across two components is what made the query un-restorable.
 */
export function useProductFeed({
  initialItems = [],
  initialCursor = null,
  initialHasMore = false,
  initialTotal = null,
  collection = null,
}) {
  const [query, setQuery]             = useState("");  // what is typed in the box
  const [activeQuery, setActiveQuery] = useState("");  // debounced — what the server sees

  const signature = filterSignature({ collection, q: activeQuery });

  const [state, dispatch] = useReducer(
    feedReducer,
    { items: initialItems, cursor: initialCursor, hasMore: initialHasMore, total: initialTotal, signature },
    initialFeedState,
  );

  const sigRef   = useRef(signature);
  const abortRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Latest values for the save-on-exit closure, which is mounted once.
  const liveRef = useRef({ collection, activeQuery });
  liveRef.current = { collection, activeQuery };

  // ── Debounced search ────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setActiveQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // ── Fetch one page ──────────────────────────────────────────────────────────
  const load = useCallback(async (cursor, sig) => {
    abortRef.current?.abort();               // cancel any outdated in-flight page
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    dispatch({ type: "LOAD_START", signature: sig });
    try {
      const res = await fetch(buildFeedUrl({ cursor, collection, q: activeQuery, limit: PAGE_SIZE }), {
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (sigRef.current !== sig) return;    // filters moved on — discard
      dispatch({
        type: "LOAD_SUCCESS",
        signature: sig,
        items: data.items,
        nextCursor: data.nextCursor,
        hasMore: data.hasMore,
        total: data.total,
      });
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (sigRef.current !== sig) return;
      dispatch({ type: "LOAD_ERROR", signature: sig, error: err?.message || "load failed" });
    }
  }, [collection, activeQuery]);

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (!s.hasMore || s.status === "loading" || s.status === "error") return;
    load(s.cursor, sigRef.current);
  }, [load]);

  const retry = useCallback(() => {
    const s = stateRef.current;
    load(s.cursor, sigRef.current);
  }, [load]);

  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  // ── Filters changed ─────────────────────────────────────────────────────────
  // Also the guard that makes restore free: the restore effect adopts the
  // restored signature into sigRef BEFORE activeQuery catches up, so when this
  // effect re-runs for the restored query it sees no change and does nothing.
  useEffect(() => {
    if (sigRef.current === signature) return;   // first run / restored / no real change
    sigRef.current = signature;
    abortRef.current?.abort();

    if (!activeQuery) {
      // No search: the Server Component already re-rendered with the correct
      // first page for this collection — adopt it, no round-trip.
      dispatch({
        type: "SSR_RESET",
        signature,
        items: initialItems,
        cursor: initialCursor,
        hasMore: initialHasMore,
        total: initialTotal,
      });
    } else {
      dispatch({ type: "RESET", signature });
      load(null, signature);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // ── Infinite scroll sentinel ────────────────────────────────────────────────
  // A CALLBACK ref, not useRef + useEffect([]).
  //
  // The sentinel element is rendered conditionally (`hasMore && !error`), so it
  // unmounts whenever a list runs out — a search with few results, or one with
  // none at all. A mount-time observer kept watching that detached node forever:
  // the next search remounted a NEW node that nothing observed, so the feed
  // stopped loading page 2 for the rest of the session and the page showed
  // "93 results" above 16 cards. Observing from the ref callback re-binds every
  // time the node changes, including the very first time it appears.
  const observerRef = useRef(null);
  const sentinelRef = useCallback((el) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMoreRef.current(); },
      { rootMargin: PREFETCH_MARGIN },
    );
    io.observe(el);
    observerRef.current = io;
  }, []);
  useEffect(() => () => observerRef.current?.disconnect(), []);

  // A page that finished loading while the sentinel was already on screen
  // produces no new intersection event (the observer only fires on CHANGE), so
  // re-check once each load settles. Without this the feed can stall after the
  // first page even though the sentinel is visible.
  useEffect(() => {
    if (state.status !== "idle" || !state.hasMore) return;
    const el = document.querySelector("[data-feed-sentinel]");
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewportH = window.innerHeight || 0;
    if (rect.top <= viewportH + 600) loadMoreRef.current();
  }, [state.status, state.hasMore, state.items.length]);

  // ── Back-navigation restore ─────────────────────────────────────────────────
  // Save on the way out, keyed by collection; restore once on the way back.
  useEffect(() => {
    const save = () => {
      const s = stateRef.current;
      if (s.items.length <= PAGE_SIZE) return;  // nothing worth restoring
      const { collection: liveCollection, activeQuery: liveQuery } = liveRef.current;
      try {
        sessionStorage.setItem(
          restoreKey(liveCollection),
          JSON.stringify(serializeFeedState({
            items:   s.items,
            cursor:  s.cursor,
            hasMore: s.hasMore,
            total:   s.total,
            q:       liveQuery,          // ← the query that produced this list
            scrollY: window.scrollY,
          })),
        );
      } catch { /* private mode / quota — restoring is best-effort */ }
    };
    window.addEventListener("pagehide", save);
    return () => { save(); window.removeEventListener("pagehide", save); };
  }, []);

  useEffect(() => {
    const key = restoreKey(collection);
    let saved;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      sessionStorage.removeItem(key);          // one-shot
      saved = parseRestoredState(raw);         // null when malformed or > 30 min old
    } catch { return; }
    if (!saved) return;

    // Adopt the restored signature FIRST. The filter-change effect above then sees
    // sigRef.current === signature once activeQuery catches up, so the restored
    // search never triggers a duplicate request, and page 1 is never refetched.
    const restoredSig = filterSignature({ collection, q: saved.q });
    sigRef.current = restoredSig;
    setQuery(saved.q);
    setActiveQuery(saved.q);
    dispatch({
      type: "HYDRATE",
      signature: restoredSig,
      items: saved.items,
      cursor: saved.cursor,
      hasMore: saved.hasMore,
      total: saved.total,
    });
    requestAnimationFrame(() => window.scrollTo(0, saved.scrollY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    items:   state.items,
    total:   state.total,
    hasMore: state.hasMore,
    loading: state.status === "loading",
    error:   state.status === "error" ? state.error : null,
    query,
    setQuery,
    activeQuery,
    sentinelRef,
    loadMore,
    retry,
  };
}
