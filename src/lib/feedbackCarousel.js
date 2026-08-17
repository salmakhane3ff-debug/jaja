/**
 * src/lib/feedbackCarousel.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURE settings helpers for the "سلايدر متحرك تلقائياً" (autoCarousel) feedback
 * display style. Presentation only — it never fetches, filters or moderates
 * feedback. `productFeedbackSource` (currentProduct / allProducts) keeps owning
 * WHICH reviews are supplied; this module only describes HOW they move.
 *
 * Stored inside the EXISTING `feedback-settings` row — no new settings system.
 * Every value falls back to a safe default, so stores that have never opened the
 * new options behave identically to before.
 *
 * No React, no DOM, no I/O → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const FEEDBACK_LAYOUTS = Object.freeze(['grid', 'slider', 'stacked', 'autoCarousel']);
export const CAROUSEL_SPEEDS  = Object.freeze(['slow', 'medium', 'fast']);

/**
 * Constant scroll speed in PIXELS PER SECOND. Duration is derived from the
 * measured travel distance, so adding reviews makes the loop LONGER instead of
 * making the cards fly faster — every review always gets its turn on screen.
 */
const SPEED_PX_PER_SEC = Object.freeze({ slow: 28, medium: 42, fast: 60 });

/** Row 2 runs ~15% slower so the two rows never lock into a distracting sync. */
export const SECOND_ROW_SLOWDOWN = 1.15;

export const CAROUSEL_DEFAULTS = Object.freeze({
  rows: 2,                 // the new mode defaults to two rows
  speed: 'medium',
  shadow: true,
  pauseOnInteract: true,
});

const int = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };

/** True when a stored layout value selects the auto carousel. */
export function isAutoCarousel(layout) {
  return layout === 'autoCarousel';
}

/**
 * Resolve the carousel sub-settings off a feedback-settings object.
 * Unknown/missing values fall back to the defaults above.
 * @returns {{rows:1|2, speed:'slow'|'medium'|'fast', shadow:boolean, pauseOnInteract:boolean}}
 */
export function normalizeCarouselSettings(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const rows = int(s.carouselRows, CAROUSEL_DEFAULTS.rows);
  return {
    rows: rows === 1 ? 1 : 2,                       // only 1 or 2 are supported
    speed: CAROUSEL_SPEEDS.includes(s.carouselSpeed) ? s.carouselSpeed : CAROUSEL_DEFAULTS.speed,
    shadow: s.carouselShadow !== false,             // default ON
    pauseOnInteract: s.carouselPauseOnInteract !== false, // default ON
  };
}

/**
 * Distribute reviews across the rows DETERMINISTICALLY by alternating, so both
 * rows advance through the whole catalogue together and no review is ever
 * dropped: 11 reviews -> row 1 = #1,3,5,7,9,11 (6), row 2 = #2,4,6,8,10 (5).
 * @returns {Array<Array>} one array per row, empty rows removed
 */
export function splitIntoRows(items, rows) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length === 0) return [];
  if (rows !== 2 || list.length < 2) return [list];
  const a = [], b = [];
  list.forEach((it, i) => (i % 2 === 0 ? a : b).push(it));
  return [a, b].filter((r) => r.length > 0);
}

/** Fallback minimum when the viewport width is not known yet (SSR/first paint). */
export const MIN_GROUP_CARDS = 8;

/** Group A should span this many viewport widths so blank space is impossible. */
export const TARGET_VIEWPORTS = 2.5;

/**
 * How many CARDS group A needs so it spans ~TARGET_VIEWPORTS screens.
 * @param {number} viewportPx  measured row viewport width (0 = unknown)
 * @param {number} cardOuterPx measured outer width of one card incl. its gap
 */
export function requiredGroupCards(viewportPx, cardOuterPx) {
  const vw = Number(viewportPx) || 0;
  const cw = Number(cardOuterPx) || 0;
  if (vw <= 0 || cw <= 0) return MIN_GROUP_CARDS;
  return Math.max(2, Math.ceil((vw * TARGET_VIEWPORTS) / cw));
}

/**
 * Repeat a row's reviews until the group is wide enough for a seamless marquee.
 *
 * NEVER discards a review: the source sequence is emitted whole, over and over,
 * so [1,3,5] becomes [1,3,5,1,3,5,...] and never [1,3]. When the row already has
 * enough cards it is returned untouched. Repetition is VISUAL only - the same
 * object references are reused and no review data is modified.
 */
export function repeatToFill(items, minCount = MIN_GROUP_CARDS) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length === 0) return [];
  const target = Math.max(1, int(minCount, MIN_GROUP_CARDS));
  if (list.length >= target) return list;          // every review kept as-is
  const out = [];
  while (out.length < target) out.push(...list);   // whole cycles only
  return out;
}

/**
 * Loop duration from the MEASURED travel distance and a constant px/s speed.
 * distance = group A's real rendered width, so the seam is exact and the speed
 * is independent of card count, card width, images, fonts or viewport.
 * @returns {number} seconds (never 0 - that would freeze the animation)
 */
export function carouselDurationFromDistance(distancePx, speed, rowIndex = 0) {
  const pps = SPEED_PX_PER_SEC[speed] ?? SPEED_PX_PER_SEC.medium;
  const dist = Math.max(1, Number(distancePx) || 0);
  const secs = dist / pps;
  return Math.round((rowIndex === 1 ? secs * SECOND_ROW_SLOWDOWN : secs) * 100) / 100;
}

/** Effective px/s for a row (row 2 is ~15% slower). Exposed for tests. */
export function carouselPxPerSec(speed, rowIndex = 0) {
  const pps = SPEED_PX_PER_SEC[speed] ?? SPEED_PX_PER_SEC.medium;
  return rowIndex === 1 ? Math.round((pps / SECOND_ROW_SLOWDOWN) * 100) / 100 : pps;
}

/**
 * Should the track animate at all?
 * A single card has nothing to scroll past, and reduced-motion users must get a
 * static list rather than perpetual movement.
 */
export function shouldAnimate({ cardCount, reducedMotion }) {
  return !reducedMotion && int(cardCount, 0) > 1;
}

/**
 * GEOMETRY - measured, not assumed.
 *
 * Two earlier attempts animated to a PERCENTAGE of the track width. Both were
 * assumption-bound:
 *   1. `gap` on the track: 2N flat siblings have only 2N-1 gaps, so `-50%` fell
 *      exactly G/2 short of the duplicate.
 *   2. gap moved onto the card: algebraically exact, but `-50%` is still only
 *      correct while EVERY card renders at exactly the assumed width. Real cards
 *      vary with vw rounding, scrollbars, image strips, font metrics and
 *      container padding, and any drift reopens a blank stretch.
 *
 * The animation now translates by group A's REAL rendered width, measured once
 * per size change with a ResizeObserver and published as the CSS variable
 * `--marquee-distance`. CSS still runs the animation (no per-frame JS), so the
 * seam is exact by construction whatever the cards actually measure.
 */
// PHYSICAL margin-right, deliberately not the logical `me-*`: the card renders
// dir="rtl" for Arabic text, where margin-inline-end resolves to margin-LEFT.
// The marquee geometry must be identical in every site language.
export const CARD_GAP_CLASS = 'mr-3 sm:mr-4';   // 12px mobile / 16px desktop
