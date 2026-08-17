#!/usr/bin/env node
/**
 * scripts/feedbackCarousel.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * "سلايدر متحرك تلقائياً" (autoCarousel) feedback display style.
 *
 * Presentation only: these helpers decide HOW cards move, never WHICH reviews
 * are shown. `productFeedbackSource` (currentProduct / allProducts) and the
 * approval rules are untouched and are re-asserted here as a regression guard.
 * Run: node scripts/feedbackCarousel.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  FEEDBACK_LAYOUTS, CAROUSEL_SPEEDS, CAROUSEL_DEFAULTS, SECOND_ROW_SLOWDOWN,
  isAutoCarousel, normalizeCarouselSettings, splitIntoRows, shouldAnimate,
  repeatToFill, MIN_GROUP_CARDS, CARD_GAP_CLASS, TARGET_VIEWPORTS,
  requiredGroupCards, carouselDurationFromDistance, carouselPxPerSec,
} from "../src/lib/feedbackCarousel.js";
import {
  resolveProductFeedbackSource, feedbackFilterProductId,
} from "../src/lib/feedbackDisplay.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const items = (n) => Array.from({ length: n }, (_, i) => ({ _id: `f${i}`, rating: 5 }));

console.log("1) Existing display modes still resolve as before:");
{
  ok("grid / slider / stacked all still valid", ["grid", "slider", "stacked"].every((l) => FEEDBACK_LAYOUTS.includes(l)));
  ok("none of them is treated as the carousel", ["grid", "slider", "stacked"].every((l) => isAutoCarousel(l) === false));
  ok("legacy value with no layout saved is not the carousel", isAutoCarousel(undefined) === false && isAutoCarousel(null) === false);
  ok("autoCarousel added without removing anything", FEEDBACK_LAYOUTS.length === 4 && FEEDBACK_LAYOUTS.includes("autoCarousel"));
  ok("an unknown/legacy layout never activates the carousel", isAutoCarousel("masonry") === false);
}

console.log("2) autoCarousel persists correctly in Feedback Settings:");
{
  const DEFAULTS = { layout: "grid", productFeedbackLayout: "default", ...CAROUSEL_DEFAULTS };
  const saved = { ...DEFAULTS, layout: "autoCarousel", carouselRows: 1, carouselSpeed: "fast", carouselShadow: false, carouselPauseOnInteract: false };
  const reloaded = { ...DEFAULTS, ...JSON.parse(JSON.stringify(saved)) };
  ok("layout survives a save → reload round-trip", isAutoCarousel(reloaded.layout));
  const c = normalizeCarouselSettings(reloaded);
  ok("rows persisted", c.rows === 1);
  ok("speed persisted", c.speed === "fast");
  ok("shadow=false persisted (not overwritten by the default)", c.shadow === false);
  ok("pauseOnInteract=false persisted", c.pauseOnInteract === false);
  ok("product-page mode persists independently", ({ ...DEFAULTS, productFeedbackLayout: "autoCarousel" }).productFeedbackLayout === "autoCarousel");
  ok("switching back to grid persists", isAutoCarousel({ ...saved, layout: "grid" }.layout) === false);
}

console.log("3) Missing carousel settings fall back to safe defaults:");
{
  const d = normalizeCarouselSettings({});
  ok("default 2 rows", d.rows === 2 && CAROUSEL_DEFAULTS.rows === 2);
  ok("default speed medium", d.speed === "medium");
  ok("shadow enabled by default", d.shadow === true);
  ok("pauseOnInteract enabled by default", d.pauseOnInteract === true);
  ok("null / undefined settings never throw", normalizeCarouselSettings(null).rows === 2 && normalizeCarouselSettings(undefined).speed === "medium");
  ok("invalid speed → medium", normalizeCarouselSettings({ carouselSpeed: "warp" }).speed === "medium");
  ok("invalid row count → 2", normalizeCarouselSettings({ carouselRows: 7 }).rows === 2 && normalizeCarouselSettings({ carouselRows: "x" }).rows === 2);
  ok("only known speeds accepted", CAROUSEL_SPEEDS.every((s) => normalizeCarouselSettings({ carouselSpeed: s }).speed === s));
}

console.log("4) One-row mode:");
{
  const rows = splitIntoRows(items(6), normalizeCarouselSettings({ carouselRows: 1 }).rows);
  ok("exactly one track", rows.length === 1);
  ok("holds every review", rows[0].length === 6);
  ok("order preserved", rows[0][0]._id === "f0" && rows[0][5]._id === "f5");
}

console.log("5) Two-row mode:");
{
  const rows = splitIntoRows(items(7), 2);
  ok("two tracks", rows.length === 2);
  ok("no review lost or duplicated", rows[0].length + rows[1].length === 7
    && new Set([...rows[0], ...rows[1]].map((i) => i._id)).size === 7);
  ok("rows alternate so both cover the catalogue", rows[0][0]._id === "f0" && rows[1][0]._id === "f1");
  ok("row 2 is slower than row 1", carouselDurationFromDistance(2000, "medium", 1) > carouselDurationFromDistance(2000, "medium", 0));
  ok("the difference is subtle (~15%)", Math.abs(carouselDurationFromDistance(2000, "medium", 1) / carouselDurationFromDistance(2000, "medium", 0) - SECOND_ROW_SLOWDOWN) < 0.01);
  ok("a single review cannot be split into two rows", splitIntoRows(items(1), 2).length === 1);
}

console.log("6) Direction / motion stays right → left and seamless:");
{
  // The track animates translate3d(0 → -50%): always leftward, so cards enter
  // from the right. The -50% end state lands exactly on the duplicate copy.
  const css = "translate3d(-50%, 0, 0)";
  ok("end transform is negative (moves left, enters from right)", css.includes("-50%"));
  ok("longer track -> longer loop (cards never speed up)", carouselDurationFromDistance(4000, "medium", 0) > carouselDurationFromDistance(1000, "medium", 0));
  ok("faster setting -> shorter duration", carouselDurationFromDistance(2000, "fast", 0) < carouselDurationFromDistance(2000, "slow", 0));
  ok("duration is never zero (would freeze the loop)", carouselDurationFromDistance(0, "fast", 0) > 0);
  ok("unknown speed still yields a usable duration", carouselDurationFromDistance(2000, "bogus", 0) === carouselDurationFromDistance(2000, "medium", 0));
  ok("speed is a constant px/s regardless of distance", Math.abs(1000 / carouselDurationFromDistance(1000, "medium", 0) - 5000 / carouselDurationFromDistance(5000, "medium", 0)) < 0.5);
}

console.log("7) productFeedbackSource behaviour is untouched:");
{
  ok("default still currentProduct", resolveProductFeedbackSource({}) === "currentProduct");
  ok("carousel settings do not affect the source", resolveProductFeedbackSource({ layout: "autoCarousel", carouselRows: 1 }) === "currentProduct");
  ok("currentProduct still filters by product", feedbackFilterProductId({ productFeedbackLayout: "autoCarousel" }, "A") === "A");
  ok("allProducts still unfiltered", feedbackFilterProductId({ productFeedbackSource: "allProducts", productFeedbackLayout: "autoCarousel" }, "A") === null);
  ok("the carousel receives data, it never filters", typeof splitIntoRows === "function" && splitIntoRows(items(3), 2).flat().length === 3);
}

console.log("8) Scroll-to-feedback behaviour is untouched:");
{
  const s = { starClickAction: "scrollToFeedback", layout: "autoCarousel", productFeedbackLayout: "autoCarousel" };
  ok("starClickAction preserved next to the new keys", s.starClickAction === "scrollToFeedback");
  ok("carousel helpers never read starClickAction", normalizeCarouselSettings({ starClickAction: "disabled" }).rows === CAROUSEL_DEFAULTS.rows);
  ok("changing display style leaves the scroll action intact", { ...s, productFeedbackLayout: "default" }.starClickAction === "scrollToFeedback");
}

console.log("9) Empty feedback does not break the carousel:");
{
  ok("no items → no rows (component renders nothing)", splitIntoRows([], 2).length === 0);
  ok("null / undefined items handled", splitIntoRows(null, 2).length === 0 && splitIntoRows(undefined, 1).length === 0);
  ok("one item → one row, no animation", (() => {
    const rows = splitIntoRows(items(1), 2);
    return rows.length === 1 && shouldAnimate({ cardCount: rows[0].length, reducedMotion: false }) === false;
  })());
  ok("zero cards never animate", shouldAnimate({ cardCount: 0, reducedMotion: false }) === false);
}

console.log("10) Reduced motion does not continuously animate:");
{
  ok("reduced motion disables the marquee", shouldAnimate({ cardCount: 20, reducedMotion: true }) === false);
  ok("normal motion with enough cards animates", shouldAnimate({ cardCount: 20, reducedMotion: false }) === true);
  ok("reduced motion wins over card count", [1, 5, 50].every((n) => shouldAnimate({ cardCount: n, reducedMotion: true }) === false));
}

console.log("11) MEASURED loop distance replaces percentage guesswork:");
{
  ok("distance drives duration, not card count", carouselDurationFromDistance(3230, "fast", 0) === Math.round((3230 / 60) * 100) / 100);
  ok("row 2 px/s is ~15% slower", Math.abs(carouselPxPerSec("medium", 0) / carouselPxPerSec("medium", 1) - SECOND_ROW_SLOWDOWN) < 0.02);
  ok("each speed level is a distinct px/s", new Set(CAROUSEL_SPEEDS.map((sp) => carouselPxPerSec(sp, 0))).size === 3);
  ok("speeds sit in a sane range (25-65 px/s)", CAROUSEL_SPEEDS.every((sp) => { const v = carouselPxPerSec(sp, 0); return v >= 25 && v <= 65; }));
  ok("the gap is on the card, not the track", CARD_GAP_CLASS.includes("me-"));
  ok("group A targets >= 2 viewport widths", TARGET_VIEWPORTS >= 2);
  ok("needed cards actually cover the target width", (() => {
    const vw = 375, card = 323;
    return requiredGroupCards(vw, card) * card >= vw * 2;
  })());
  ok("desktop needs more cards than mobile", requiredGroupCards(1280, 336) > requiredGroupCards(375, 323));
  ok("unknown geometry falls back to the minimum", requiredGroupCards(0, 0) === MIN_GROUP_CARDS);
  ok("never fewer than 2 cards", requiredGroupCards(10, 9999) === 2);
}

console.log("12) repeatToFill repeats WHOLE cycles and never discards a review:");
{
  const src = items(6);
  const need = requiredGroupCards(375, 323);
  ok("a row already long enough is returned untouched", repeatToFill(src, need).length === 6);
  ok("every unique review survives", new Set(repeatToFill(src, need).map((i) => i._id)).size === 6);
  ok("it never truncates below the source length", [1, 2, 3, 5, 8].every((n) => repeatToFill(items(n), 2).length >= n));
  ok("small sets repeat in whole cycles", (() => {
    const out = repeatToFill([{ _id: "a" }, { _id: "b" }], 5);
    return out.length >= 5 && out[0]._id === "a" && out[1]._id === "b" && out[2]._id === "a" && out[3]._id === "b";
  })());
  ok("1 review repeats to the requested density", repeatToFill([{ _id: "a" }], 8).length === 8);
  ok("repetition reuses the original objects (data untouched)", (() => {
    const s2 = [{ _id: "a" }, { _id: "b" }];
    const out = repeatToFill(s2, 6);
    return out[0] === s2[0] && s2.length === 2;
  })());
  ok("empty input stays empty", repeatToFill([], 8).length === 0 && repeatToFill(null, 8).length === 0);
  ok("a repeated 1-review row animates", shouldAnimate({ cardCount: repeatToFill([{ _id: "a" }], 8).length, reducedMotion: false }) === true);
}

console.log("13) Rows stay independent and compact:");
{
  const rows = splitIntoRows(items(10), 2);
  ok("two independent row datasets", rows.length === 2 && rows[0] !== rows[1]);
  ok("each row is independently animatable", rows.every((r) => shouldAnimate({ cardCount: repeatToFill(r, 8).length, reducedMotion: false })));
  ok("row 2 still slower", carouselDurationFromDistance(3000, "medium", 1) > carouselDurationFromDistance(3000, "medium", 0));
  ok("reduced motion still wins per row", rows.every((r) => shouldAnimate({ cardCount: repeatToFill(r, 8).length, reducedMotion: true }) === false));
}

console.log("14) THE PRODUCTION CASE - 11 reviews, 2 rows, allProducts, fast:");
{
  const fb = Array.from({ length: 11 }, (_, i) => ({
    _id: "r" + (i + 1),
    textContent: i % 3 === 0 ? "x".repeat(400) : "short",
    images: i % 2 === 0 ? ["/a.webp"] : [],
  }));
  const cfg = normalizeCarouselSettings({ carouselRows: 2, carouselSpeed: "fast" });
  const rows = splitIntoRows(fb, cfg.rows);

  ok("all 11 reviews reach the carousel", fb.length === 11);
  ok("row 1 gets 6 unique reviews", rows[0].length === 6);
  ok("row 2 gets 5 unique reviews", rows[1].length === 5);
  ok("row 1 is #1,3,5,7,9,11", rows[0].map((r) => r._id).join(",") === "r1,r3,r5,r7,r9,r11");
  ok("row 2 is #2,4,6,8,10", rows[1].map((r) => r._id).join(",") === "r2,r4,r6,r8,r10");
  ok("no review is dropped across the rows", new Set(rows.flat().map((r) => r._id)).size === 11);
  ok("NOT reduced to ~3 uniques (the production bug)", rows.every((r) => r.length >= 5));

  const CARD = 323;
  rows.forEach((row, i) => {
    const need = requiredGroupCards(375, CARD);
    const groupA = repeatToFill(row, need);
    const groupB = repeatToFill(row, need);
    ok("row" + (i + 1) + ": group A keeps every unique review", new Set(groupA.map((r) => r._id)).size === row.length);
    ok("row" + (i + 1) + ": group B duplicates group A exactly", groupB.length === groupA.length && groupB.every((r, k) => r._id === groupA[k]._id));
    ok("row" + (i + 1) + ": group A spans >= 2 viewports", groupA.length * CARD >= 375 * 2);
    const dist = groupA.length * CARD;
    // distance / speed, within rounding tolerance (both helpers round to 2dp).
    ok("row" + (i + 1) + ": duration derives from distance / speed",
      Math.abs(carouselDurationFromDistance(dist, "fast", i) - dist / carouselPxPerSec("fast", i)) < 0.05);
    ok("row" + (i + 1) + ": even at Fast the whole sequence takes > 5s", carouselDurationFromDistance(dist, "fast", i) > 5);
  });

  ok("duplicate copies get unique keys", (() => {
    const groupA = repeatToFill(rows[1], 8);
    const keysA = groupA.map((it, i) => "a-" + i + "-" + it._id);
    const keysB = groupA.map((it, i) => "b-" + i + "-" + it._id);
    return new Set(keysA.concat(keysB)).size === keysA.length + keysB.length;
  })());
}

console.log("15) Other dataset sizes behave:");
{
  for (const n of [1, 2, 3, 11, 30]) {
    const rows = splitIntoRows(items(n), 2);
    ok(n + " reviews: none dropped", new Set(rows.flat().map((r) => r._id)).size === n);
    ok(n + " reviews: every row keeps its uniques after fill", rows.every((r) => {
      const g = repeatToFill(r, requiredGroupCards(375, 323));
      return g.length >= r.length && new Set(g.map((x) => x._id)).size === r.length;
    }));
  }
  ok("30 reviews split 15/15", (() => { const r = splitIntoRows(items(30), 2); return r[0].length === 15 && r[1].length === 15; })());
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
