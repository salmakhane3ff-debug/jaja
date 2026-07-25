/**
 * src/lib/liveFeed.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure helpers for the affiliate dashboard's live (polling) feed. No React, no
 * DOM, no network — so the "which items are new / should the sale sound play"
 * logic is deterministic and unit-testable.
 *
 * The dashboard polls its existing REST endpoints on an interval and replaces
 * state wholesale (so the UI can never show a duplicate row). These helpers sit
 * on top to answer: "since the last poll, which orders are NEW?" — used to play
 * the new-sale sound exactly once per new order and to briefly highlight it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** First present id among idKeys, as a string (or null). */
export function itemId(item, idKeys = ['_id', 'id']) {
  if (!item || typeof item !== 'object') return null;
  for (const k of idKeys) if (item[k] != null) return String(item[k]);
  return null;
}

/**
 * Diff an incoming list against the set of ids already seen.
 *
 * `seen` is MONOTONIC (a union): once an id has been observed it is never
 * "unseen", so a row that briefly disappears from a partial response and returns
 * can never re-trigger the sound. Returns a NEW Set (never mutates the input).
 *
 * @param {Set<string>|Iterable<string>} prevSeen
 * @param {Array<object>} items
 * @param {string[]} [idKeys]
 * @returns {{ newItems: object[], newIds: string[], seen: Set<string> }}
 */
export function diffNewItems(prevSeen, items, idKeys = ['_id', 'id']) {
  const seen = prevSeen instanceof Set ? new Set(prevSeen) : new Set(prevSeen || []);
  const newItems = [];
  const newIds = [];
  for (const it of Array.isArray(items) ? items : []) {
    const id = itemId(it, idKeys);
    if (id == null) continue;
    if (!seen.has(id)) { newItems.push(it); newIds.push(id); }
    seen.add(id);
  }
  return { newItems, newIds, seen };
}

/**
 * Should the new-sale sound play this cycle?
 * NEVER on the initial load (that would beep for the whole existing history),
 * and only when at least one genuinely new order arrived.
 */
export function shouldPlaySaleSound({ initial, newCount }) {
  return !initial && newCount > 0;
}

/** Seed a seen-set from a list (used on first load — no sound). */
export function seedSeen(items, idKeys = ['_id', 'id']) {
  return diffNewItems(new Set(), items, idKeys).seen;
}
