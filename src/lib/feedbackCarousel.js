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
 * Minimum cards a marquee group needs so the row is never visually empty.
 * Mobile cards are ~82vw (≈1.2 per screen) and desktop ~320px (≈3.5 per screen),
 * so 8 covers roughly two viewport widths in both cases.
 */
export const MIN_GROUP_CARDS = 8;

/**
 * Repeat a small review set until the group is dense enough to fill the row.
 * VISUAL ONLY — the underlying review data is never modified, and the returned
 * array holds references to the same objects.
 *
 * A 1–3 review store would otherwise animate a mostly-empty track (or, with one
 * card per row, show a single motionless card).
 *
 * @param {Array} items
 * @param {number} minCount
 * @returns {Array} at least `minCount` entries while items is non-empty
 */
export function repeatToFill(items, minCount = MIN_GROUP_CARDS) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length === 0) return [];
  const target = Math.max(1, int(minCount, MIN_GROUP_CARDS));
  if (list.length >= target) return list;
  const out = [];
  while (out.length < target) out.push(...list);
  return out;
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
 * GEOMETRY NOTE — why the gap lives on the card, not on the track.
 *
 * The first implementation laid 2N cards out as flat flex siblings with
 * `gap: G`, giving a track of `2N·W + (2N−1)·G` and animating to `-50%`:
 *
 *     50% of track = N·W + (N − 0.5)·G      but one period = N·W + N·G
 *
 * so every loop fell exactly G/2 (8px) short of the duplicate — a visible jump,
 * and the row drifted out of density.
 *
 * The fix is to give each card `margin-inline-end: G` and NO gap on the track.
 * Each card then occupies `W + G`, so:
 *
 *     track = 2N·(W + G)   →   50% = N·(W + G) = exactly one period
 *
 * `-50%` becomes mathematically exact for any card count, with no measurement,
 * no ResizeObserver and no JS animation loop.
 */
export const CARD_GAP_CLASS = 'me-3 sm:me-4';   // 12px mobile / 16px desktop
