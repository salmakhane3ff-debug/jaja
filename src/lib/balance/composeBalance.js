/**
 * src/lib/balance/composeBalance.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Balance composition primitive. The affiliate balance is the sum of independent
 * "balance components", each produced by a provider (referral earnings, referral
 * bonus, payouts as a deduction, UGC earnings, …future sources). Providers are
 * DB-bound and live in their own services; THIS module only composes their
 * results, exactly (Prisma.Decimal), and serializes at the final boundary.
 *
 * Design goal (refinement #1): getAffiliateBalance stays a thin orchestration
 * layer — it asks each provider for a signed Decimal component and calls
 * composeBalance(). Adding a future earning source = adding a provider, with no
 * change to the arithmetic here.
 *
 * MONEY: everything stays Prisma.Decimal from provider output through the sum;
 * the ONLY Decimal→Number conversion is serializeAmount() at the response edge.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Prisma } from '../../generated/prisma/index.js';

export const Decimal = Prisma.Decimal;

/** Coerce a value to Decimal safely (number | string | Decimal | null → Decimal). */
export function toDecimal(v) {
  if (v instanceof Decimal) return v;
  if (v === null || v === undefined || v === '') return new Decimal(0);
  try {
    const d = new Decimal(v);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

/**
 * Sum signed balance components exactly. Deductions (e.g. payouts) are negative
 * components. Returns a Decimal rounded HALF_UP to 2 places.
 * @param {{source:string, amount: any}[]} components
 * @returns {Decimal}
 */
export function composeBalance(components) {
  let total = new Decimal(0);
  for (const c of components || []) {
    total = total.plus(toDecimal(c && c.amount));
  }
  return total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Final serialization boundary: Decimal → JS number with 2dp (for JSON responses). */
export function serializeAmount(value) {
  const d = value instanceof Decimal ? value : toDecimal(value);
  return Number(d.toFixed(2));
}
