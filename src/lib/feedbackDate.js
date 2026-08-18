/**
 * src/lib/feedbackDate.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURE date helpers for feedback display.
 *
 * A review has an OPTIONAL admin-editable `reviewDate` (the date the review
 * should appear to be from). When it is NULL the display falls back to
 * `createdAt`, so every pre-existing feedback renders exactly as before:
 *
 *     displayDate = reviewDate ?? createdAt
 *
 * `createdAt` itself is never modified — it is stripped by updateFeedback() as
 * an audit field.
 *
 * Relative labels ("منذ شهرين", "il y a 2 mois", "2 months ago") come from
 * Intl.RelativeTimeFormat with the site's own locale, so nothing is hardcoded in
 * any language. Falls back to an absolute date when Intl is unavailable.
 *
 * No React, no DOM, no I/O → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const MS = { minute: 60_000, hour: 3_600_000, day: 86_400_000 };

/**
 * Coerce to a usable Date, or null.
 * Guards the empty cases EXPLICITLY: `new Date(null)` is the epoch and
 * `new Date('')` is Invalid, so an absent date must never reach the Date
 * constructor or a cleared field would render as 1 Jan 1970.
 */
function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The date a review should DISPLAY: admin override, else creation date. */
export function resolveReviewDate(item) {
  return toDate(item?.reviewDate ?? item?.createdAt ?? null);
}

/** True when the admin has set an explicit display date. */
export function hasCustomReviewDate(item) {
  return toDate(item?.reviewDate) !== null;
}

/**
 * Coarse elapsed time, picked so the label reads naturally:
 * minutes → hours → days → months → years.
 * @returns {{value:number, unit:'minute'|'hour'|'day'|'month'|'year'}|null}
 */
export function relativeParts(date, now = new Date()) {
  const d = toDate(date);
  if (!d) return null;
  const diff = now.getTime() - d.getTime();
  const past = diff >= 0;
  const abs = Math.abs(diff);

  if (abs < MS.hour)  return { value: sign(Math.max(1, Math.round(abs / MS.minute)), past), unit: 'minute' };
  if (abs < MS.day)   return { value: sign(Math.round(abs / MS.hour), past), unit: 'hour' };

  const days = Math.round(abs / MS.day);
  if (days < 30)  return { value: sign(days, past), unit: 'day' };

  const months = monthsBetween(d, now);
  if (Math.abs(months) < 12) return { value: sign(Math.max(1, Math.abs(months)), past), unit: 'month' };
  return { value: sign(Math.max(1, Math.trunc(Math.abs(months) / 12)), past), unit: 'year' };
}

const sign = (n, past) => (past ? -n : n);

/** Whole calendar months between two dates (signed: b after a → positive). */
export function monthsBetween(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/**
 * Localized relative label for a review date, e.g. "منذ شهرين" / "2 months ago".
 * @param {Date|string} date
 * @param {object} [opts] { locale, now, absoluteAfterDays }
 * @returns {string} never throws; "" when the date is unusable
 */
export function relativeDateLabel(date, opts = {}) {
  const { locale = 'ar', now = new Date(), absoluteAfterDays = 0 } = opts;
  const d = toDate(date);
  if (!d) return '';

  // Optionally switch to an absolute date for very old reviews.
  if (absoluteAfterDays > 0 && now.getTime() - d.getTime() > absoluteAfterDays * MS.day) {
    return absoluteDateLabel(d, locale);
  }

  const parts = relativeParts(d, now);
  if (!parts) return '';
  try {
    // `numeric: 'auto'` yields idiomatic forms ("last year" rather than "1 year
    // ago"), localized by Intl in whatever locale the site is running.
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(parts.value, parts.unit);
  } catch {
    return absoluteDateLabel(d, locale);
  }
}

/** Locale-formatted absolute date, used as the Intl fallback. */
export function absoluteDateLabel(date, locale = 'ar') {
  const d = toDate(date);
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Normalize an admin form value into something safe to persist.
 * '' / null (field cleared) → null, which restores the createdAt fallback.
 * An unparseable value returns `undefined` so the caller can OMIT the key and
 * leave the stored date untouched.
 */
export function parseAdminReviewDate(value) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const s = String(value).trim();
  if (s === '') return null;
  const d = toDate(s);
  return d === null ? undefined : d.toISOString();
}

/** Format a stored date for an <input type="datetime-local"> value. */
export function toDatetimeLocalValue(date) {
  const d = toDate(date);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
