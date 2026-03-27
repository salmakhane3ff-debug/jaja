"use client";

import { useEffect, useState, useCallback } from "react";

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
export function useDiscountRules() {
  const [rules, setRules] = useState([]);

  useEffect(() => {
    fetch("/api/setting?type=discount_rules", { cache: "no-store" })
      .then(r => r.ok ? r.json() : {})
      .then(d => setRules(Array.isArray(d?.rules) ? d.rules : []))
      .catch(() => setRules([]));
  }, []);

  const getDiscount = useCallback(
    (product) => applyDiscountRules(product, rules),
    [rules]
  );

  return { rules, getDiscount };
}
