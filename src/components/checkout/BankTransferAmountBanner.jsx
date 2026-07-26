"use client";

/**
 * src/components/checkout/BankTransferAmountBanner.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The black "amount" banner shared by /checkout/confirm and the affiliate
 * "Dépôt de garantie" page. Presentational only — the caller supplies the label
 * and the value node (a formatted price on checkout, an editable input on the
 * deposit page), plus an optional footer. Markup/classes are the single source
 * of truth so both surfaces stay pixel-identical.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default function BankTransferAmountBanner({ label, value, footer = null }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-5 text-white text-center shadow-lg shadow-gray-900/20">
      <p className="text-xs font-medium opacity-60 mb-1">{label}</p>
      <div className="text-4xl font-black">{value}</div>
      {footer}
    </div>
  );
}
