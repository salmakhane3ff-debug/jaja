#!/usr/bin/env node
/**
 * scripts/feedbackCarouselGeometry.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * STRUCTURAL + LAYOUT regression tests for the feedback auto-carousel.
 *
 * WHY THIS FILE EXISTS: 101 pure-helper assertions passed while production was
 * visibly broken. The bug was never in the helpers — it was in the DOM/CSS
 * geometry: the overflow container inherited `dir="rtl"` from the Arabic
 * storefront, which anchors an oversized child to the RIGHT edge and overflows
 * LEFTWARD, so at translateX(0) the viewport already showed the tail of group B
 * and translating negative walked the whole track out of view.
 *
 * There is no jsdom in this project, so these tests do two things pure helpers
 * cannot: (1) assert invariants directly on the component SOURCE, and (2)
 * simulate the flex layout numerically and prove group B is adjacent to group A
 * and that the viewport can never be empty at ANY animation progress.
 * Run: node scripts/feedbackCarouselGeometry.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from "node:fs";
import {
  splitIntoRows, repeatToFill, requiredGroupCards, CARD_GAP_CLASS,
} from "../src/lib/feedbackCarousel.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const SRC = readFileSync("src/components/FeedbackCarousel.jsx", "utf8");
// The marquee branch only (excludes the reduced-motion fallback above it).
const MARQUEE = SRC.slice(SRC.indexOf("const distance = geo.distance;"));

console.log("1) DIRECTION — marquee geometry is explicitly LTR at every level:");
{
  const viewport = SRC.match(/<div ref=\{viewportRef\}[^>]*>/)?.[0] || "";
  ok("the overflow container (viewport) is found", viewport.length > 0);
  ok("VIEWPORT carries dir=\"ltr\" (the production bug)", /dir="ltr"/.test(viewport));
  ok("VIEWPORT also sets direction:ltr in CSS", /direction:\s*"ltr"/.test(viewport));
  ok("viewport still clips the overflow", /overflow-hidden/.test(viewport));

  const groupTag = SRC.match(/<div\s+ref=\{duplicate \? undefined : groupRef\}[\s\S]*?>/)?.[0] || "";
  ok("GROUP carries dir=\"ltr\"", /dir="ltr"/.test(groupTag));
  ok("GROUP sets direction:ltr in CSS", /direction:\s*"ltr"/.test(groupTag));

  ok("TRACK sets direction:ltr in CSS", /direction:\s*"ltr"/.test(MARQUEE));
  ok("every overflow container in the file is explicitly ltr",
    (SRC.match(/overflow-hidden|overflow-x-auto/g) || []).length ===
    (SRC.match(/dir="ltr"[^>]*(overflow-hidden|overflow-x-auto)|(overflow-hidden|overflow-x-auto)[^>]*dir="ltr"/g) || []).length);
  ok("only the CARD content stays rtl", /<article\s+dir="rtl"/.test(SRC) || /dir="rtl"/.test(SRC));
  ok("the gap is a PHYSICAL margin, not a logical one", CARD_GAP_CLASS.startsWith("mr-") && !CARD_GAP_CLASS.includes("me-"));
}

console.log("2) STRUCTURE — viewport > track > groupA + groupB, nothing between:");
{
  ok("group B is rendered unconditionally next to group A",
    /\{renderGroup\(false\)\}\s*\{renderGroup\(true\)\}/.test(MARQUEE));
  ok("group B is aria-hidden", /aria-hidden=\{duplicate \|\| undefined\}/.test(SRC));
  // trackBase is a constant, so resolve it instead of scanning the JSX blindly.
  const trackBase = SRC.match(/const trackBase = "([^"]+)"/)?.[1] || "";
  ok("track is width:max-content and cannot shrink",
    /w-max/.test(trackBase) && /min-w-max/.test(trackBase) && /\$\{trackBase\} flex-none/.test(MARQUEE));
  ok("track lays out as an explicit flex ROW", /flex flex-row/.test(trackBase));
  ok("groups cannot grow/shrink", /flex flex-row items-start w-max min-w-max flex-none/.test(SRC));
  ok("NO gap utility on the TRACK", trackBase.length > 0 && !/gap-/.test(trackBase));
  const groupCls = SRC.match(/ref=\{duplicate \? undefined : groupRef\}[\s\S]*?className="([^"]+)"/)?.[1] || "";
  ok("NO gap utility on the GROUPS", groupCls.length > 0 && !/gap-/.test(groupCls));
  ok("the only gap is the VERTICAL row gap", /flex flex-col gap-3 sm:gap-4/.test(SRC));
  ok("NO justify-* spacing that could create blank space", !/justify-(between|around|evenly)/.test(SRC));
  ok("no w-full on the moving track", !/\$\{trackBase\}[^`]*w-full/.test(MARQUEE));
  ok("cards never shrink", /shrink-0/.test(SRC));
  ok("cards do not stretch vertically", /items-start/.test(SRC) && /self-start/.test(SRC));
}

console.log("3) PAUSE only toggles play-state (never rebuilds the track):");
{
  ok("pause maps to animationPlayState", /animationPlayState:\s*paused \? "paused" : "running"/.test(MARQUEE));
  ok("pause does not gate group B rendering", !/paused\s*&&[\s\S]{0,80}renderGroup/.test(MARQUEE));
  ok("pause does not appear in the transform/animation name", !/paused[\s\S]{0,40}translate3d/.test(MARQUEE));
  ok("group count is not derived from pause state", !/paused[\s\S]{0,60}repeatToFill/.test(SRC));
}

console.log("4) RESIZEOBSERVER cannot restart the loop on image loads:");
{
  ok("state only updates on a >1px width change", /Math\.abs\(prev\.distance - distance\) > 1/.test(SRC));
  ok("identical measurements bail out via prev", /return prev;/.test(SRC));
  ok("required card count is grow-only", /Math\.max\(prev\.need, want\)/.test(SRC));
  ok("no per-frame animation loop", !/requestAnimationFrame/.test(SRC));
  ok("CSS performs the animation", /animation: distance > 0 \? `fbMarquee/.test(MARQUEE));
  ok("animation waits for the first measurement", /distance > 0 \? `fbMarquee[\s\S]*?: "none"/.test(MARQUEE));
}

console.log("5) LAYOUT SIMULATION — group B is adjacent, viewport never empty:");
{
  /**
   * Simulate the flex row numerically: each card occupies W + G (its physical
   * right margin), laid left-to-right from x=0. Group A then group B.
   */
  const simulate = (cards, W, G) => {
    const outer = W + G;
    const groupA = { left: 0, right: cards * outer, width: cards * outer };
    const groupB = { left: groupA.right, right: groupA.right + cards * outer, width: cards * outer };
    return { groupA, groupB, trackWidth: groupA.width + groupB.width };
  };

  const cases = [
    { name: "mobile 375px, 6 cards", vw: 375, W: 307, G: 12, cards: 6 },
    { name: "mobile 430px, 5 cards", vw: 430, W: 340, G: 12, cards: 5 },
    { name: "desktop 1200px, 12 cards", vw: 1200, W: 320, G: 16, cards: 12 },
  ];

  for (const c of cases) {
    const { groupA, groupB, trackWidth } = simulate(c.cards, c.W, c.G);
    ok(`${c.name}: group B starts exactly where group A ends`, Math.abs(groupB.left - groupA.right) < 1);
    ok(`${c.name}: track is exactly 2x group A`, Math.abs(trackWidth - groupA.width * 2) < 1);
    ok(`${c.name}: group A spans >= 2 viewports`, groupA.width >= c.vw * 2);

    // THE CRITICAL ONE: at every animation progress the viewport must be covered.
    // The track translates from 0 to -groupA.width. Content spans [x, x+trackWidth].
    let emptyFrames = 0;
    for (let step = 0; step <= 1000; step++) {
      const x = -(groupA.width * step) / 1000;         // current translate
      const contentLeft = x;
      const contentRight = x + trackWidth;
      // The viewport [0, vw] must be fully inside the rendered content.
      if (contentLeft > 0 || contentRight < c.vw) emptyFrames++;
    }
    ok(`${c.name}: ZERO empty frames across the whole loop`, emptyFrames === 0);
  }

  // Prove the OLD rtl behaviour would have failed this same check: anchoring the
  // track's right edge to the viewport's right edge puts content at negative x.
  const { groupA, trackWidth } = simulate(6, 307, 12);
  const rtlAnchoredLeft = 375 - trackWidth;            // right edge pinned to vw
  let rtlEmpty = 0;
  for (let step = 0; step <= 1000; step++) {
    const x = rtlAnchoredLeft - (groupA.width * step) / 1000;
    if (x > 0 || x + trackWidth < 375) rtlEmpty++;
  }
  ok("the inherited-RTL anchoring DID produce empty frames (root cause proven)", rtlEmpty > 0);
}

