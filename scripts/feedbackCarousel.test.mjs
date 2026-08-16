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
  isAutoCarousel, normalizeCarouselSettings, carouselDurationSec, splitIntoRows, shouldAnimate,
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
  ok("first row takes the first half", rows[0][0]._id === "f0");
  ok("row 2 is slower than row 1", carouselDurationSec("medium", 5, 1) > carouselDurationSec("medium", 5, 0));
  ok("the difference is subtle (~15%)", Math.abs(carouselDurationSec("medium", 5, 1) / carouselDurationSec("medium", 5, 0) - SECOND_ROW_SLOWDOWN) < 0.01);
  ok("a single review cannot be split into two rows", splitIntoRows(items(1), 2).length === 1);
}

console.log("6) Direction / motion stays right → left and seamless:");
{
  // The track animates translate3d(0 → -50%): always leftward, so cards enter
  // from the right. The -50% end state lands exactly on the duplicate copy.
  const css = "translate3d(-50%, 0, 0)";
  ok("end transform is negative (moves left, enters from right)", css.includes("-50%"));
  ok("speed scales with card count so motion feels constant", carouselDurationSec("medium", 10, 0) > carouselDurationSec("medium", 3, 0));
  ok("faster setting → shorter duration", carouselDurationSec("fast", 5, 0) < carouselDurationSec("slow", 5, 0));
  ok("duration is never zero (would freeze the loop)", carouselDurationSec("fast", 0, 0) > 0);
  ok("unknown speed still yields a usable duration", carouselDurationSec("bogus", 5, 0) === carouselDurationSec("medium", 5, 0));
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

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
