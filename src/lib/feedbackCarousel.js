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

/** Seconds each card spends crossing the viewport — bigger = slower. */
const SPEED_SECONDS_PER_CARD = Object.freeze({ slow: 6, medium: 4, fast: 2.5 });

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
 * Animation duration for one full loop of a row, in seconds.
 * Scales with the number of cards so the perceived speed stays constant whether
 * a row holds 3 reviews or 30.
 *
 * @param {'slow'|'medium'|'fast'} speed
 * @param {number} cardCount  cards in this row (before the seamless duplicate)
 * @param {number} rowIndex   0 = first row, 1 = second (slightly slower)
 * @returns {number} seconds (never 0 — a 0s duration would freeze the animation)
 */
export function carouselDurationSec(speed, cardCount, rowIndex = 0) {
  const per = SPEED_SECONDS_PER_CARD[speed] ?? SPEED_SECONDS_PER_CARD.medium;
  const count = Math.max(1, int(cardCount, 1));
  const base = per * count;
  return Math.round((rowIndex === 1 ? base * SECOND_ROW_SLOWDOWN : base) * 100) / 100;
}

/**
 * Split reviews across the rows, preserving order (row 0 takes the first half).
 * With one row every item stays in a single track.
 * @returns {Array<Array>} one array per row, empty rows removed
 */
export function splitIntoRows(items, rows) {
  const list = Array.isArray(items) ? items : [];
  if (rows !== 2 || list.length < 2) return list.length ? [list] : [];
  const half = Math.ceil(list.length / 2);
  return [list.slice(0, half), list.slice(half)].filter((r) => r.length > 0);
}

/**
 * Should the track animate at all?
 * A single card has nothing to scroll past, and reduced-motion users must get a
 * static list rather than perpetual movement.
 */
export function shouldAnimate({ cardCount, reducedMotion }) {
  return !reducedMotion && int(cardCount, 0) > 1;
}
