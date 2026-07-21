/**
 * src/lib/ugcSettingsAudit.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure diff logic for the UGC settings audit trail. No DB, no Prisma — the
 * persistence lives in ugcAuditService.
 *
 * WHY: settings drive the MONEY PATH. A change to the commission, the generation
 * bounds, or the engine flag changes what affiliates are paid, so every edit is
 * recorded as an immutable {key, from, to} diff and flagged when it touches an
 * earnings-affecting key.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { normalizeUgcSettings } from './ugcSettings.js';

/**
 * Keys whose value changes what the earnings engine generates (or whether it
 * generates at all). Display-only knobs (estimates, instructions, video limits)
 * are audited too, but NOT flagged as earnings-affecting.
 */
export const EARNINGS_AFFECTING_KEYS = Object.freeze([
  'enabled',                // gates the whole module
  'earningsEngineEnabled',  // gates generation
  'commissionPerSale',      // money per generated sale
  'minGeneratedSales',      // generation bounds
  'maxGeneratedSales',
  'generationSpeed',        // batches per cycle
  'pollIntervalMs',         // how often a cycle runs
  'defaultApprovedStatus',  // APPROVED vs RUNNING → whether a video starts earning
]);

const isEqual = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
};

/**
 * Diff two settings objects (normalized first, so type coercion never registers
 * as a spurious change).
 * @returns {Array<{key:string, from:*, to:*, earningsAffecting:boolean}>}
 */
export function diffUgcSettings(before, after) {
  const a = normalizeUgcSettings(before);
  const b = normalizeUgcSettings(after);
  const changes = [];
  for (const key of Object.keys(b)) {
    if (!isEqual(a[key], b[key])) {
      changes.push({ key, from: a[key], to: b[key], earningsAffecting: EARNINGS_AFFECTING_KEYS.includes(key) });
    }
  }
  return changes;
}

/** True when any change in the list touches an earnings-affecting key. */
export function hasEarningsImpact(changes) {
  return Array.isArray(changes) && changes.some((c) => c && c.earningsAffecting === true);
}

/** Compact human-readable summary of a change (for the admin history list). */
export function describeChange(change) {
  if (!change) return '';
  const fmt = (v) => (Array.isArray(v) ? `${v.length} ligne(s)` : v === '' ? '—' : String(v));
  return `${change.key}: ${fmt(change.from)} → ${fmt(change.to)}`;
}
