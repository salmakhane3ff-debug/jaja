#!/usr/bin/env node
/**
 * scripts/productFeed.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the All-Products infinite feed logic (src/lib/productFeed.js).
 * Pure logic — no DB, no DOM, no test framework. Run:
 *   node scripts/productFeed.test.mjs
 *
 * DOM-level behaviour (IntersectionObserver firing, real scroll restoration,
 * mobile scroll smoothness) is verified manually — see the manual steps in the
 * implementation report. This file covers everything that is pure.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  PAGE_SIZE, MAX_PAGE_SIZE, RESTORE_TTL_MS, RESTORE_MAX_ITEMS,
  encodeCursor, decodeCursor,
  filterSignature, normalizeFilters, buildFeedUrl, clampLimit,
  initialFeedState, feedReducer,
  restoreKey, serializeFeedState, parseRestoredState,
} from "../src/lib/productFeed.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const P = (id, i = 0) => ({ _id: id, id, title: `P${id}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) });
const SIG = filterSignature({});

console.log("1) initial SSR page:");
{
  const ssr = [P("a"), P("b")];
  const s = initialFeedState({ items: ssr, cursor: "cur1", hasMore: true, signature: SIG, total: 40 });
  ok("SSR items adopted with no fetch", s.items.length === 2 && s.cursor === "cur1" && s.hasMore === true);
  ok("ids indexed for dedupe", s.ids.has("a") && s.ids.has("b"));
  ok("status idle on first paint (no spinner over SSR content)", s.status === "idle" && s.error === null);
  ok("total carried from the server", s.total === 40);
  ok("page size is 16", PAGE_SIZE === 16);
}

console.log("2) infinite scroll (append next page):");
{
  let s = initialFeedState({ items: [P("a")], cursor: "c1", hasMore: true, signature: SIG });
  s = feedReducer(s, { type: "LOAD_START", signature: SIG });
  ok("loading flag set", s.status === "loading");
  s = feedReducer(s, { type: "LOAD_SUCCESS", signature: SIG, items: [P("b"), P("c")], nextCursor: "c2", hasMore: true });
  ok("appends (does not replace)", s.items.map((p) => p._id).join(",") === "a,b,c");
  ok("cursor advances", s.cursor === "c2" && s.hasMore === true && s.status === "idle");
}

console.log("3) end of list:");
{
  let s = initialFeedState({ items: [P("a")], cursor: "c1", hasMore: true, signature: SIG });
  s = feedReducer(s, { type: "LOAD_SUCCESS", signature: SIG, items: [P("b")], nextCursor: null, hasMore: false });
  ok("hasMore false + cursor null → sentinel unmounts", s.hasMore === false && s.cursor === null);
}

console.log("4) duplicate prevention:");
{
  let s = initialFeedState({ items: [P("a"), P("b")], cursor: "c1", hasMore: true, signature: SIG });
  s = feedReducer(s, { type: "LOAD_SUCCESS", signature: SIG, items: [P("b"), P("c")], nextCursor: "c2", hasMore: true });
  ok("overlapping row dropped, new one kept", s.items.map((p) => p._id).join(",") === "a,b,c");
  // Same page delivered twice (double-fire of the sentinel) must be a no-op.
  s = feedReducer(s, { type: "LOAD_SUCCESS", signature: SIG, items: [P("a"), P("b"), P("c")], nextCursor: "c2", hasMore: true });
  ok("replayed page adds nothing", s.items.length === 3);
}

console.log("5) filters (collection):");
{
  ok("signature changes with collection", filterSignature({ collection: "Gifts" }) !== filterSignature({}));
  ok("signature is case-preserving but distinct", filterSignature({ collection: "Gifts" }) !== filterSignature({ collection: "Toys" }));
  ok("url carries collection", buildFeedUrl({ collection: "Gifts" }) === "/api/products/feed?collection=Gifts");
  ok("url encodes special chars", buildFeedUrl({ collection: "A&B" }).includes("collection=A%26B"));
  const sigA = filterSignature({ collection: "Gifts" });
  let s = initialFeedState({ items: [P("a")], cursor: "c1", hasMore: true, signature: SIG });
  s = feedReducer(s, { type: "SSR_RESET", signature: sigA, items: [P("z")], cursor: "cz", hasMore: true, total: 3 });
  ok("collection change adopts SSR page, drops old items", s.items.length === 1 && s.items[0]._id === "z" && s.signature === sigA);
  ok("stale ids cleared with the list", !s.ids.has("a") && s.ids.has("z"));
}

console.log("6) search:");
{
  ok("url carries q", buildFeedUrl({ q: "lampe" }) === "/api/products/feed?q=lampe");
  ok("blank q ignored", buildFeedUrl({ q: "   " }) === "/api/products/feed");
  ok("q + collection + cursor combine", buildFeedUrl({ q: "x", collection: "Gifts", cursor: "cur" }) === "/api/products/feed?collection=Gifts&q=x&cur".replace("&cur", "&cursor=cur"));
  ok("normalizeFilters trims", normalizeFilters({ q: "  hi  ", collection: " Gifts " }).q === "hi");
  const sigQ = filterSignature({ q: "lampe" });
  let s = initialFeedState({ items: [P("a"), P("b")], cursor: "c1", hasMore: true, signature: SIG });
  s = feedReducer(s, { type: "RESET", signature: sigQ });
  ok("search resets to an empty loading list", s.items.length === 0 && s.status === "loading" && s.signature === sigQ && s.hasMore === true);
}

console.log("7) outdated requests are discarded (filters changed mid-flight):");
{
  const sigOld = SIG, sigNew = filterSignature({ q: "new" });
  let s = initialFeedState({ items: [], cursor: null, hasMore: true, signature: sigNew });
  s = feedReducer(s, { type: "LOAD_SUCCESS", signature: sigOld, items: [P("stale")], nextCursor: "x", hasMore: true });
  ok("stale success ignored", s.items.length === 0);
  s = feedReducer(s, { type: "LOAD_ERROR", signature: sigOld, error: "boom" });
  ok("stale error ignored", s.status !== "error");
  s = feedReducer(s, { type: "LOAD_START", signature: sigOld });
  ok("stale start ignored", s.status !== "loading");
}

console.log("8) retry:");
{
  let s = initialFeedState({ items: [P("a"), P("b")], cursor: "c1", hasMore: true, signature: SIG });
  s = feedReducer(s, { type: "LOAD_START", signature: SIG });
  s = feedReducer(s, { type: "LOAD_ERROR", signature: SIG, error: "HTTP 500" });
  ok("error keeps loaded items on screen (never blanks)", s.items.length === 2 && s.status === "error" && s.error === "HTTP 500");
  ok("cursor preserved so retry resumes at the same page", s.cursor === "c1");
  s = feedReducer(s, { type: "LOAD_START", signature: SIG });
  ok("retry clears the error", s.status === "loading" && s.error === null);
  s = feedReducer(s, { type: "LOAD_SUCCESS", signature: SIG, items: [P("c")], nextCursor: "c2", hasMore: true });
  ok("retry recovers and appends", s.items.map((p) => p._id).join(",") === "a,b,c" && s.status === "idle");
}

console.log("9) scroll restoration (back navigation):");
{
  const saved = { items: [P("a"), P("b"), P("c")], cursor: "c9", hasMore: true, total: 30 };
  let s = initialFeedState({ items: [P("a")], cursor: "c1", hasMore: true, signature: SIG });
  s = feedReducer(s, { type: "HYDRATE", signature: SIG, ...saved });
  ok("restores the full loaded list, not just the SSR page", s.items.length === 3);
  ok("restores the cursor so scrolling continues", s.cursor === "c9" && s.hasMore === true);
  ok("restored ids rebuilt (no dupes after restore)", s.ids.size === 3 && s.ids.has("c"));
  s = feedReducer(s, { type: "LOAD_SUCCESS", signature: SIG, items: [P("c"), P("d")], nextCursor: null, hasMore: false });
  ok("post-restore page dedupes against restored items", s.items.map((p) => p._id).join(",") === "a,b,c,d");
}

console.log("10) cursor codec (opaque keyset, default sort createdAt DESC, id DESC):");
{
  const row = { id: "abc-123", createdAt: new Date("2026-05-01T10:20:30.400Z") };
  const cur = encodeCursor(row);
  ok("cursor is opaque (no readable id/date)", !cur.includes("abc-123") && !cur.includes("2026"));
  const back = decodeCursor(cur);
  ok("round-trips both keyset parts", back.id === "abc-123" && back.createdAt === "2026-05-01T10:20:30.400Z");
  ok("ISO string createdAt also encodes", decodeCursor(encodeCursor({ id: "x", createdAt: "2026-05-01T10:20:30.400Z" })).id === "x");
  ok("garbage → null (falls back to first page, never throws)", decodeCursor("!!!not-base64!!!") === null);
  ok("valid base64 of wrong shape → null", decodeCursor(btoa(JSON.stringify({ nope: 1 }))) === null);
  ok("invalid date → null", decodeCursor(btoa(JSON.stringify({ t: "not-a-date", i: "x" }))) === null);
  ok("empty/absent → null", decodeCursor(null) === null && decodeCursor("") === null);
  ok("incomplete row → no cursor", encodeCursor({ id: "x" }) === null && encodeCursor(null) === null);
}

console.log("11) page size limits (mobile batches stay small):");
{
  ok("default is 16", clampLimit(undefined) === 16 && clampLimit(null) === 16);
  ok("garbage → default", clampLimit("abc") === 16 && clampLimit("-5") === 16 && clampLimit("0") === 16);
  ok("honours explicit size", clampLimit("24") === 24);
  ok("caps runaway page size", clampLimit("100000") === MAX_PAGE_SIZE);
  ok("default page size omitted from url", !buildFeedUrl({ limit: PAGE_SIZE }).includes("limit"));
}

console.log("12) search restoration on Back (saved state carries the query):");
{
  // User searched "lampe" in the Gifts collection and scrolled 3 pages deep.
  const searched = [P("s1"), P("s2"), P("s3")];
  const raw = JSON.stringify(serializeFeedState({
    items: searched, cursor: "cur-9", hasMore: true, total: 42, q: "lampe", scrollY: 1840,
  }));

  ok("key is NOT the search query", restoreKey("Gifts") === "productFeed:c=Gifts" && !restoreKey("Gifts").includes("lampe"));
  ok("saved payload carries the query", JSON.parse(raw).q === "lampe");

  // Back: the page remounts with an EMPTY search box, so the lookup can only use
  // the collection — this is exactly what the old q-keyed version got wrong.
  const saved = parseRestoredState(sessionStorageLookalike(raw, restoreKey("Gifts"), restoreKey("Gifts")));
  ok("search query restored", saved.q === "lampe");
  ok("loaded search-result pages restored", saved.items.length === 3 && saved.items[0]._id === "s1");
  ok("cursor + hasMore restored", saved.cursor === "cur-9" && saved.hasMore === true);
  ok("scroll position restored", saved.scrollY === 1840);

  // The hook adopts this signature BEFORE activeQuery catches up.
  const restoredSig = filterSignature({ collection: "Gifts", q: saved.q });
  let s = initialFeedState({ items: [P("ssr")], cursor: "c1", hasMore: true, signature: filterSignature({ collection: "Gifts" }) });
  s = feedReducer(s, {
    type: "HYDRATE", signature: restoredSig,
    items: saved.items, cursor: saved.cursor, hasMore: saved.hasMore, total: saved.total,
  });
  ok("hydrated list replaces the SSR page (no page-1 refetch)", s.items.length === 3 && s.items[0]._id === "s1");
  ok("hydrated state adopts the restored (searched) signature", s.signature === restoredSig);
  ok("restored total preserved", s.total === 42);

  // No duplicate search request: once activeQuery === restored q, the hook's
  // filter-change guard (sigRef.current === signature) sees no change.
  const sigAfterDebounceCatchesUp = filterSignature({ collection: "Gifts", q: "lampe" });
  ok("no reset/refetch after hydration (signature already matches)", sigAfterDebounceCatchesUp === restoredSig && sigAfterDebounceCatchesUp === s.signature);

  // Cursor resumes: next page uses the restored cursor AND the restored query.
  const url = buildFeedUrl({ cursor: saved.cursor, collection: "Gifts", q: saved.q });
  ok("cursor resumes with the restored search", url.includes("cursor=cur-9") && url.includes("q=lampe") && url.includes("collection=Gifts"));
  s = feedReducer(s, { type: "LOAD_SUCCESS", signature: restoredSig, items: [P("s3"), P("s4")], nextCursor: "cur-10", hasMore: true });
  ok("resumed page appends + dedupes against restored items", s.items.map((p) => p._id).join(",") === "s1,s2,s3,s4");
}

console.log("13) restoration guards:");
{
  const mk = (over = {}) => JSON.stringify(serializeFeedState({
    items: [P("a"), P("b")], cursor: "c", hasMore: true, q: "lampe", scrollY: 10, ...over,
  }));

  ok("expired state ignored (older than 30 min)",
     parseRestoredState(mk({ now: Date.now() - (RESTORE_TTL_MS + 1000) })) === null);
  ok("just-inside TTL still restores",
     parseRestoredState(mk({ now: Date.now() - (RESTORE_TTL_MS - 5000) })) !== null);
  ok("TTL is 30 minutes", RESTORE_TTL_MS === 30 * 60 * 1000);

  ok("different collection does not consume another collection's state",
     restoreKey("Gifts") !== restoreKey("Toys") && restoreKey("Toys") !== restoreKey(null));
  ok("no-collection key is distinct and stable", restoreKey(null) === "productFeed:c=" && restoreKey(undefined) === restoreKey(null));
  ok("collection key ignores surrounding whitespace", restoreKey(" Gifts ") === restoreKey("Gifts"));

  ok("malformed payload ignored", parseRestoredState("{not json") === null);
  ok("empty item list ignored", parseRestoredState(JSON.stringify({ items: [], ts: Date.now() })) === null);
  ok("missing timestamp ignored", parseRestoredState(JSON.stringify({ items: [P("a")] })) === null);
  ok("absent entry ignored", parseRestoredState(null) === null);
  ok("missing q defaults to empty (no crash on older payloads)",
     parseRestoredState(JSON.stringify({ items: [P("a")], ts: Date.now() })).q === "");

  const big = serializeFeedState({ items: Array.from({ length: 250 }, (_, i) => P(`p${i}`)), q: "x" });
  ok("200-item cap kept", big.items.length === RESTORE_MAX_ITEMS && RESTORE_MAX_ITEMS === 200);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Models the hook's lookup: it can only read the key it can build on mount
// (collection only — the search box is empty at that point).
function sessionStorageLookalike(raw, savedUnderKey, lookedUpWithKey) {
  return savedUnderKey === lookedUpWithKey ? raw : null;
}
