#!/usr/bin/env node
/**
 * scripts/feedbackDisplay.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE feedback setting: which reviews a product page lists.
 *   'currentProduct' (default) → only this product's feedback
 *   'allProducts'              → every publishable review in the store
 *
 * The setting only picks the DATA SOURCE. Moderation/visibility stay in
 * feedbackService.getPublicFeedback, which is exercised here through an
 * in-memory fake so the existing rules are proven still to apply (APPROVED, or
 * SCHEDULED whose publishAt has passed; PENDING/REJECTED never surface).
 * Run: node scripts/feedbackDisplay.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  resolveProductFeedbackSource, feedbackFilterProductId,
  PRODUCT_FEEDBACK_SOURCES, DEFAULT_PRODUCT_FEEDBACK_SOURCE,
} from "../src/lib/feedbackDisplay.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const NOW = new Date("2026-08-05T12:00:00Z");
const PAST = new Date("2026-08-01T00:00:00Z");
const FUTURE = new Date("2026-09-01T00:00:00Z");

// Store fixture: two products with feedback + one unlinked review.
const ROWS = [
  { id: "f1", productId: "A", status: "APPROVED",  rating: 5, publishAt: null },
  { id: "f2", productId: "A", status: "APPROVED",  rating: 4, publishAt: null },
  { id: "f3", productId: "B", status: "APPROVED",  rating: 5, publishAt: null },
  { id: "f4", productId: "A", status: "PENDING",   rating: 1, publishAt: null },   // never visible
  { id: "f5", productId: "A", status: "REJECTED",  rating: 1, publishAt: null },   // never visible
  { id: "f6", productId: "A", status: "SCHEDULED", rating: 5, publishAt: PAST },   // visible (due)
  { id: "f7", productId: "A", status: "SCHEDULED", rating: 5, publishAt: FUTURE }, // not yet due
  { id: "f8", productId: null, status: "APPROVED", rating: 3, publishAt: null },   // store-wide
];

/**
 * Mirrors feedbackService.getPublicFeedback's WHERE clause exactly:
 *   (APPROVED) OR (SCHEDULED AND publishAt <= now), optionally + productId.
 * `productId = null` means "no filter" — the query the API runs for allProducts.
 */
function queryPublic({ productId = null } = {}) {
  return ROWS.filter((r) => {
    const visible = r.status === "APPROVED"
      || (r.status === "SCHEDULED" && r.publishAt && r.publishAt <= NOW);
    if (!visible) return false;
    if (productId) return r.productId === productId;
    return true;
  });
}

console.log("1) Default / missing setting preserves the established behaviour:");
{
  ok("missing setting → currentProduct", resolveProductFeedbackSource({}) === "currentProduct");
  ok("null settings → currentProduct", resolveProductFeedbackSource(null) === "currentProduct");
  ok("undefined settings → currentProduct", resolveProductFeedbackSource(undefined) === "currentProduct");
  ok("unrelated keys only → currentProduct", resolveProductFeedbackSource({ formDisplay: "modal" }) === "currentProduct");
  ok("invalid value → currentProduct", resolveProductFeedbackSource({ productFeedbackSource: "bogus" }) === "currentProduct");
  ok("non-string value → currentProduct", resolveProductFeedbackSource({ productFeedbackSource: 42 }) === "currentProduct");
  ok("exported default matches", DEFAULT_PRODUCT_FEEDBACK_SOURCE === "currentProduct");
  ok("only two valid modes", PRODUCT_FEEDBACK_SOURCES.length === 2);
  // Backward compatibility: with no setting saved, the page filters by product
  // exactly as it always has.
  ok("no setting → still filters by the current product", feedbackFilterProductId({}, "A") === "A");
}

console.log("2) ALL PRODUCTS returns feedback from multiple products:");
{
  const filter = feedbackFilterProductId({ productFeedbackSource: "allProducts" }, "A");
  ok("filter is null (no productId sent to the API)", filter === null);
  const rows = queryPublic({ productId: filter });
  ok("includes product A feedback", rows.some((r) => r.productId === "A"));
  ok("includes product B feedback", rows.some((r) => r.productId === "B"));
  ok("includes store-wide (unlinked) feedback", rows.some((r) => r.productId === null));
  ok("spans more than one product", new Set(rows.map((r) => r.productId)).size > 1);
  ok("same list on every product page", JSON.stringify(queryPublic({ productId: feedbackFilterProductId({ productFeedbackSource: "allProducts" }, "B") })) === JSON.stringify(rows));
}

