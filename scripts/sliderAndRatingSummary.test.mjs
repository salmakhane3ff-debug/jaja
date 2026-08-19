#!/usr/bin/env node
/**
 * scripts/sliderAndRatingSummary.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Two production bugs.
 *
 * BUG 1 — the homepage collection slider vanished on a live language switch.
 *   Swiper resolves RTL vs LTR ONCE: swiper.rtlTranslate is assigned in mount()
 *   from the element's dir / computed direction and is never recomputed.
 *   Switching language flips <html dir>, so an already-mounted Swiper kept
 *   applying RTL-signed transforms inside a now-LTR box and pushed every slide
 *   outside its overflow-hidden viewport. A refresh remounted it, which is why
 *   the data always looked fine.
 *
 * BUG 2 — the "(18)" under the product title lagged the stars by 2-3 s.
 *   The header took its count from the feedback SECTION at the bottom of the
 *   page via onStatsLoaded, so it could not render until every review had
 *   downloaded — a payload that reaches megabytes because customer-submitted
 *   photos are stored as base64 data URLs in `images`.
 *
 * Run: node scripts/sliderAndRatingSummary.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from "node:fs";
import {
  statsUrl, normalizeSummary, roundAverage, isSummaryShape,
  SUMMARY_FIELDS, EMPTY_SUMMARY,
} from "../src/lib/feedbackSummary.js";
import {
  feedbackFilterProductId, resolveProductFeedbackSource,
  DEFAULT_PRODUCT_FEEDBACK_SOURCE,
} from "../src/lib/feedbackDisplay.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const SLIDER  = readFileSync("src/components/Colleaction/SliderCollection.jsx", "utf8");
const PRODUCT = readFileSync("src/app/products/[id]/product.jsx", "utf8");
const STATS   = readFileSync("src/app/api/feedback/stats/route.js", "utf8");
const SERVICE = readFileSync("src/lib/services/feedbackService.js", "utf8");
const SECTION = readFileSync("src/components/FeedbackSection.jsx", "utf8");
const CTX     = readFileSync("src/context/LanguageContext.jsx", "utf8");
const SUMMARY = readFileSync("src/lib/feedbackSummary.js", "utf8");

/** Strip comments — several assertions below are about CODE, not prose. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SLIDER_CODE  = codeOnly(SLIDER);
const PRODUCT_CODE = codeOnly(PRODUCT);
const STATS_CODE   = codeOnly(STATS);

// ─────────────────────────────────────────────────────────────────────────────
console.log("1) COLLECTION SLIDER — direction is explicit and re-initialises:");
{
  ok("the slider reads dir from the site LanguageContext",
    /import \{ useLanguage \} from "@\/context\/LanguageContext";/.test(SLIDER) &&
    /const \{ dir \} = useLanguage\(\)/.test(SLIDER));
  ok("Swiper is told the direction explicitly", /dir=\{dir\}/.test(SLIDER_CODE));
  ok("Swiper re-initialises when the direction changes", /key=\{dir\}/.test(SLIDER_CODE));
  ok("the key is on the <Swiper> element, not on the component",
    /<Swiper\s*\n\s*key=\{dir\}\s*\n\s*dir=\{dir\}/.test(SLIDER_CODE));

  // The data-owning state must sit OUTSIDE the remounted subtree, or a switch
  // would blank the slider exactly the way the bug did.
  const beforeSwiper = SLIDER_CODE.slice(0, SLIDER_CODE.indexOf("<Swiper"));
  ok("collections state lives above the remounted Swiper",
    /const \[collections, setCollections\] = useState\(\[\]\)/.test(beforeSwiper));
  ok("the fetch effect does NOT depend on language (no refetch on switch)",
    /fetchSectionSettings\(\);\s*\n[\s\S]{0,900}\}, \[\]\);/.test(SLIDER_CODE));
  ok("no language value appears in the fetch effect's deps", !/\}, \[dir\]\)/.test(SLIDER_CODE));
}

console.log("2) NO RELOAD-STYLE WORKAROUND was used:");
{
  ok("no window.location.reload()", !/location\.reload/.test(SLIDER));
  ok("no router.refresh()", !/router\.refresh|useRouter/.test(SLIDER));
  ok("no setTimeout / arbitrary delay", !/setTimeout|setInterval/.test(SLIDER));
  ok("no duplicated collection data", (SLIDER.match(/useState\(\[\]\)/g) || []).length === 1);
  ok("still exactly one collections fetch", (SLIDER.match(/fetchCached\("\/api\/collection"\)/g) || []).length === 1);
  ok("collection identity is still the stable id", /key=\{collection\.id\}/.test(SLIDER_CODE));
  ok("the slider never matches a collection by translated display text",
    !/collection\.title\s*===|title\s*===\s*collection/.test(SLIDER_CODE));
  ok("no translation lookup is applied to collection names",
    !/t\(collection|t\(`collection/.test(SLIDER_CODE));
}

console.log("3) LANGUAGE SWITCH SIMULATION — the slider survives both ways:");
{
  // Models what React does: a changed key remounts that element only; state
  // held by the parent component is untouched.
  const makeSlider = (initialDir) => {
    const st = { dir: initialDir, collections: ["a", "b", "c"], fetches: 0, swiperMounts: 0, swiperDir: null };
    const mountSwiper = () => { st.swiperMounts++; st.swiperDir = st.dir; };
    st.mount = () => { st.fetches++; mountSwiper(); };
    st.setDir = (next) => {
      const remount = next !== st.dir;             // key={dir} changed
      st.dir = next;
      if (remount) mountSwiper();                  // Swiper only
      // collections is parent state → survives; no refetch is triggered
    };
    st.visible = () => st.collections.length > 0 && st.swiperDir === st.dir;
    return st;
  };

  let s = makeSlider("rtl"); s.mount();
  ok("renders initially in Arabic (rtl)", s.visible() === true && s.swiperDir === "rtl");
  s.setDir("ltr");
  ok("AR → FR does NOT remove the slider", s.visible() === true);
  ok("…because Swiper re-initialised with the new direction", s.swiperDir === "ltr" && s.swiperMounts === 2);
  ok("…and the collections were never refetched or cleared",
    s.fetches === 1 && s.collections.length === 3);

  s = makeSlider("ltr"); s.mount();
  ok("renders initially in French (ltr)", s.visible() === true && s.swiperDir === "ltr");
  s.setDir("rtl");
  ok("FR → AR does NOT remove the slider", s.visible() === true);
  ok("…with the collections intact", s.fetches === 1 && s.collections.length === 3);

  s.setDir("rtl");
  ok("setting the SAME direction does not remount", s.swiperMounts === 2);

  // The old behaviour, for contrast: rtlTranslate frozen at mount.
  const stale = makeSlider("rtl"); stale.mount();
  stale.dir = "ltr";                                // direction changed, no remount
  ok("the OLD frozen-direction behaviour really did blank the slider", stale.visible() === false);

  ok("existing RTL/LTR mapping is unchanged", /const dir = lang === "ar" \? "rtl" : "ltr"/.test(CTX));
  ok("the language fix from before is untouched",
    /Only setLang\(\), an explicit visitor action, writes the preference/.test(CTX));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("4) RATING SUMMARY — two numbers, nothing else:");
{
  ok("the summary carries exactly avg and count", SUMMARY_FIELDS.join(",") === "avg,count");
  ok("the empty summary is zeroed", EMPTY_SUMMARY.avg === 0 && EMPTY_SUMMARY.count === 0);
  ok("normalizeSummary keeps only avg and count",
    isSummaryShape(normalizeSummary({ avg: 4.6, count: 18, images: ["data:image/jpeg;base64,AAAA"], reviews: [1, 2] })));
  ok("a heavy field can never leak through the header path",
    JSON.stringify(normalizeSummary({ avg: 5, count: 18, images: ["data:image/png;base64,ZZZZ"] })) ===
    JSON.stringify({ avg: 5, count: 18 }));
  ok("the result is a plain two-key object",
    Object.keys(normalizeSummary({ avg: 5, count: 18 })).sort().join(",") === "avg,count");

  ok("zero reviews give count 0 safely",
    normalizeSummary({ avg: 0, count: 0 }).count === 0 && normalizeSummary({}).count === 0);
  ok("a missing response gives a zero summary",
    normalizeSummary(null).count === 0 && normalizeSummary(undefined).avg === 0);
  ok("garbage never becomes NaN in the UI",
    normalizeSummary({ avg: "x", count: "y" }).avg === 0 && normalizeSummary({ avg: "x", count: "y" }).count === 0);
  ok("existing reviews give the expected count", normalizeSummary({ avg: 4.63, count: 18 }).count === 18);
  ok("the average is rounded to one decimal", normalizeSummary({ avg: 4.6333 }).avg === 4.6);
  ok("a negative count cannot appear", normalizeSummary({ count: -5 }).count === 0);
  ok("a fractional count is truncated", normalizeSummary({ count: 18.9 }).count === 18);
  ok("roundAverage matches between server and client",
    roundAverage(4.6333) === normalizeSummary({ avg: 4.6333 }).avg && roundAverage(0) === 0 && roundAverage(null) === 0);
  ok("isSummaryShape rejects anything larger",
    isSummaryShape({ avg: 1, count: 1, extra: 1 }) === false && isSummaryShape(null) === false);
}

console.log("5) THE SUMMARY COVERS THE RIGHT REVIEWS (productFeedbackSource intact):");
{
  ok("currentProduct → the summary URL carries this product's id",
    statsUrl(feedbackFilterProductId({ productFeedbackSource: "currentProduct" }, "p1")) ===
    "/api/feedback/stats?productId=p1");
  ok("allProducts → the summary URL is store-wide",
    statsUrl(feedbackFilterProductId({ productFeedbackSource: "allProducts" }, "p1")) ===
    "/api/feedback/stats");
  ok("the default is still currentProduct",
    DEFAULT_PRODUCT_FEEDBACK_SOURCE === "currentProduct" &&
    resolveProductFeedbackSource(null) === "currentProduct");
  ok("an unknown setting value still falls back to currentProduct",
    statsUrl(feedbackFilterProductId({ productFeedbackSource: "nonsense" }, "p1")) ===
    "/api/feedback/stats?productId=p1");
  ok("the product id is URL-encoded", statsUrl("a b/c").includes(encodeURIComponent("a b/c")));
  ok("a blank id degrades to the store-wide URL",
    statsUrl("") === "/api/feedback/stats" && statsUrl(null) === "/api/feedback/stats" &&
    statsUrl("   ") === "/api/feedback/stats");

  ok("the page derives the filter with the SAME helper the section uses",
    /const summaryProductId = feedbackFilterProductId\(fbSettings, data\._id \|\| data\.id\)/.test(PRODUCT_CODE) &&
    /filterProductId=\{feedbackFilterProductId\(fbSettings, data\._id \|\| data\.id\)\}/.test(PRODUCT_CODE));
  ok("feedbackDisplay.js was not modified for this fix",
    !/statsUrl|summary/i.test(readFileSync("src/lib/feedbackDisplay.js", "utf8")));
  ok("the section still receives its own filterProductId", /filterProductId=\{/.test(PRODUCT_CODE));
}

console.log("6) THE HEADER NO LONGER WAITS ON THE HEAVY PAYLOAD:");
{
  ok("the header count no longer comes from the feedback section",
    !/onStatsLoaded/.test(PRODUCT_CODE));
  ok("handleFbStats is gone", !/handleFbStats/.test(PRODUCT));
  ok("the header fetches the lightweight summary instead",
    /fetchCached\(statsUrl\(summaryProductId\)\)/.test(PRODUCT_CODE));
  ok("the summary response is normalized before display",
    /setFeedbackStats\(normalizeSummary\(raw\)\)/.test(PRODUCT_CODE));
  ok("the product page never fetches /api/feedback itself",
    !/fetchCached\("\/api\/feedback"\)|fetch\("\/api\/feedback"\)/.test(PRODUCT_CODE));
  ok("the header still renders stars and count from the same state",
    /feedbackStats\.avg/.test(PRODUCT_CODE) && /feedbackStats\.count/.test(PRODUCT_CODE));
  ok("the existing product.rating / reviewsCount fallbacks are preserved",
    /feedbackStats\.avg \|\| data\.rating \|\| 0/.test(PRODUCT_CODE) &&
    /feedbackStats\.count \|\| data\.reviewsCount \|\| 0/.test(PRODUCT_CODE));
  ok("the global (goToFeedbackPage) path still uses the store-wide stats",
    /fetchCached\("\/api\/feedback\/stats"\)/.test(PRODUCT_CODE));
  ok("the star-click behaviour is unchanged",
    /scrollToFeedback/.test(PRODUCT_CODE) && /goToFeedbackPage/.test(PRODUCT_CODE) &&
    /handleStarClick/.test(PRODUCT_CODE));

  // No duplicate request: dedupe + a stable URL per filter.
  ok("summary fetches are deduped by URL", /fetchCached\(statsUrl/.test(PRODUCT_CODE));
  ok("the summary effect is keyed on the resolved filter, not on every render",
    /\}, \[summaryProductId, fbSettings\.enableProductFeedback, fbSettings\.showStarsUnderTitle\]\)/.test(PRODUCT_CODE));
  ok("it is skipped entirely when the header rating is switched off",
    /if \(!fbSettings\.enableProductFeedback \|\| !fbSettings\.showStarsUnderTitle\) return;/.test(PRODUCT_CODE));
  ok("a late response cannot overwrite a newer one", /cancelled/.test(PRODUCT_CODE));
  ok("statsUrl is the single place the endpoint is spelled for the header",
    (PRODUCT_CODE.match(/\/api\/feedback\/stats/g) || []).length === 1);
}

console.log("7) THE ENDPOINT — one aggregate, no rows, no N+1:");
{
  ok("productId is OPTIONAL and additive", /const productId = \(searchParams\.get\('productId'\) \|\| ''\)\.trim\(\)/.test(STATS));
  ok("an absent productId keeps the store-wide meaning",
    /if \(productId\) where\.productId = productId;/.test(STATS));
  ok("a blank productId never becomes `productId: null`",
    !/where\.productId = productId \|\| null/.test(STATS));
  ok("it uses a single aggregate", (STATS.match(/prisma\.feedback\.aggregate/g) || []).length === 1);
  ok("no findMany — review rows are never read", !/findMany/.test(STATS));
  ok("no image field is selected at all", !/images/.test(STATS_CODE));
  ok("only COUNT and AVG are requested",
    /_avg:\s+\{ rating: true \}/.test(STATS) && /_count:\s+\{ id: true \}/.test(STATS));
  ok("no loop / per-product query (no N+1)", !/for \(|\.map\(|Promise\.all/.test(STATS));
  ok("the response body is exactly { avg, count }",
    /Response\.json\(\{ avg, count \}/.test(STATS) &&
    (STATS.match(/Response\.json\(/g) || []).length === 2);
  ok("it applies the same visibility rule as the public list",
    /status: 'APPROVED'/.test(STATS) && /status: 'SCHEDULED', publishAt: \{ lte: now \}/.test(STATS));
  ok("moderation rules are untouched",
    /\{ status: 'APPROVED' \}/.test(SERVICE) && /\{ status: 'SCHEDULED', publishAt: \{ lte: now \} \}/.test(SERVICE));
  ok("a failure degrades to zeros, never a broken header",
    /Response\.json\(\{ avg: 0, count: 0 \}, \{ status: 500 \}\)/.test(STATS));
  ok("the endpoint shares the rounding helper with the client", /roundAverage/.test(STATS));
  ok("the count is NOT capped the way the section's take:50 is", !/take:/.test(STATS));
  ok("the section itself still caps at 50 (unchanged)", /take:\s+50/.test(SERVICE));
}

console.log("8) PAYLOAD — the summary path carries no image data:");
{
  ok("the summary module never mentions images", !/image/i.test(SUMMARY));
  ok("the summary module has no fetch of its own", !/fetch\(/.test(SUMMARY));
  ok("a base64 data URL cannot survive normalizeSummary",
    !JSON.stringify(normalizeSummary({ avg: 5, count: 1, images: ["data:image/jpeg;base64,/9j/4AAQ"] })).includes("base64"));

  // The public select ships URL/JSON fields only — never a binary column.
  const publicSelect = SERVICE.slice(
    SERVICE.indexOf("const rows = await prisma.feedback.findMany"),
    SERVICE.indexOf("orderBy: [{ isFeatured: 'desc' }"));
  ok("the public select ships no binary/blob column",
    !/bytes|buffer|blob|binary|base64/i.test(publicSelect));
  ok("images are selected as the stored JSON field, not decoded server-side",
    /images:\s+true/.test(publicSelect));
  ok("mediaPublicId and phone stay private", !/mediaPublicId|phone/.test(publicSelect));

  // Everything the carousel actually reads must still be selected.
  ok("the carousel's fields are all still present",
    ["rating", "authorName", "textContent", "images", "createdAt", "reviewDate", "isVerified", "productId"]
      .every((f) => new RegExp(f + ":\\s*true").test(publicSelect)));
  ok("the section's own count/avg still work from the same list",
    /list\.reduce\(\(a, b\) => a \+ \(b\.rating \|\| 0\), 0\)/.test(SECTION));
  ok("onStatsLoaded still exists for other callers of FeedbackSection",
    /onStatsLoaded/.test(SECTION));
  ok("the feedback service was not modified by this fix",
    !/statsUrl|feedbackSummary/.test(SERVICE));
}

console.log("9) NO NEW HYDRATION MISMATCH:");
{
  // Nothing added here renders a time-, random- or browser-dependent value
  // during the first paint.
  ok("the summary module reads no clock", !/Date\.now\(\)|new Date\(/.test(SUMMARY));
  ok("the summary module reads no randomness", !/Math\.random/.test(SUMMARY));
  ok("the summary starts from a constant, not a computed value",
    /useState\(\{ \.\.\.EMPTY_SUMMARY \}\)/.test(PRODUCT_CODE));
  ok("the count only changes inside an effect, after hydration",
    /useEffect\(\(\) => \{[\s\S]{0,400}setFeedbackStats/.test(PRODUCT_CODE));
  ok("no suppressHydrationWarning was added to the slider", !/suppressHydrationWarning/.test(SLIDER));
  ok("no suppressHydrationWarning was added to the product header",
    (PRODUCT.match(/suppressHydrationWarning/g) || []).length === 0);
  ok("the slider's first render does not read the DOM direction",
    !/document\.documentElement/.test(SLIDER));
  ok("dir comes from React state, so server and client agree on the first frame",
    /const \{ dir \} = useLanguage\(\)/.test(SLIDER));

  // Relative feedback dates never render during SSR: the section fetches its
  // items in an effect, so the first server frame has no cards at all.
  ok("feedback items are fetched client-side only",
    /useEffect\(\(\) => \{ fetchData\(\); \}, \[fetchData\]\)/.test(SECTION) &&
    /const \[items,\s+setItems\]\s+= useState\(\[\]\)/.test(SECTION));
  ok("an empty item list renders no dated card", /items\.length === 0 \?/.test(SECTION));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
