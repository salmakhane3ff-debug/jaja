/**
 * src/lib/ugcSettings.js
 * ─────────────────────────────────────────────────────────────────────────────
 * UGC module settings: defaults, normalization, and validation. Pure logic — no
 * DB, no Prisma. The settings themselves are persisted via the existing generic
 * store (`settings` row id='ugc', getSettings/upsertSettings); this module only
 * defines their shape and rules.
 *
 * Used by:
 *   • admin save            → assertValidUgcSettings (throws on invalid)
 *   • earnings engine       → validateUgcSettings each cycle (never generate on
 *                             invalid/missing/partial settings — see spec)
 *   • affiliate intro page  → estimatePotentialEarnings (display-only ESTIMATE)
 *
 * MONEY NOTE: this module does NOT compute ledger amounts. The Decimal-safe
 * `amount = generatedSales × commissionPerSale` lives in the earnings service,
 * where Prisma.Decimal is available. The estimate below is a non-accounting UI
 * hint, explicitly framed as "potential/estimated", and uses plain numbers.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { UGC_STATUS } from './ugcStatus.js';

// Hard server ceiling for uploads, independent of what an admin configures.
export const UGC_MAX_UPLOAD_BYTES_CEILING = 200 * 1024 * 1024; // 200 MB
export const UGC_MIN_POLL_INTERVAL_MS = 60_000;                 // 1 min floor
export const UGC_APPROVED_STATUSES = [UGC_STATUS.APPROVED, UGC_STATUS.RUNNING];

// Bounds for free-text/informational settings (refinement #4).
export const UGC_MAX_INSTRUCTION_LEN = 300;   // per instruction line
export const UGC_MAX_INSTRUCTIONS = 30;       // number of lines
export const UGC_MAX_URL_LEN = 2048;

/**
 * Coerce arbitrary input to BOUNDED PLAIN TEXT: strip control characters, collapse
 * whitespace, trim, and hard-cap length. The result is safe to store and to render
 * as text — it never requires (or permits) HTML rendering.
 */
export function sanitizePlainText(value, maxLen = UGC_MAX_INSTRUCTION_LEN) {
  if (typeof value !== "string") return "";
  // Replace C0 control chars (0-31) and DEL (127) with a space. Codepoint filter
  // (no control-char literals in source), then collapse whitespace + hard-cap.
  let out = "";
  for (const ch of value) {
    const c = ch.codePointAt(0);
    out += (c <= 31 || c === 127) ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

// Safe defaults: the module and its engine are OFF until an admin explicitly
// enables them, so nothing generates earnings by accident on first deploy.
export const UGC_DEFAULT_SETTINGS = Object.freeze({
  enabled:                false,
  earningsEngineEnabled:  false,
  allowEstimatedEarnings: true,
  defaultApprovedStatus:  UGC_STATUS.RUNNING,
  commissionPerSale:      4,
  minGeneratedSales:      1,
  maxGeneratedSales:      30,
  minDailyEstimate:       1,
  maxDailyEstimate:       30,
  generationSpeed:        1,            // multiplier ≥ 0 (1 = one generation batch per cycle)
  pollIntervalMs:         3_600_000,    // 1 hour
  minVideoSeconds:        5,
  maxVideoSeconds:        120,
  maxUploadBytes:         50 * 1024 * 1024, // 50 MB
  exampleVideoUrl:        '',
  instructions:           [],
});

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const bool = (v, d) => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : d);

/**
 * Resolve a poll interval to a SAFE value, never below the floor (final check #3).
 * Used both for the CLI `--interval` flag and for the per-cycle interval read.
 * Returns { ms, clamped, invalid }: `invalid` when the input wasn't a finite
 * number (falls back to the default), `clamped` when it was below the floor.
 */
export function resolvePollIntervalMs(value, fallback = UGC_DEFAULT_SETTINGS.pollIntervalMs) {
  // Treat null/undefined/'' as invalid (Number() would coerce them to 0/NaN).
  const n = (value === null || value === undefined || value === '') ? NaN : Number(value);
  if (!Number.isFinite(n)) return { ms: Math.max(UGC_MIN_POLL_INTERVAL_MS, fallback), clamped: false, invalid: true };
  if (n < UGC_MIN_POLL_INTERVAL_MS) return { ms: UGC_MIN_POLL_INTERVAL_MS, clamped: true, invalid: false };
  return { ms: n, clamped: false, invalid: false };
}

/**
 * Merge raw stored settings over the defaults and coerce types. Never throws —
 * always returns a fully-populated object (missing keys fall back to defaults).
 */
export function normalizeUgcSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = UGC_DEFAULT_SETTINGS;
  return {
    enabled:                bool(r.enabled,                d.enabled),
    earningsEngineEnabled:  bool(r.earningsEngineEnabled,  d.earningsEngineEnabled),
    allowEstimatedEarnings: bool(r.allowEstimatedEarnings, d.allowEstimatedEarnings),
    defaultApprovedStatus:  UGC_APPROVED_STATUSES.includes(r.defaultApprovedStatus) ? r.defaultApprovedStatus : d.defaultApprovedStatus,
    commissionPerSale:      num(r.commissionPerSale, d.commissionPerSale),
    minGeneratedSales:      num(r.minGeneratedSales, d.minGeneratedSales),
    maxGeneratedSales:      num(r.maxGeneratedSales, d.maxGeneratedSales),
    minDailyEstimate:       num(r.minDailyEstimate,  d.minDailyEstimate),
    maxDailyEstimate:       num(r.maxDailyEstimate,  d.maxDailyEstimate),
    generationSpeed:        num(r.generationSpeed,   d.generationSpeed),
    pollIntervalMs:         num(r.pollIntervalMs,    d.pollIntervalMs),
    minVideoSeconds:        num(r.minVideoSeconds,   d.minVideoSeconds),
    maxVideoSeconds:        num(r.maxVideoSeconds,   d.maxVideoSeconds),
    maxUploadBytes:         num(r.maxUploadBytes,    d.maxUploadBytes),
    exampleVideoUrl:        sanitizePlainText(typeof r.exampleVideoUrl === 'string' ? r.exampleVideoUrl : d.exampleVideoUrl, UGC_MAX_URL_LEN),
    instructions:           (Array.isArray(r.instructions) ? r.instructions : d.instructions)
                              .map((x) => sanitizePlainText(x, UGC_MAX_INSTRUCTION_LEN))
                              .filter(Boolean)
                              .slice(0, UGC_MAX_INSTRUCTIONS),
  };
}