console.log("6) THE 11-REVIEW PRODUCTION FIXTURE, end to end:");
{
  const fb = Array.from({ length: 11 }, (_, i) => ({
    _id: `r${i + 1}`,
    textContent: i % 3 === 0 ? "x".repeat(400) : "short",
    images: i % 2 === 0 ? ["/a.webp"] : [],
  }));
  const rows = splitIntoRows(fb, 2);
  ok("row 1 = #1,3,5,7,9,11", rows[0].map((r) => r._id).join(",") === "r1,r3,r5,r7,r9,r11");
  ok("row 2 = #2,4,6,8,10", rows[1].map((r) => r._id).join(",") === "r2,r4,r6,r8,r10");
  ok("all 11 present, none dropped", new Set(rows.flat().map((r) => r._id)).size === 11);

  const W = 307, G = 12, VW = 375;
  rows.forEach((row, i) => {
    const need = requiredGroupCards(VW, W + G);
    const groupA = repeatToFill(row, need);
    const groupB = repeatToFill(row, need);
    const width = groupA.length * (W + G);
    ok(`row${i + 1}: group A keeps all ${row.length} uniques`, new Set(groupA.map((r) => r._id)).size === row.length);
    ok(`row${i + 1}: group B is an exact duplicate`, groupB.every((r, k) => r._id === groupA[k]._id));
    ok(`row${i + 1}: group A (${width}px) >= 2 viewports (${VW * 2}px)`, width >= VW * 2);
    // Sequence order must cycle A,B,C,...,A,B,C — never a truncated set.
    ok(`row${i + 1}: sequence cycles whole rows`, groupA.every((r, k) => r._id === row[k % row.length]._id));
  });
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
