#!/usr/bin/env node
/**
 * scripts/productSearch.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * The /products storefront search.
 *
 * BUG 1 — phrase matching. The feed bound the WHOLE raw query as one LIKE
 *   pattern (`%${q}%`), so matching required the words to appear contiguously in
 *   the typed order: "iPhone Apple" returned 0 rows against "Apple iPhone 14
 *   128GB Red". Search is now token-based and order-independent.
 *
 * BUG 2 — unreachable matches. Page 2+ was only ever requested by an
 *   IntersectionObserver bound ONCE at mount to a CONDITIONALLY rendered
 *   sentinel (`hasMore && !error`). Any list that ran out — a narrow search, or
 *   a zero-result one — unmounted that node, and the observer kept watching the
 *   detached element for the rest of the session. The next search remounted a
 *   new node nothing observed, so the page showed "93 produit(s) trouvé(s)"
 *   above 16 cards with no way to reach the rest.
 *
 * The pure predicate here is the REFERENCE implementation; the SQL applies the
 * identical rule, and section 6 asserts the two agree structurally.
 *
 * Run: node scripts/productSearch.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from "node:fs";
import {
  tokenize, escapeLike, searchParam, searchableText, matchesQuery, filterByQuery,
  TOKEN_DELIMITER, MAX_TOKENS,
} from "../src/lib/productSearch.js";
import {
  PAGE_SIZE, MAX_PAGE_SIZE, clampLimit, buildFeedUrl, filterSignature,
  feedReducer, initialFeedState,
} from "../src/lib/productFeed.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const SERVICE = readFileSync("src/lib/services/productService.js", "utf8");
const HOOK    = readFileSync("src/hooks/useProductFeed.js", "utf8");
const CLIENT  = readFileSync("src/app/products/ProductsClient.jsx", "utf8");
const ROUTE   = readFileSync("src/app/api/products/feed/route.js", "utf8");
const PAGE    = readFileSync("src/app/products/page.jsx", "utf8");
const AR      = JSON.parse(readFileSync("src/locales/ar.json", "utf8"));
const FR      = JSON.parse(readFileSync("src/locales/fr.json", "utf8"));

/** Strip comments — several assertions are about CODE, not prose. */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SERVICE_CODE = codeOnly(SERVICE);
const HOOK_CODE    = codeOnly(HOOK);
const CLIENT_CODE  = codeOnly(CLIENT);

// The exact production titles from the bug report.
const CATALOGUE = [
  { _id: "p1", title: "Apple iPhone 14 128GB Red" },
  { _id: "p2", title: "Apple iPhone 16 128GB Black" },
  { _id: "p3", title: "Apple iPhone 15 Pro Max 256GB Black" },
  { _id: "p4", title: "Apple iPhone 13 128GB White" },
  { _id: "p5", title: "Samsung Galaxy S24 Ultra 512GB" },
  { _id: "p6", title: "Apple MacBook Air 15 inch M3" },
];
const IPHONE_14 = CATALOGUE[0];

// ─────────────────────────────────────────────────────────────────────────────
console.log("1) THE EXACT PRODUCTION CASES:");
{
  ok('"iphone" matches "Apple iPhone 14 128GB Red"', matchesQuery(IPHONE_14, "iphone") === true);
  ok('"apple" matches the same title',               matchesQuery(IPHONE_14, "apple") === true);
  ok('"iphone apple" matches (THE 0-RESULT BUG)',    matchesQuery(IPHONE_14, "iphone apple") === true);
  ok('"apple iphone" matches',                       matchesQuery(IPHONE_14, "apple iphone") === true);
  ok('"iphone 14" matches',                          matchesQuery(IPHONE_14, "iphone 14") === true);
  ok('"apple red" matches',                          matchesQuery(IPHONE_14, "apple red") === true);
  ok('"128GB iPhone" matches',                       matchesQuery(IPHONE_14, "128GB iPhone") === true);
  ok('"red 14 apple iphone" matches (any order)',    matchesQuery(IPHONE_14, "red 14 apple iphone") === true);

  ok('"iphone" returns all four iPhones',
    filterByQuery(CATALOGUE, "iphone").map((p) => p._id).join(",") === "p1,p2,p3,p4");
  ok('"apple" returns the four iPhones AND the MacBook',
    filterByQuery(CATALOGUE, "apple").length === 5);
  ok('"iphone apple" returns the four iPhones, not zero',
    filterByQuery(CATALOGUE, "iphone apple").length === 4);
  ok('"apple iphone" returns the same four',
    filterByQuery(CATALOGUE, "apple iphone").length === 4);
  ok("token order never changes the result set",
    JSON.stringify(filterByQuery(CATALOGUE, "iphone apple").map((p) => p._id)) ===
    JSON.stringify(filterByQuery(CATALOGUE, "apple iphone").map((p) => p._id)));
}

