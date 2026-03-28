"use client";

import { useCallback } from "react";
import { useSetting } from "@/context/SettingsContext";

// ── Apply a rule set to one product ──────────────────────────────────────────
// Returns { effectivePrice, originalPrice, percentage, label } or null.
export function applyDiscountRules(product, rules) {
  if (!Array.isArray(rules) || rules.length === 0) return null;

  const active = rules.filter(r => r.active && Number(r.percentage) > 0);
  if (!active.length) return null;

  // Collection-specific rule takes priority over "all"
  let rule = active.find(r =>
    r.scope === "collection" &&
    r.collectionTitle &&
    Array.isArray(product.collections) &&
    product.collections.some(c =>
      String(c).toLowerCase() === r.collectionTitle.toLowerCase()
    )
  );
  if (!rule) rule = active.find(r => r.scope === "all");
  if (!rule) return null;

  // Use regularPrice if set, otherwise fall back to salePrice
  const regularPrice = Number(product.regularPrice) || 0;
  const salePrice    = Number(product.salePrice)    || 0;
  const base         = regularPrice > 0 ? regularPrice : salePrice;
  if (base <= 0) return null;

  const rulePrice = Math.round(base * (1 - Number(rule.percentage) / 100));

  // If product already has a better effective sale price, skip
  if (regularPrice > 0 && salePrice > 0 && salePrice <= rulePrice) return null;

  return {
    effectivePrice: rulePrice,
    originalPrice:  base,
    percentage:     Number(rule.percentage),
    label:          rule.label || `${rule.percentage}%`,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────
// Reads discount rules from the shared SettingsContext — no duplicate fetches.
export function useDiscountRules() {
  const { data } = useSetting("discount_rules");
  const rules = Array.isArray(data?.rules) ? data.rules : [];

  const getDiscount = useCallback(
    (product) => applyDiscountRules(product, rules),
    [rules]
  );

  return { rules, getDiscount };
}
