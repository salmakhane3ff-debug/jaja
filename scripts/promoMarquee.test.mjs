#!/usr/bin/env node
/**
 * scripts/promoMarquee.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * The storefront promotional-text bar in Slider.jsx.
 *
 * THE BUG: the bar rendered
 *     promoTexts[0].text || `${emoji} ${title || content} ${emoji}`
 * so whenever the denormalised `text` was absent it published `title` — the
 * admin's INTERNAL reference — instead of `content`, the actual message. It
 * also showed only the FIRST active record, and repeated it across an
 * Array(500) of identical DOM nodes translated by a hardcoded -100%.
 *
 * Two kinds of assertion, because there is no jsdom here: pure-helper behaviour,
 * plus SOURCE invariants for the DOM/CSS geometry (an RTL overflow container
 * once broke the feedback carousel the same way) and a numeric simulation
 * proving the viewport is never blank at any point of the cycle.
 *
 * Run: node scripts/promoMarquee.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from "node:fs";
import {
  promoMessage, promoDisplayText, isActivePromo, activePromoMessages,
  repeatMessages, requiredPromoCopies, promoDuration,
  ACTIVE_STATUS, DEFAULT_EMOJI, PROMO_SPEED, TARGET_VIEWPORTS,
} from "../src/lib/promoMarquee.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const SRC = readFileSync("src/components/Slider/Slider.jsx", "utf8");
const ADMIN = readFileSync("src/app/admin/promo-text/page.jsx", "utf8");
/** Strip comments — the geometry assertions are about CODE, not prose. */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CODE = codeOnly(SRC);
const BAR  = CODE.slice(CODE.indexOf("function PromoMarquee"), CODE.indexOf("export default function StyleOne"));

const rec = (o) => ({ _id: o.id || "r1", status: ACTIVE_STATUS, priority: 1, ...o });

// ─────────────────────────────────────────────────────────────────────────────
console.log("1) FIELD SEMANTICS — content is the public message, never title:");
{
  const r = rec({ title: "INTERNAL summer ref", content: "Livraison gratuite", emoji: "🚀" });
  ok("the message comes from content", promoMessage(r).message === "Livraison gratuite");
  ok("the internal title is NEVER published", !promoDisplayText(r).includes("INTERNAL"));
  ok("the configured emoji decorates both sides",
    promoDisplayText(r) === "🚀 Livraison gratuite 🚀");
  ok("a missing emoji falls back to the default",
    promoDisplayText(rec({ content: "Soldes" })) === `${DEFAULT_EMOJI} Soldes ${DEFAULT_EMOJI}`);

  // The exact shape that used to leak the title.
  const noText = rec({ title: "internal ref only", content: "Vraie promo" });
  ok("with no `text` field the record still shows content, not title",
    promoDisplayText(noText) === `${DEFAULT_EMOJI} Vraie promo ${DEFAULT_EMOJI}`);
  ok("content still wins even when `text` exists",
    promoMessage(rec({ content: "Réel", text: "⚡ stale copy ⚡" })).message === "Réel");
  ok("content still wins even when title exists too",
    promoMessage(rec({ title: "ref", content: "Réel", text: "⚡ old ⚡" })).message === "Réel");

  ok("a title-only record publishes NOTHING", promoMessage(rec({ title: "ref only" })) === null);
  ok("…and is therefore dropped from the bar",
    activePromoMessages([rec({ title: "ref only" })]).length === 0);
  ok("blank content is not treated as content",
    promoMessage(rec({ title: "ref", content: "   " })) === null);

  ok("legacy `text` is the ONLY fallback", promoMessage(rec({ text: "🔥 Old row 🔥" })).message === "🔥 Old row 🔥");
  ok("legacy `text` is rendered verbatim (it already carries its emoji)",
    promoDisplayText(rec({ text: "🔥 Old row 🔥", emoji: "🔥" })) === "🔥 Old row 🔥");
  ok("…so the emoji is never doubled on legacy rows",
    (promoDisplayText(rec({ text: "🔥 Old row 🔥", emoji: "🔥" })).match(/🔥/g) || []).length === 2);
  ok("promoMessage is null-safe",
    promoMessage(null) === null && promoMessage(undefined) === null && promoMessage("x") === null);

  ok("the storefront never reads .title", !/\.title/.test(BAR));
  ok("the old title-preferring fallback chain is gone",
    !/\.text \|\|/.test(CODE) && !/promoTexts\[0\]/.test(CODE));
  ok("the admin form still labels title as internal-only (unchanged)",
    /placeholder="Enter title for internal reference"/.test(ADMIN) &&
    /placeholder="Enter promotional message"/.test(ADMIN));
}