/**
 * Validate a NORMALIZED settings object. Pure: returns a list of errors, never
 * throws. Empty list = valid. The engine treats a non-empty list as "stop, do
 * not generate" and logs it.
 * @returns {string[]}
 */
export function validateUgcSettings(s) {
  const errors = [];
  const n = normalizeUgcSettings(s);

  if (!(n.commissionPerSale >= 0)) errors.push('commissionPerSale must be >= 0');
  if (!(n.minGeneratedSales >= 0)) errors.push('minGeneratedSales must be >= 0');
  if (!(n.maxGeneratedSales >= n.minGeneratedSales)) errors.push('maxGeneratedSales must be >= minGeneratedSales');
  if (!(n.minDailyEstimate >= 0)) errors.push('minDailyEstimate must be >= 0');
  if (!(n.maxDailyEstimate >= n.minDailyEstimate)) errors.push('maxDailyEstimate must be >= minDailyEstimate');
  if (!(n.minVideoSeconds > 0)) errors.push('minVideoSeconds must be > 0');
  if (!(n.maxVideoSeconds > n.minVideoSeconds)) errors.push('maxVideoSeconds must be > minVideoSeconds');
  if (!(n.maxUploadBytes > 0)) errors.push('maxUploadBytes must be > 0');
  if (n.maxUploadBytes > UGC_MAX_UPLOAD_BYTES_CEILING) errors.push(`maxUploadBytes must be <= server ceiling (${UGC_MAX_UPLOAD_BYTES_CEILING})`);
  if (!(n.pollIntervalMs >= UGC_MIN_POLL_INTERVAL_MS)) errors.push(`pollIntervalMs must be >= ${UGC_MIN_POLL_INTERVAL_MS}`);
  if (!(n.generationSpeed >= 0)) errors.push('generationSpeed must be >= 0');
  if (!UGC_APPROVED_STATUSES.includes(n.defaultApprovedStatus)) errors.push('defaultApprovedStatus must be APPROVED or RUNNING');

  return errors;
}

/** Throwing wrapper for the admin-save path. */
export function assertValidUgcSettings(s) {
  const errors = validateUgcSettings(s);
  if (errors.length) {
    throw Object.assign(new Error(`Invalid UGC settings: ${errors.join('; ')}`), { code: 'UGC_INVALID_SETTINGS', errors });
  }
  return normalizeUgcSettings(s);
}

/** True when the engine is allowed to run at all this cycle. */
export function isEngineRunnable(s) {
  const n = normalizeUgcSettings(s);
  return n.enabled && n.earningsEngineEnabled && validateUgcSettings(n).length === 0;
}

/**
 * DISPLAY-ONLY estimate for the affiliate intro page. Never accounting, never a
 * promise — the UI must frame this as "potential / estimated / may generate".
 * Returns null when estimates are disabled by settings.
 */
export function estimatePotentialEarnings(s) {
  const n = normalizeUgcSettings(s);
  if (!n.allowEstimatedEarnings) return null;
  const round2 = (x) => Math.round(x * 100) / 100;
  return {
    commissionPerSale: n.commissionPerSale,
    minSales:          n.minGeneratedSales,
    maxSales:          n.maxGeneratedSales,
    minEarning:        round2(n.commissionPerSale * n.minGeneratedSales),
    maxEarning:        round2(n.commissionPerSale * n.maxGeneratedSales),
    dailyMinSales:     n.minDailyEstimate,
    dailyMaxSales:     n.maxDailyEstimate,
  };
}