console.log("2) TOKEN RULES — case, spacing, missing tokens:");
{
  ok("case does not matter",
    matchesQuery(IPHONE_14, "IPHONE") && matchesQuery(IPHONE_14, "iPhOnE aPpLe") &&
    matchesQuery(IPHONE_14, "APPLE IPHONE"));
  ok("extra spaces do not matter", matchesQuery(IPHONE_14, "   apple    iphone   ") === true);
  ok("tabs and newlines are treated as separators",
    matchesQuery(IPHONE_14, "apple\tiphone\n14") === true);
  ok("a missing token correctly returns NO match",
    matchesQuery(IPHONE_14, "iphone samsung") === false);
  ok("a wholly absent term returns no match", matchesQuery(IPHONE_14, "nokia") === false);
  ok("one absent token disqualifies the row even if the rest match",
    filterByQuery(CATALOGUE, "apple galaxy").length === 0);

  ok("tokenize lowercases, splits and dedupes",
    tokenize("  Apple   IPHONE apple ").join("|") === "apple|iphone");
  ok("tokenize returns [] for empty input",
    tokenize("").length === 0 && tokenize("   ").length === 0 &&
    tokenize(null).length === 0 && tokenize(undefined).length === 0);
  ok("an empty query matches everything (filter off)",
    matchesQuery(IPHONE_14, "") === true && filterByQuery(CATALOGUE, "  ").length === CATALOGUE.length);
  ok(`tokens are capped at ${MAX_TOKENS}`,
    tokenize(Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ")).length === MAX_TOKENS);
  ok("filterByQuery never mutates its input", (() => {
    const src = CATALOGUE.slice();
    filterByQuery(src, "apple");
    return src.length === CATALOGUE.length && src[0]._id === "p1";
  })());
  ok("filterByQuery is null-safe",
    filterByQuery(null, "x").length === 0 && filterByQuery(undefined, "x").length === 0);
}

console.log("3) SEARCHABLE FIELDS — the same three as before, none added:");
{
  const p = {
    title: "Chargeur rapide",
    shortDescription: "Compatible Apple",
    description: "Câble USB-C 20W pour iPhone",
    brand: "Anker", sku: "ANK-20W", tags: "charger,usb",
    collections: ["Accessoires"],
  };
  ok("title is searched", matchesQuery(p, "chargeur") === true);
  ok("shortDescription is searched", matchesQuery(p, "compatible") === true);
  ok("description is searched", matchesQuery(p, "usb-c") === true);
  ok("tokens may be satisfied by DIFFERENT fields",
    matchesQuery(p, "chargeur iphone") === true);
  ok("brand is NOT searched (unchanged)", matchesQuery(p, "anker") === false);
  ok("sku is NOT searched (unchanged)", matchesQuery(p, "ank-20w") === false);
  ok("tags are NOT searched (unchanged)", matchesQuery(p, "charger") === false);
  ok("collections are NOT searched (unchanged)", matchesQuery(p, "accessoires") === false);
  ok("searchableText joins exactly title + shortDescription + description",
    searchableText(p) === "chargeur rapide compatible apple câble usb-c 20w pour iphone");
  ok("missing fields never throw",
    searchableText({ title: "x" }) === "x  " && searchableText(null) === "");
}

console.log("4) THE BOUND PARAMETER handed to Postgres:");
{
  ok("tokens are joined by the U+0001 delimiter", TOKEN_DELIMITER === "\u0001");
  ok("searchParam builds the delimited list",
    searchParam("iPhone Apple") === `iphone${TOKEN_DELIMITER}apple`);
  ok("an empty query switches the filter OFF (null)",
    searchParam("") === null && searchParam("   ") === null && searchParam(null) === null);
  ok("LIKE wildcards typed by the user stay literal",
    escapeLike("50%") === "50\\%" && escapeLike("a_b") === "a\\_b" && escapeLike("c\\d") === "c\\\\d");
  ok("the escaped token reaches the parameter",
    searchParam("50%") === "50\\%");
  // A pasted control character is stripped and treated as whitespace, so it can
  // only ever become a token boundary — never smuggle an extra LIKE pattern.
  ok("a pasted control character is stripped into a token boundary",
    tokenize("a\u0001b").join("|") === "a|b" && tokenize("a\u0001b").length === 2);
  ok("it cannot inject a wildcard or an extra token",
    searchParam("a\u0001b") === searchParam("a b"));
  ok("the parameter is a single scalar string, never an array",
    typeof searchParam("apple iphone") === "string");
}

console.log("5) SQL — token predicate, still static, still parameterised:");
{
  ok("the whole-phrase LIKE is gone",
    !/OR title\s+ILIKE \$2::text/.test(SERVICE_CODE) && !/likeParam/.test(SERVICE_CODE));
  ok("the predicate requires EVERY token (NOT EXISTS … NOT ILIKE)",
    /NOT EXISTS \(\s*\n\s*SELECT 1\s*\n\s*FROM unnest\(string_to_array\(\$2::text/.test(SERVICE_CODE) &&
    /NOT ILIKE \('%' \|\| tok \|\| '%'\)/.test(SERVICE_CODE));
  ok("it searches the SAME three columns, concatenated",
    /concat_ws\(' ', title, "shortDescription", description\)/.test(SERVICE_CODE));
  ok("no new column entered the search",
    !/brand\s+ILIKE|sku\s+ILIKE|tags\s+ILIKE|collections\s+ILIKE/.test(SERVICE_CODE));
  ok("a null parameter still switches search off entirely",
    /\(\$2::text IS NULL OR NOT EXISTS/.test(SERVICE_CODE));
  ok("the statement stays STATIC — no interpolated user text",
    !/\$\{q\}|\$\{filters\.q\}|\$\{searchTokens\}/.test(SERVICE_CODE));
  ok("the query value is still a bound parameter",
    /prisma\.\$queryRawUnsafe\(\s*\n?\s*FEED_SQL,[\s\S]{0,160}searchTokens,/.test(SERVICE_CODE));
  ok("the COUNT uses the SAME where clause and the SAME parameter",
    /FEED_COUNT_SQL = `SELECT count\(\*\)::int AS total FROM products \$\{FEED_WHERE\}`/.test(SERVICE_CODE) &&
    /FEED_COUNT_SQL, collectionParam, searchTokens/.test(SERVICE_CODE));
  ok("the token param comes from the shared helper",
    /import \{ searchParam \} from "\.\.\/productSearch\.js"/.test(SERVICE) &&
    /const searchTokens\s+= searchParam\(filters\.q\)/.test(SERVICE_CODE));
  ok("the delimiter in SQL matches the JS delimiter",
    /string_to_array\(\$2::text, E'\\\\x01'\)/.test(SERVICE_CODE) && TOKEN_DELIMITER.charCodeAt(0) === 0x01);
}

console.log("6) CATEGORY BROWSING IS UNCHANGED, and combines with search:");
{
  ok("the collection predicate is byte-identical",
    /WHEN jsonb_typeof\("collections"\) = 'array' THEN EXISTS \(\s*\n\s*SELECT 1 FROM jsonb_array_elements_text\("collections"\) AS t\(c\)\s*\n\s*WHERE lower\(t\.c\) = lower\(\$1::text\)\)/.test(SERVICE_CODE));
  ok("collection and search are independent AND-ed filters",
    SERVICE_CODE.indexOf("$1::text IS NULL") < SERVICE_CODE.indexOf("$2::text IS NULL"));
  ok("the feed URL carries both",
    buildFeedUrl({ collection: "Smartphones", q: "iphone" }) ===
    "/api/products/feed?collection=Smartphones&q=iphone");
  ok("the signature separates the two lists",
    filterSignature({ collection: "Smartphones", q: "iphone" }) === "c=Smartphones|q=iphone" &&
    filterSignature({ collection: "Smartphones" }) !== filterSignature({ collection: "Watches" }));
  ok("the server still renders the first page for a collection",
    /fetchProductsPage\(\{ collection, limit: PAGE_SIZE \}\)/.test(PAGE));
  ok("clearing the search adopts the SSR page instead of refetching",
    /type: "SSR_RESET"/.test(HOOK_CODE) && /if \(!activeQuery\) \{/.test(HOOK_CODE));

  // Category + search, applied together on the reference predicate.
  const inCollection = (p, c) => (p.collections || []).includes(c);
  const smartphones = CATALOGUE.map((p) => ({
    ...p, collections: p.title.includes("MacBook") ? ["Laptops"] : ["Smartphones"],
  }));
  const scoped = filterByQuery(smartphones.filter((p) => inCollection(p, "Smartphones")), "iphone");
  ok("category Smartphones + search iphone → the four iPhones", scoped.length === 4);
  ok("…and excludes the Apple MacBook in Laptops",
    !scoped.some((p) => p.title.includes("MacBook")));
  ok("category + a 2-token search still works",
    filterByQuery(smartphones.filter((p) => inCollection(p, "Smartphones")), "apple iphone").length === 4);
}

console.log("7) PAGINATION — every match is reachable:");
{
  ok("the page size is unchanged", PAGE_SIZE === 16 && MAX_PAGE_SIZE === 48);
  ok("no hidden cap beyond the page size",
    !/\.slice\(0,\s*\d+\)/.test(CLIENT_CODE) && !/items\.slice\(/.test(CLIENT_CODE));
  ok("the client renders EVERY loaded item", /items\.map\(\(product\) =>/.test(CLIENT_CODE));
  ok("clampLimit caps at MAX_PAGE_SIZE, never lower than 1",
    clampLimit(999) === MAX_PAGE_SIZE && clampLimit(0) === PAGE_SIZE && clampLimit("x") === PAGE_SIZE);

  // Walk a 93-result search to exhaustion through the real reducer.
  const TOTAL = 93;
  const serverPage = (offset) => ({
    items: Array.from({ length: Math.min(PAGE_SIZE, TOTAL - offset) }, (_, i) => ({ _id: `m${offset + i}` })),
    nextCursor: offset + PAGE_SIZE < TOTAL ? `c${offset + PAGE_SIZE}` : null,
    hasMore: offset + PAGE_SIZE < TOTAL,
    total: offset === 0 ? TOTAL : null,
  });

  let st = feedReducer(initialFeedState({ signature: "s" }), { type: "RESET", signature: "s" });
  let offset = 0, loads = 0;
  while (loads < 50) {
    const page = serverPage(offset);
    st = feedReducer(st, { type: "LOAD_SUCCESS", signature: "s", ...page });
    loads++; offset += PAGE_SIZE;
    if (!st.hasMore) break;
  }
  ok(`all ${TOTAL} matches are reachable through the feed`, st.items.length === TOTAL);
  ok("the reported total stays correct across pages", st.total === TOTAL);
  ok("the count matches what is rendered once exhausted", st.total === st.items.length);
  ok("it took ceil(93/16) = 6 pages", loads === 6);
  ok("hasMore is false only at the end", st.hasMore === false);
  ok("no duplicate product survives paging", new Set(st.items.map((p) => p._id)).size === TOTAL);

  // Duplicate rows from a concurrent write are deduped, not rendered twice.
  const dup = feedReducer(st, { type: "LOAD_SUCCESS", signature: "s", items: [{ _id: "m0" }], nextCursor: null, hasMore: false });
  ok("a repeated row is dropped rather than duplicated", dup.items.length === TOTAL);
}

console.log("8) THE SENTINEL RE-BINDS (the 93-vs-16 bug):");
{
  ok("the sentinel is a CALLBACK ref, not a mount-time observer",
    /const sentinelRef = useCallback\(\(el\) => \{/.test(HOOK_CODE));
  ok("the previous observer is disconnected before rebinding",
    /observerRef\.current\?\.disconnect\(\);\s*\n\s*observerRef\.current = null;/.test(HOOK_CODE));
  ok("a new node is observed when it appears", /io\.observe\(el\);\s*\n\s*observerRef\.current = io;/.test(HOOK_CODE));
  ok("the old useEffect([]) observer is gone",
    !/const el = sentinelRef\.current;/.test(HOOK_CODE));
  ok("the observer is still disconnected on unmount",
    /useEffect\(\(\) => \(\) => observerRef\.current\?\.disconnect\(\), \[\]\)/.test(HOOK_CODE));
  ok("a settled load re-checks an already-visible sentinel",
    /if \(state\.status !== "idle" \|\| !state\.hasMore\) return;/.test(HOOK_CODE) &&
    /rect\.top <= viewportH \+ 600/.test(HOOK_CODE));
  ok("the sentinel element is findable for that re-check",
    /data-feed-sentinel/.test(CLIENT_CODE) && /data-feed-sentinel/.test(HOOK_CODE));

  // Simulation of the exact production sequence.
  const makeFeed = () => {
    const st = { node: null, observed: null, hasMore: false, loads: 0 };
    st.bind = (el) => { st.observed = el; };                    // callback ref
    st.render = () => {
      const next = st.hasMore ? { id: Math.random() } : null;   // conditional node
      if (next !== st.node) { st.node = next; st.bind(next); }  // React re-invokes the ref
    };
    st.scroll = () => { if (st.observed && st.observed === st.node) st.loads++; };
    return st;
  };

  const f = makeFeed();
  f.hasMore = true;  f.render();                 // first list, sentinel present
  f.scroll();
  ok("infinite scroll works on the first list", f.loads === 1);

  f.hasMore = false; f.render();                 // a zero-result search unmounts it
  ok("the sentinel is removed when a list runs out", f.node === null);

  f.hasMore = true;  f.render();                 // the 93-result search remounts it
  f.scroll();
  ok("the REMOUNTED sentinel is observed again (the fix)", f.loads === 2);

  // The old behaviour, for contrast.
  const stale = makeFeed();
  stale.bind = (() => { let bound = false; return (el) => { if (!bound && el) { stale.observed = el; bound = true; } }; })();
  stale.hasMore = true;  stale.render(); stale.scroll();
  stale.hasMore = false; stale.render();
  stale.hasMore = true;  stale.render(); stale.scroll();
  ok("the OLD mount-once observer really did go dead after a remount", stale.loads === 1);
}

console.log("9) AN EXPLICIT LOAD-MORE PATH EXISTS:");
{
  ok("the hook exposes loadMore", /loadMore,\n/.test(HOOK_CODE) && /loadMore/.test(CLIENT_CODE));
  ok("the client renders a Load more button while more remain",
    /\{hasMore && !error && !loading && \(/.test(CLIENT_CODE) && /onClick=\{loadMore\}/.test(CLIENT_CODE));
  ok("the button is hidden once everything is loaded",
    /hasMore && !error && !loading/.test(CLIENT_CODE));
  ok("the label is localized, not hardcoded", /t\("page_load_more"\)/.test(CLIENT_CODE));
  ok("both locales define it", Boolean(AR.page_load_more) && Boolean(FR.page_load_more));
  ok("fr label is French -> " + FR.page_load_more, !/[؀-ۿ]/.test(FR.page_load_more));
  ok("ar label is Arabic -> " + AR.page_load_more, /[؀-ۿ]/.test(AR.page_load_more));
  ok("existing product-page labels are untouched",
    FR.page_found_products === "{count} produit(s) trouvé(s)" &&
    Boolean(AR.page_found_products) && Boolean(FR.page_retry) && Boolean(AR.page_search_placeholder));
  ok("loadMore still refuses to stack requests",
    /if \(!s\.hasMore \|\| s\.status === "loading" \|\| s\.status === "error"\) return;/.test(HOOK_CODE));
}

console.log("10) PERFORMANCE + API CONTRACT UNCHANGED:");
{
  ok("search is still SERVER-side (one query per page)",
    /q\s+= searchParams\.get\("q"\) \|\| null/.test(ROUTE) && /getProductsPage\(\{ cursor, limit, collection, q \}\)/.test(ROUTE));
  ok("the client never filters or slices the feed items locally",
    !/items\.filter\(|items\.slice\(|filterByQuery|matchesQuery/.test(CLIENT_CODE));
  ok("typing is still debounced, not one request per keystroke",
    /SEARCH_DEBOUNCE_MS = 300/.test(HOOK) && /setTimeout\(\(\) => setActiveQuery\(query\.trim\(\)\), SEARCH_DEBOUNCE_MS\)/.test(HOOK_CODE));
  ok("an outdated in-flight page is aborted", /abortRef\.current\?\.abort\(\)/.test(HOOK_CODE));
  ok("a stale response is discarded by signature",
    /if \(sigRef\.current !== sig\) return;/.test(HOOK_CODE));
  ok("COUNT still runs only for the first page of a filter set",
    /key\s*\n?\s*\? Promise\.resolve\(null\)/.test(SERVICE_CODE));
  ok("one page = one row query, no N+1", (SERVICE_CODE.match(/\$queryRawUnsafe\(/g) || []).length === 2);
  ok("the response contract is unchanged",
    /\{ items: \[\.\.\.\], nextCursor: string\|null, hasMore: boolean, total: number\|null \}/.test(ROUTE));
  ok("the endpoint's params are unchanged (no new query arg)",
    /searchParams\.get\("cursor"\)/.test(ROUTE) && /searchParams\.get\("collection"\)/.test(ROUTE) &&
    /searchParams\.get\("limit"\)/.test(ROUTE));
  ok("search responses are still uncached, browsing still cached",
    /const cacheHeader = q\s*\n?\s*\? "no-store"/.test(ROUTE));
  ok("no product schema change was needed",
    !/prisma\/migrations\/.*search/i.test(SERVICE) &&
    !/tsvector|to_tsquery|pg_trgm|unaccent/i.test(SERVICE_CODE));
}

console.log("11) ZERO-RESULT + EMPTY STATES STILL WORK:");
{
  ok("a genuinely absent term yields nothing", filterByQuery(CATALOGUE, "nokia").length === 0);
  ok("the search empty state is still rendered",
    /\{showEmpty && isSearching &&/.test(CLIENT_CODE) && /page_no_products_search/.test(CLIENT_CODE));
  ok("the collection empty state is still rendered",
    /\{showEmpty && !isSearching &&/.test(CLIENT_CODE) && /page_no_products_collection/.test(CLIENT_CODE));
  ok("the found-count line still reads from total",
    /const foundCount\s+= total \?\? items\.length/.test(CLIENT_CODE) &&
    /page_found_products/.test(CLIENT_CODE));
  ok("an error keeps loaded items on screen and offers retry",
    /\{error && \(/.test(CLIENT_CODE) && /onClick=\{retry\}/.test(CLIENT_CODE));
  ok("a failed load does not blank the list",
    /return \{ \.\.\.state, status: "error", error: action\.error \|\| "load failed" \};/.test(readFileSync("src/lib/productFeed.js", "utf8")));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