console.log("2) ACTIVE FILTERING + PRIORITY ORDER:");
{
  const list = [
    rec({ id: "c", content: "Third",  priority: 3 }),
    rec({ id: "a", content: "First",  priority: 1 }),
    rec({ id: "x", content: "Hidden", priority: 0, status: "Inactive" }),
    rec({ id: "b", content: "Second", priority: 2 }),
  ];
  const out = activePromoMessages(list);
  ok("every Active record renders", out.length === 3);
  ok("inactive records do not render", !out.some((m) => m.text.includes("Hidden")));
  ok("order is priority ascending",
    out.map((m) => m.id).join(",") === "a,b,c");
  ok("the rendered strings carry the message, in order",
    out.map((m) => m.text).join(" | ").includes("First") &&
    out[2].text.includes("Third"));

  ok("only the exact status 'Active' publishes",
    isActivePromo({ status: "Active" }) === true &&
    isActivePromo({ status: "active" }) === false &&
    isActivePromo({ status: "Inactive" }) === false &&
    isActivePromo({}) === false);

  ok("a missing priority sorts as 0",
    activePromoMessages([rec({ id: "p", content: "P", priority: 5 }), rec({ id: "q", content: "Q" , priority: undefined })])
      .map((m) => m.id).join(",") === "q,p");
  ok("a non-numeric priority sorts as 0",
    activePromoMessages([rec({ id: "p", content: "P", priority: 2 }), rec({ id: "q", content: "Q", priority: "abc" })])
      .map((m) => m.id).join(",") === "q,p");
  ok("equal priorities keep their original order (stable)",
    activePromoMessages([
      rec({ id: "1", content: "one", priority: 1 }),
      rec({ id: "2", content: "two", priority: 1 }),
      rec({ id: "3", content: "three", priority: 1 }),
    ]).map((m) => m.id).join(",") === "1,2,3");

  ok("the input array is never sorted in place", (() => {
    const src = [rec({ id: "z", content: "Z", priority: 9 }), rec({ id: "a", content: "A", priority: 1 })];
    activePromoMessages(src);
    return src[0]._id === "z";
  })());
  ok("records are never mutated", (() => {
    const one = rec({ id: "m", content: "M", priority: 4 });
    const before = JSON.stringify(one);
    activePromoMessages([one]);
    return JSON.stringify(one) === before;
  })());
  ok("an empty / invalid list yields nothing",
    activePromoMessages([]).length === 0 && activePromoMessages(null).length === 0 &&
    activePromoMessages(undefined).length === 0);

  ok("the component maps over ALL messages, not index 0",
    /group\.map\(\(m\) =>/.test(BAR) && !/\[0\]/.test(BAR));
  ok("the component derives its list with activePromoMessages",
    /activePromoMessages\(items\)/.test(BAR));
  ok("the existing Active filter on fetch is unchanged",
    /promoData\.filter\(\(item\) => item\.status === "Active"\)/.test(CODE));
}

console.log("3) Array(500) IS GONE — exactly two groups:");
{
  ok("no Array(500) anywhere", !/Array\(500\)/.test(CODE) && !/Array\(\d{2,}\)/.test(CODE));
  ok("no .fill(null) node factory", !/\.fill\(null\)/.test(CODE));
  ok("the old -100% translate is gone", !/translateX\(-100%\)/.test(SRC));
  ok("the old .animate-marquee class is gone", !/animate-marquee/.test(SRC));
  ok("the old `marquee` keyframes are gone", !/@keyframes marquee\b/.test(SRC));

  ok("exactly two groups are rendered",
    /\{renderGroup\(false\)\}\s*\{renderGroup\(true\)\}/.test(BAR));
  ok("group B is an EXACT duplicate — one map, one factory, two calls",
    (BAR.match(/group\.map\(/g) || []).length === 1 &&
    /const renderGroup = \(duplicate\) => \(/.test(BAR) &&
    (BAR.match(/renderGroup\(/g) || []).length === 2);
  ok("the two calls differ ONLY by the duplicate flag",
    /\{renderGroup\(false\)\}\s*\{renderGroup\(true\)\}/.test(BAR));
  ok("group B is aria-hidden", /aria-hidden=\{duplicate \|\| undefined\}/.test(BAR));
  ok("only group A is measured", /ref=\{duplicate \? undefined : groupRef\}/.test(BAR));
  ok("keys are unique per physical copy", /key=\{`\$\{duplicate \? "b" : "a"\}-\$\{m\.key\}`\}/.test(BAR));

  const msgs = [{ id: "a", text: "A" }, { id: "b", text: "B" }];
  ok("repeatMessages emits WHOLE cycles only",
    repeatMessages(msgs, 3).map((m) => m.id).join(",") === "a,b,a,b,a,b");
  ok("…so no message is ever dropped",
    new Set(repeatMessages(msgs, 3).map((m) => m.id)).size === 2);
  ok("one copy is the identity case", repeatMessages(msgs, 1).map((m) => m.id).join(",") === "a,b");
  ok("repeat keys are unique", new Set(repeatMessages(msgs, 3).map((m) => m.key)).size === 6);
  ok("repeatMessages never mutates its input", (() => {
    const src = [{ id: "a", text: "A" }];
    repeatMessages(src, 4);
    return src.length === 1 && src[0].key === undefined;
  })());
  ok("an empty list repeats to nothing", repeatMessages([], 5).length === 0);
}

console.log("4) MEASURED DISTANCE — the seam is exact:");
{
  ok("the distance is the REAL rendered width of group A",
    /const groupW\s+= gp\.getBoundingClientRect\(\)\.width/.test(BAR));
  ok("it is published as a CSS variable", /"--promo-distance": `\$\{geo\.distance\}px`/.test(BAR));
  ok("the keyframes travel exactly that distance",
    /to\s+\{ transform: translate3d\(calc\(-1 \* var\(--promo-distance\)\), 0, 0\); \}/.test(CODE));
  ok("no percentage transform is used", !/translate3d\(-\d+%/.test(CODE));
  ok("a ResizeObserver re-measures on layout change", /new ResizeObserver\(measure\)/.test(BAR));
  ok("late webfonts trigger a re-measure", /document\.fonts\?\.ready/.test(BAR));
  ok("copies grow-only, so re-measuring cannot oscillate",
    /Math\.max\(prev\.copies, want\)/.test(BAR));
  ok("an insignificant width change does not restart the animation",
    /Math\.abs\(prev\.distance - groupW\) > 1/.test(BAR) &&
    /if \(!widthChanged && copies === prev\.copies\) return prev;/.test(BAR));
  ok("the bar never animates against a 0px distance",
    /animation: geo\.distance > 0 \?/.test(BAR));

  ok("group A is padded to span 2 viewports", TARGET_VIEWPORTS === 2);
  ok("a narrow message set is repeated enough", requiredPromoCopies(1000, 300) === 7);
  ok("a wide message set needs one copy", requiredPromoCopies(1000, 5000) === 1);
  ok("an unmeasured viewport is safe", requiredPromoCopies(0, 300) === 1 && requiredPromoCopies(1000, 0) === 1);
  ok("the count never drops below 1", requiredPromoCopies(-5, -5) === 1);

  ok("duration derives from distance / speed", promoDuration(4000, 40) === 100);
  ok("mobile is faster than desktop", PROMO_SPEED.mobile > PROMO_SPEED.desktop);
  ok("more messages make the loop LONGER, not faster",
    promoDuration(8000, 40) > promoDuration(4000, 40));
  ok("duration is never 0", promoDuration(0, 40) > 0 && promoDuration(-1, 40) > 0);
  ok("an invalid speed falls back to desktop", promoDuration(4000, 0) === promoDuration(4000, PROMO_SPEED.desktop));
}

console.log("5) NO BLANK FRAME across the complete cycle (simulation):");
{
  // group A and group B are laid out back to back inside an LTR viewport; the
  // track translates from 0 to -groupAWidth. Content must cover the viewport at
  // every step of the cycle.
  const simulate = (viewport, cycleW, messages) => {
    const copies = requiredPromoCopies(viewport, cycleW);
    const groupA = copies * cycleW;
    const track  = groupA * 2;                    // group A + exact duplicate
    let blank = 0;
    for (let step = 0; step <= 1000; step++) {
      const x = -(groupA * step) / 1000;          // track left edge
      if (x > 0 || x + track < viewport) blank++; // gap at either end
    }
    return { blank, groupA, copies, messages };
  };

  for (const [vw, cycle] of [[375, 200], [375, 900], [768, 400], [1024, 260], [1440, 3000]]) {
    const r = simulate(vw, cycle, 1);
    ok(`viewport ${vw} / cycle ${cycle}: never blank (${r.copies} copies, group A ${r.groupA}px)`, r.blank === 0);
    ok(`viewport ${vw} / cycle ${cycle}: group A spans >= 2 viewports`, r.groupA >= vw * 2);
  }

  // The old geometry, for contrast: translating -100% of the TRACK (both groups)
  // walks the duplicate off screen and leaves the tail blank.
  let oldBlank = 0;
  const vw = 375, track = 4000;
  for (let step = 0; step <= 1000; step++) {
    const x = -(track * step) / 1000;
    if (x + track < vw) oldBlank++;
  }
  ok("the OLD -100%-of-track translate did produce blank frames", oldBlank > 0);
}

console.log("6) RTL / LTR HARDENING:");
{
  const viewport = BAR.match(/<div\s+ref=\{viewportRef\}[\s\S]*?>/)?.[0] || "";
  ok("the overflow viewport is found", viewport.length > 0);
  ok("VIEWPORT carries dir=\"ltr\"", /dir="ltr"/.test(viewport));
  ok("VIEWPORT sets direction:ltr in CSS", /direction: "ltr"/.test(viewport));
  ok("VIEWPORT is the only element that clips", /overflow-hidden/.test(viewport) &&
    (BAR.match(/overflow-hidden/g) || []).length === 1);

  const track = BAR.slice(BAR.indexOf("will-change-transform") - 400, BAR.indexOf("--promo-distance"));
  ok("TRACK carries dir=\"ltr\"", /dir="ltr"/.test(track));
  ok("TRACK sets direction:ltr in CSS", /direction: "ltr"/.test(track));

  const groupTag = BAR.match(/<div\s*\n\s*ref=\{duplicate \? undefined : groupRef\}[\s\S]*?>/)?.[0] || "";
  ok("GROUPS carry dir=\"ltr\"", /dir="ltr"/.test(groupTag));
  ok("GROUPS set direction:ltr in CSS", /direction: "ltr"/.test(groupTag));
  ok("groups use physical flex-row geometry", /flex flex-row items-center w-max min-w-max flex-none/.test(BAR));

  ok("only the MESSAGE keeps the site's text direction", /<span[\s\S]{0,120}dir=\{dir\}/.test(BAR));
  ok("the direction comes from the site LanguageContext",
    /import \{ useLanguage \} from "@\/context\/LanguageContext";/.test(SRC) &&
    /const \{ dir \} = useLanguage\(\)/.test(CODE) && /dir=\{dir\}/.test(CODE));
  ok("no logical margin could flip the spacing", /mx-8/.test(BAR) && !/ms-\d|me-\d/.test(BAR));
  ok("messages never shrink", /shrink-0/.test(BAR) && /whitespace-nowrap/.test(BAR));
  ok("no justify-* spacing that could open a gap", !/justify-(between|around|evenly)/.test(BAR));
}

console.log("7) ANIMATION + INTERACTION:");
{
  ok("scrolling is continuous", /linear infinite/.test(CODE));
  ok("pause is ONLY animation-play-state",
    /animationPlayState: interacting \? "paused" : "running"/.test(BAR));
  ok("hover pauses", /onMouseEnter=\{hold\}/.test(BAR));
  ok("pointer interaction pauses", /onPointerDown=\{hold\}/.test(BAR));
  ok("release resumes immediately — no timer anywhere",
    /onMouseLeave=\{release\}/.test(BAR) && /onPointerUp=\{release\}/.test(BAR) &&
    /onPointerCancel=\{release\}/.test(BAR));
  ok("no setTimeout / delayed resume in the bar", !/setTimeout|setInterval/.test(BAR));
  ok("release only flips the boolean", /const release = useCallback\(\(\) => setInteracting\(false\), \[\]\)/.test(BAR));
  // Targeted, not proximity-based: the group factory and the geometry effect
  // must not reference interaction state at all.
  const factory = BAR.slice(BAR.indexOf("const renderGroup = "), BAR.indexOf("const durationSec"));
  const geoEffect = BAR.slice(BAR.indexOf("const measure = ()"), BAR.indexOf("const hold"));
  ok("pausing never rebuilds the groups",
    factory.length > 0 && !/interacting/.test(factory) &&
    geoEffect.length > 0 && !/interacting/.test(geoEffect));
  ok("the animation is pure CSS — no per-frame JS", !/requestAnimationFrame/.test(SRC));
  ok("desktop stays slower than mobile", PROMO_SPEED.desktop < PROMO_SPEED.mobile);
  ok("the speed switch is a media query listener", /matchMedia\?\.\("\(max-width: 768px\)"\)/.test(BAR));
  ok("reduced-motion users get a static bar", /prefers-reduced-motion: reduce/.test(CODE));
}

console.log("8) EMPTY STATE + UNRELATED SLIDER BEHAVIOUR PRESERVED:");
{
  ok("no Active promos renders no bar", /if \(messages\.length === 0\) return null;/.test(BAR));
  ok("the bar is only mounted from one place", (CODE.match(/<PromoMarquee /g) || []).length === 1);
  ok("an all-inactive list yields nothing",
    activePromoMessages([rec({ content: "x", status: "Inactive" })]).length === 0);
  ok("a list of title-only records yields nothing",
    activePromoMessages([rec({ title: "ref" }), rec({ title: "ref2" })]).length === 0);

  ok("the image/video Swiper is untouched",
    /<Swiper\b/.test(SRC) && /modules=\{\[Autoplay, Pagination, Navigation\]\}/.test(SRC));
  ok("autoplay config is unchanged", /\{ delay: 4000, disableOnInteraction: false \}/.test(SRC));
  ok("pagination config is unchanged",
    /dynamicBullets: true/.test(SRC) && /el: "\.slider-pagination"/.test(SRC));
  ok("the pagination CSS survives", /\.slider-pagination \.swiper-pagination-bullet-active/.test(SRC));
  ok("the Buy Now button is unchanged",
    /item\.buyNowText \|\| "Buy Now"/.test(SRC) && /hasBuyNow/.test(SRC));
  ok("video slide handling is unchanged",
    /handleSlideChange/.test(SRC) && /swiper\.autoplay\?\.stop\(\)/.test(SRC));
  ok("the LCP priority image logic is unchanged",
    /priority=\{isFirstSlide\}/.test(SRC) && /fetchPriority=\{isFirstSlide \? "high" : "auto"\}/.test(SRC));
  ok("both API endpoints are still the same",
    /collection=\$\{COLLECTION\}/.test(SRC) && /collection=\$\{PROMO_COLLECTION\}/.test(SRC));
  ok("no API route or schema is referenced by the helper",
    !/fetch\(|prisma/.test(readFileSync("src/lib/promoMarquee.js", "utf8")));
  ok("the empty-slider early return is unchanged", /if \(images\.length === 0\)/.test(SRC));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
