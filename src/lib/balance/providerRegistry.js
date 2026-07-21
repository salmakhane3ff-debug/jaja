/**
 * src/lib/balance/providerRegistry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Balance provider registry (refinement #2). The balance orchestrator consumes
 * REGISTERED providers instead of a hardcoded list, so a new earning/deduction
 * source is added by registering a provider — the orchestrator never changes.
 *
 * A provider:
 *   {
 *     source:   string,                 // unique key; re-registering replaces
 *     compute:  async (affiliateId, db) => Decimal|number|string,   // SIGNED component
 *     priority: number = 100,           // lower runs first (deterministic order)
 *   }
 *
 * ── PROVIDER CONTRACT: PURE, READ-ONLY (refinement #4) ────────────────────────
 *   `compute` MUST be a read-only projection of persisted state. A provider:
 *     • MUST NOT write to the database (no create/update/delete/upsert).
 *     • MUST NOT perform side effects (no network calls, no mutation of shared
 *       state, no logging that changes behavior, no cache writes that affect
 *       results).
 *     • MUST be deterministic for a given (affiliateId, db) snapshot, so a
 *       balance read is reproducible and safe to run inside a payout transaction.
 *   The `db` handle is passed ONLY so a provider can read within the caller's
 *   transaction; using it to write is a contract violation. Deductions (e.g.
 *   pending/paid payouts) are returned as NEGATIVE components.
 *
 * ── PRIORITY / ORDER (refinement #1) ──────────────────────────────────────────
 *   Providers execute in ascending `priority`, ties broken by registration order
 *   (stable). Because components are summed, order does not change the total —
 *   but a deterministic order makes logs and any future ordered concerns
 *   reproducible.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { composeBalance, toDecimal } from './composeBalance.js';

export const DEFAULT_PROVIDER_PRIORITY = 100;

/**
 * DEFAULT BALANCE PROVIDER EXECUTION ORDER (documented for consistent future
 * integration). Providers run in ascending priority; these are the standard
 * sources and their priorities. New providers should slot into the gaps (e.g.
 * a new earning source at 50, a new deduction at 35) and MUST keep to the
 * convention: earnings before deductions, then any experimental sources last.
 *
 *   priority  source                 sign  meaning
 *   ────────  ─────────────────────  ────  ─────────────────────────────────────
 *     10      referral_commission     +    Σ delivered AffiliateOrder.commissionAmount
 *     20      referral_bonus          +    Affiliate.bonusBalance (team bonus)
 *     30      payout_deduction        −    Σ paid AffiliatePayout.amount
 *     40      ugc_earning             +    Σ available UgcEarning.amount
 *   (50+)     future sources          ±    register with a priority in a free gap
 *
 * Order does not change the total (components are summed) — it exists for
 * deterministic, reproducible composition and logging.
 */
export const BALANCE_PRIORITY = Object.freeze({
  REFERRAL_COMMISSION: 10,
  REFERRAL_BONUS:      20,
  PAYOUT_DEDUCTION:    30,
  UGC_EARNING:         40,
});

// source → { provider, priority, seq } (Map preserves insertion for stable ties).
const _registry = new Map();
let _seq = 0;

/** Register (or replace) a provider by its `source`. */
export function registerBalanceProvider(provider, registry = _registry) {
  if (!provider || typeof provider.source !== 'string' || !provider.source.trim()) {
    throw Object.assign(new Error('provider.source (non-empty string) is required'), { code: 'BAL_BAD_PROVIDER' });
  }
  if (typeof provider.compute !== 'function') {
    throw Object.assign(new Error('provider.compute (function) is required'), { code: 'BAL_BAD_PROVIDER' });
  }
  const priority = Number.isFinite(provider.priority) ? provider.priority : DEFAULT_PROVIDER_PRIORITY;
  // Preserve original seq when replacing the same source so order stays stable.
  const existing = registry.get(provider.source);
  const seq = existing ? existing.seq : _seq++;
  registry.set(provider.source, { provider, priority, seq });
  return provider;
}

/** Registered providers in deterministic execution order (priority asc, then registration order). */
export function getBalanceProviders(registry = _registry) {
  return [...registry.values()]
    .sort((a, b) => (a.priority - b.priority) || (a.seq - b.seq))
    .map((e) => e.provider);
}

/** Test/isolation helper — clear the registry. */
export function clearBalanceProviders(registry = _registry) {
  registry.clear();
}

/**
 * Run every registered provider (in order) for one affiliate and compose the
 * balance. A provider that throws propagates — the money path fails closed rather
 * than silently dropping a component. Returns a Decimal.
 *
 * @param {string} affiliateId
 * @param {*} db  Prisma client or transaction handle (READ-ONLY for providers)
 * @param {Map} [registry]
 * @returns {Promise<import('./composeBalance.js').Decimal>}
 */
export async function computeRegisteredBalance(affiliateId, db, registry = _registry) {
  const providers = getBalanceProviders(registry);        // deterministic order
  // Providers are pure & read-only (see contract), so concurrent dispatch has no
  // observable ordering effect — we keep the existing parallel-query performance
  // and compose the SUM in the deterministic provider order, so the result is
  // fully reproducible regardless of which query resolves first.
  const amounts = await Promise.all(providers.map((p) => p.compute(affiliateId, db)));
  const components = providers.map((p, i) => ({ source: p.source, amount: toDecimal(amounts[i]) }));
  return composeBalance(components);
}
