/**
 * src/lib/ugcTime.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Business-timezone day helpers for the UGC simulation engine AND the dashboard
 * statistics — so "today", the daily-target reset, and the earnings buckets all
 * agree on when a day starts. Default TZ: Africa/Casablanca (configurable in UGC
 * settings). Pure: no DB.
 *
 * The "business day" boundary is TZ-local midnight, expressed as the UTC instant
 * of that midnight. Earnings store that instant in `generationDate`, so a day's
 * rows share one bucket and aggregate cleanly regardless of the viewer's TZ.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const UGC_DEFAULT_TIMEZONE = 'Africa/Casablanca';

const pad = (n) => String(n).padStart(2, '0');

/** True for a valid IANA timezone id. */
export function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** The TZ-local wall-clock parts of an instant. */
function tzParts(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const { type, value } of dtf.formatToParts(date)) if (type !== 'literal') p[type] = value;
  let hour = Number(p.hour); if (hour === 24) hour = 0;
  return { year: +p.year, month: +p.month, day: +p.day, hour, minute: +p.minute, second: +p.second };
}

/** TZ offset (ms) at `date`: how far TZ-local wall-clock is ahead of UTC. */
function offsetMs(date, tz) {
  const p = tzParts(date, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - (date.getTime() - date.getMilliseconds());
}

/** "YYYY-MM-DD" for the business date containing `date` in `tz`. */
export function businessDateKey(date, tz = UGC_DEFAULT_TIMEZONE) {
  const p = tzParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** UTC instant of TZ-local midnight for the business date containing `date`. */
export function startOfBusinessDay(date, tz = UGC_DEFAULT_TIMEZONE) {
  const p = tzParts(date, tz);
  const localMidnightAsUTC = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0);
  // Offset sampled around local noon → immune to a midnight DST transition.
  const off = offsetMs(new Date(localMidnightAsUTC + 12 * 3600 * 1000), tz);
  return new Date(localMidnightAsUTC - off);
}

/** Start of the NEXT business day (i.e. this day's exclusive end). */
export function endOfBusinessDay(date, tz = UGC_DEFAULT_TIMEZONE) {
  const start = startOfBusinessDay(date, tz);
  // +25h lands safely inside the next day even across a DST shift; snap to its start.
  return startOfBusinessDay(new Date(start.getTime() + 25 * 3600 * 1000), tz);
}

/**
 * The last `count` business-day start instants, oldest→newest (newest = today).
 * Robust across DST: steps back 1h from each day-start (always into the prior day)
 * and snaps. Used by the 7-day sparkline + today/yesterday windows.
 */
export function businessDayStarts(date, tz = UGC_DEFAULT_TIMEZONE, count = 7) {
  const out = [];
  let cur = startOfBusinessDay(date, tz);
  for (let i = 0; i < count; i++) {
    out.unshift(cur);
    cur = startOfBusinessDay(new Date(cur.getTime() - 3600 * 1000), tz);
  }
  return out;
}