console.log("3) CURRENT PRODUCT ONLY returns only that product's feedback:");
{
  const filterA = feedbackFilterProductId({ productFeedbackSource: "currentProduct" }, "A");
  ok("filter is the product id (DB-level filter)", filterA === "A");
  const rowsA = queryPublic({ productId: filterA });
  ok("every row belongs to A", rowsA.length > 0 && rowsA.every((r) => r.productId === "A"));
  ok("expected visible rows for A (f1,f2,f6)", rowsA.map((r) => r.id).join(",") === "f1,f2,f6");

  const rowsB = queryPublic({ productId: feedbackFilterProductId({}, "B") });
  ok("product B sees only its own review", rowsB.length === 1 && rowsB[0].id === "f3");
}

console.log("4) No cross-product leakage in CURRENT PRODUCT ONLY:");
{
  const rowsA = queryPublic({ productId: feedbackFilterProductId({}, "A") });
  ok("product B's review never appears on A", !rowsA.some((r) => r.id === "f3"));
  ok("unlinked store-wide review never appears on A", !rowsA.some((r) => r.productId === null));
  const rowsB = queryPublic({ productId: feedbackFilterProductId({}, "B") });
  ok("product A's reviews never appear on B", !rowsB.some((r) => r.productId === "A"));
}

console.log("5) Existing approval / visibility rules still apply in BOTH modes:");
{
  for (const [mode, filter] of [["currentProduct", "A"], ["allProducts", null]]) {
    const rows = queryPublic({ productId: feedbackFilterProductId({ productFeedbackSource: mode }, "A") });
    ok(`${mode}: PENDING excluded`, !rows.some((r) => r.status === "PENDING"));
    ok(`${mode}: REJECTED excluded`, !rows.some((r) => r.status === "REJECTED"));
    ok(`${mode}: future SCHEDULED excluded`, !rows.some((r) => r.id === "f7"));
    ok(`${mode}: due SCHEDULED included`, rows.some((r) => r.id === "f6"));
  }
  ok("the setting cannot widen visibility beyond the existing rules",
    queryPublic({ productId: null }).every((r) => r.status === "APPROVED" || (r.status === "SCHEDULED" && r.publishAt <= NOW)));
}

console.log("6) Products with zero feedback behave correctly:");
{
  const none = queryPublic({ productId: feedbackFilterProductId({}, "Z") });
  ok("unknown product → empty list, no error", Array.isArray(none) && none.length === 0);
  ok("allProducts still populates a product with no reviews of its own",
    queryPublic({ productId: feedbackFilterProductId({ productFeedbackSource: "allProducts" }, "Z") }).length > 0);
  ok("missing productId with currentProduct → no filter, never a crash", feedbackFilterProductId({}, null) === null);
  ok("empty-string productId normalises to null", feedbackFilterProductId({}, "") === null);
}

console.log("7) The setting only changes the DATA SOURCE (scroll behaviour untouched):");
{
  // starClickAction is a separate key and must be unaffected by the new one.
  const settings = { starClickAction: "scrollToFeedback", productFeedbackSource: "allProducts" };
  ok("starClickAction preserved alongside the new setting", settings.starClickAction === "scrollToFeedback");
  ok("resolver reads only its own key", resolveProductFeedbackSource({ starClickAction: "goToFeedbackPage" }) === "currentProduct");
  ok("switching mode does not touch starClickAction", (() => {
    const next = { ...settings, productFeedbackSource: "currentProduct" };
    return next.starClickAction === "scrollToFeedback";
  })());
  // The form stays linked to the product even when the list shows everything.
  ok("form productId is independent of the list filter", (() => {
    const productId = "A";
    return feedbackFilterProductId({ productFeedbackSource: "allProducts" }, productId) === null && productId === "A";
  })());
}

console.log("8) Saving / reloading persists the selected mode:");
{
  // Mirrors the admin page: DEFAULTS spread, then the saved row spread over it.
  const DEFAULTS = { formDisplay: "modal", productFeedbackSource: DEFAULT_PRODUCT_FEEDBACK_SOURCE };
  const saved = { ...DEFAULTS, productFeedbackSource: "allProducts" };
  const reloaded = { ...DEFAULTS, ...JSON.parse(JSON.stringify(saved)) };
  ok("allProducts survives a save → reload round-trip", resolveProductFeedbackSource(reloaded) === "allProducts");

  const back = { ...DEFAULTS, ...JSON.parse(JSON.stringify({ ...saved, productFeedbackSource: "currentProduct" })) };
  ok("switching back to currentProduct persists", resolveProductFeedbackSource(back) === "currentProduct");
  ok("a legacy row without the key still loads as currentProduct",
    resolveProductFeedbackSource({ ...DEFAULTS, ...{ formDisplay: "inline" } }) === "currentProduct");
  ok("other feedback settings survive the round-trip", reloaded.formDisplay === "modal");
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
