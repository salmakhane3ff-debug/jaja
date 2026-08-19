/**
 * src/lib/promoMarquee.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURE helpers for the storefront promotional-text bar.
 *
 * FIELD SEMANTICS (from the admin form at /admin/promo-text):
 *   title    — INTERNAL reference only. Never shown to customers.
 *   content  — the actual promotional message. This is the canonical public text.
 *   emoji    — decorative, rendered either side of the message.
 *   status   — only "Active" records are published.
 *   priority — display order, ascending, exactly as the admin list sorts.
 *
 * The admin also writes a denormalised `text` (= "emoji content emoji") on every
 * save. That is a legacy convenience copy, not the source of truth: it is used
 * ONLY when a record has no usable `content`, and it is rendered verbatim
 * because it already carries its own emoji on both sides.
 *
 * The storefront previously did `text || \`emoji ${title || content} emoji\``,
 * which published the INTERNAL title whenever `text` was absent. `title` is
 * never consulted here.
 *
 * No React, no DOM, no I/O → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Only records with this status are published. */
export const ACTIVE_STATUS = 'Active';

/** Fallback decoration when a record has no emoji. */
export const DEFAULT_EMOJI = '🎉';

/** Scroll speed in PIXELS PER SECOND. Desktop stays slow; mobile runs faster. */
export const PROMO_SPEED = Object.freeze({ desktop: 40, mobile: 80 });

/** Group A should span this many viewport widths so the seam can never gap. */
export const TARGET_VIEWPORTS = 2;

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * The public message for one promo record.
 *
 * `content` wins. `text` is a legacy fallback only, returned verbatim (it
 * already includes its emoji). `title` is internal and is NEVER used.
 *
 * @returns {{message:string, emoji:string, decorate:boolean}|null}
 *   null when the record carries nothing publishable.
 */
export function promoMessage(item) {
  if (!item || typeof item !== 'object') return null;

  const emoji = str(item.emoji) || DEFAULT_EMOJI;
  const content = str(item.content);
  if (content) return { message: content, emoji, decorate: true };

  // Legacy rows written before `content` existed: `text` already reads
  // "emoji message emoji", so it must not be decorated a second time.
  const legacy = str(item.text);
  if (legacy) return { message: legacy, emoji, decorate: false };

  return null;                                    // title is not a public message
}

/** The final string shown in the bar. */
export function promoDisplayText(item) {
  const parsed = promoMessage(item);
  if (!parsed) return '';
  return parsed.decorate ? `${parsed.emoji} ${parsed.message} ${parsed.emoji}` : parsed.message;
}

/** True when the record is published. Anything other than "Active" is hidden. */
export function isActivePromo(item) {
  return str(item?.status) === ACTIVE_STATUS;
}

/**
 * Every ACTIVE promo record, ordered by priority ascending (the same order the
 * admin list shows), with a stable tie-break on the original position so equal
 * priorities never reshuffle between renders.
 *
 * Records are read, never mutated: each entry is a NEW small object and the
 * input array is not sorted in place.
 *
 * @returns {Array<{id:string, text:string, priority:number}>}
 */
export function activePromoMessages(list) {
  const rows = Array.isArray(list) ? list : [];
  return rows
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isActivePromo(item) && promoDisplayText(item) !== '')
    .sort((a, b) => {
      const pa = Number(a.item.priority);
      const pb = Number(b.item.priority);
      const na = Number.isFinite(pa) ? pa : 0;
      const nb = Number.isFinite(pb) ? pb : 0;
      return na - nb || a.index - b.index;         // stable
    })
    .map(({ item, index }) => ({
      id: String(item._id ?? item.id ?? index),
      text: promoDisplayText(item),
      priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0,
    }));
}

/**
 * How many times the full message sequence must be emitted so group A spans
 * ~TARGET_VIEWPORTS screens.
 *
 * WHY: the track translates by group A's exact width. If group A is narrower
 * than the viewport, group B cannot cover the remainder and a blank stretch
 * appears at the seam. Repetition is VISUAL only — whole cycles, so every
 * active message is always present and none is ever dropped.
 *
 * @param {number} viewportPx  measured viewport width (0 = not measured yet)
 * @param {number} cyclePx     measured width of ONE full message sequence
 */
export function requiredPromoCopies(viewportPx, cyclePx) {
  const vw = Number(viewportPx) || 0;
  const cw = Number(cyclePx) || 0;
  if (vw <= 0 || cw <= 0) return 1;
  return Math.max(1, Math.ceil((vw * TARGET_VIEWPORTS) / cw));
}

/**
 * Repeat the message list `copies` times. WHOLE cycles only — [a,b] becomes
 * [a,b,a,b], never [a,b,a]. Keys are made unique per physical copy so React
 * never collapses a repeated message.
 */
export function repeatMessages(messages, copies = 1) {
  const list = Array.isArray(messages) ? messages : [];
  if (list.length === 0) return [];
  const n = Math.max(1, Math.trunc(Number(copies) || 1));
  const out = [];
  for (let c = 0; c < n; c++) {
    for (const m of list) out.push({ ...m, key: `${c}-${m.id}` });
  }
  return out;
}

/**
 * Loop duration from the MEASURED travel distance and a constant px/s speed,
 * so adding messages makes the loop longer instead of making it fly faster.
 * @returns {number} seconds (never 0 — that would freeze the animation)
 */
export function promoDuration(distancePx, pxPerSec) {
  const pps = Number(pxPerSec) > 0 ? Number(pxPerSec) : PROMO_SPEED.desktop;
  const dist = Math.max(1, Number(distancePx) || 0);
  return Math.round((dist / pps) * 100) / 100;
}
