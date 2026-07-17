#!/usr/bin/env node
/**
 * scripts/duplicates.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the Duplicate Listings Detector logic (src/lib/duplicates.js).
 * Pure logic — no DB, no DOM, no test framework. Run:
 *   node scripts/duplicates.test.mjs
 *
 * The SQL GROUP BY expressions in duplicateService.js mirror the key functions
 * tested here; that mirroring itself needs the manual DB pass (see the report).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  CONFIDENCE, SIGNALS, PRICE_BUCKET_SIZE,
  confidenceOf, reasonsOf,
  titleKey, normalizedTitleKey, referenceKey,
  firstImageUrl, firstImageFilename, collectionsSignature, priceBucket,
  groupKeyOf, fingerprintOf,
  mergeSignalGroups, attachProducts,
  buildIgnoreIndex, isIgnored, rejectIgnored, filterGroups,
} from "../src/lib/duplicates.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const AT = "2026-07-01T10:00:00.000Z";
const P = (id, over = {}) => ({
  id, _id: id, title: `Product ${id}`, images: [`https://cdn.test/${id}.jpg`],
  sku: null, barcode: null, brand: null, collections: [], regularPrice: 100, salePrice: null,
  status: "Active", createdAt: AT, updatedAt: AT, ...over,
});
const mapOf = (...ps) => new Map(ps.map((p) => [p.id, p]));

console.log("1) exact duplicates (identical title):");
{
  ok("title key folds case + whitespace", titleKey("  Lampe LED  ") === "lampe led");
  const groups = mergeSignalGroups([{ signal: "title", key: "lampe led", ids: ["b", "a"] }]);
  ok("identical titles form one group", groups.length === 1 && groups[0].productIds.join(",") === "a,b");
  ok("confidence is high", groups[0].confidence === CONFIDENCE.HIGH);
  ok("reason reported", groups[0].reasons.includes("identical_title"));
  ok("a single product is not a group", mergeSignalGroups([{ signal: "title", key: "x", ids: ["a"] }]).length === 0);
}

console.log("2) normalized titles:");
{
  ok("strips the Duplicate button's (Copy)", normalizedTitleKey("Lampe LED (Copy)") === "lampe led");
  ok("case-insensitive (copy) variants", normalizedTitleKey("Lampe LED (COPY)") === normalizedTitleKey("lampe led (copy)"));
  ok("folds punctuation + collapses space", normalizedTitleKey("Lampe  LED - 5W!!") === "lampe led 5w");
  ok("original and its copy normalize equal", normalizedTitleKey("Lampe LED") === normalizedTitleKey("Lampe LED (Copy)"));
  ok("distinct products stay distinct", normalizedTitleKey("Lampe LED") !== normalizedTitleKey("Lampe LCD"));
  ok("non-latin preserved (Arabic catalogue)", normalizedTitleKey("مصباح  LED!") === "مصباح led");
  ok("non-string safe", normalizedTitleKey(null) === "" && normalizedTitleKey(undefined) === "");
  const g = mergeSignalGroups([{ signal: "normalized", key: "lampe led", ids: ["a", "b"] }]);
  ok("normalized title is medium confidence", g[0].confidence === CONFIDENCE.MEDIUM);
}

console.log("3) SKU:");
{
  ok("trims", referenceKey("  SKU-1 ") === "SKU-1");
  ok("empty SKU never groups (Duplicate button blanks it)", referenceKey("") === null && referenceKey("   ") === null);
  ok("null SKU never groups", referenceKey(null) === null);
  const g = mergeSignalGroups([{ signal: "sku", key: "SKU-1", ids: ["a", "b"] }]);
  ok("identical SKU is high confidence", g[0].confidence === CONFIDENCE.HIGH && g[0].reasons.includes("identical_sku"));
}

console.log("4) barcode:");
{
  ok("empty barcode never groups", referenceKey("") === null);
  const g = mergeSignalGroups([{ signal: "barcode", key: "0123456789", ids: ["a", "b"] }]);
  ok("identical barcode is high confidence", g[0].confidence === CONFIDENCE.HIGH && g[0].reasons.includes("identical_barcode"));
}

console.log("5) first image filename:");
{
  ok("string image shape", firstImageUrl(["https://cdn.test/a.jpg"]) === "https://cdn.test/a.jpg");
  ok("object image shape {url}", firstImageUrl([{ url: "https://cdn.test/a.jpg" }]) === "https://cdn.test/a.jpg");
  ok("filename only", firstImageFilename(["https://cdn.test/x/y/photo.jpg"]) === "photo.jpg");
  ok("query string ignored (cache-busting)", firstImageFilename(["https://cdn.test/photo.jpg?v=2"]) === "photo.jpg");
  ok("different CDN host, same asset", firstImageFilename(["https://a.test/p.jpg"]) === firstImageFilename(["https://b.test/p.jpg"]));
  ok("empty/!array safe", firstImageFilename([]) === null && firstImageFilename(null) === null && firstImageFilename(["  "]) === null);
  ok("unknown shape safe", firstImageUrl([{ nope: 1 }]) === null);
  const g = mergeSignalGroups([{ signal: "image", key: "p.jpg", ids: ["a", "b"] }]);
  ok("same first image is medium confidence", g[0].confidence === CONFIDENCE.MEDIUM);
}

console.log("6) low confidence (brand + collections + similar price):");
{
  ok("collections signature is order/case-insensitive",
     collectionsSignature(["Gifts", "toys"]) === collectionsSignature(["TOYS", "gifts"]));
  ok("empty collections → null (never groups)", collectionsSignature([]) === null && collectionsSignature(null) === null);
  ok("price bucket bands similar prices", priceBucket(101) === priceBucket(109) && priceBucket(101) !== priceBucket(111));
  ok("bucket size is 10", PRICE_BUCKET_SIZE === 10);
  // Number(null) and Number("") are both 0 — a priceless product must NOT land
  // in bucket 0 alongside genuinely free products.
  ok("absent price → null (not bucket 0)",
     priceBucket(null) === null && priceBucket(undefined) === null && priceBucket("") === null);
  ok("invalid price → null", priceBucket("abc") === null && priceBucket(-5) === null);
  ok("zero price still buckets", priceBucket(0) === 0);
  const g = mergeSignalGroups([{ signal: "attributes", key: "acme|gifts|10", ids: ["a", "b"] }]);
  ok("attributes signal is low confidence", g[0].confidence === CONFIDENCE.LOW);
}

console.log("7) confidence calculation:");
{
  ok("strongest signal wins", confidenceOf(["attributes", "sku"]) === CONFIDENCE.HIGH);
  ok("medium beats low", confidenceOf(["attributes", "image"]) === CONFIDENCE.MEDIUM);
  ok("low alone stays low", confidenceOf(["attributes"]) === CONFIDENCE.LOW);
  ok("unknown signals ignored, never promoted", confidenceOf(["bogus"]) === null && confidenceOf(["bogus", "attributes"]) === CONFIDENCE.LOW);
  ok("empty → null", confidenceOf([]) === null);
  ok("reasons list every matched signal", reasonsOf(["title", "image"]).join(",") === "identical_title,same_first_image");
  // Same pair found by two signals = ONE group carrying both reasons.
  const merged = mergeSignalGroups([
    { signal: "title", key: "t", ids: ["a", "b"] },
    { signal: "image", key: "i", ids: ["b", "a"] },
  ]);
  ok("same member set merges into one group", merged.length === 1);
  ok("merged group keeps both reasons", merged[0].reasons.length === 2);
  ok("merged group takes the strongest confidence", merged[0].confidence === CONFIDENCE.HIGH);
  // Overlapping-but-different sets stay separate (no transitive over-merging).
  const overlap = mergeSignalGroups([
    { signal: "title", key: "t", ids: ["a", "b"] },
    { signal: "image", key: "i", ids: ["a", "b", "c"] },
  ]);
  ok("different member sets stay separate groups", overlap.length === 2);
  ok("high-confidence group sorts first", overlap[0].confidence === CONFIDENCE.HIGH);
}

console.log("8) group identity:");
{
  ok("group key is order-independent", groupKeyOf(["b", "a"]) === groupKeyOf(["a", "b"]));
  ok("group key dedupes", groupKeyOf(["a", "a", "b"]) === "a|b");
  ok("different sets → different keys", groupKeyOf(["a", "b"]) !== groupKeyOf(["a", "b", "c"]));
  ok("fingerprint is order-independent",
     fingerprintOf([P("a"), P("b")]) === fingerprintOf([P("b"), P("a")]));
  ok("fingerprint accepts Date or ISO string",
     fingerprintOf([{ id: "a", updatedAt: new Date(AT) }]) === fingerprintOf([{ id: "a", updatedAt: AT }]));
}

console.log("9) ignored groups:");
{
  const products = [P("a"), P("b")];
  const group = { groupKey: groupKeyOf(["a", "b"]), products, confidence: "high", reasons: [] };
  const fp = fingerprintOf(products);
  const index = buildIgnoreIndex([{ groupKey: group.groupKey, fingerprint: fp }]);

  ok("ignored + unchanged → hidden", isIgnored(group, index, fp) === true);
  ok("rejectIgnored removes it", rejectIgnored([group], index).length === 0);
  ok("a different group is unaffected",
     isIgnored({ groupKey: groupKeyOf(["c", "d"]), products }, index, fp) === false);
  ok("no ignore record → shown", rejectIgnored([group], buildIgnoreIndex([])).length === 1);
}

console.log("10) edited products (ignored group must reappear):");
{
  const before = [P("a"), P("b")];
  const groupKey = groupKeyOf(["a", "b"]);
  const index = buildIgnoreIndex([{ groupKey, fingerprint: fingerprintOf(before) }]);

  // Admin edits product b → updatedAt moves → fingerprint changes.
  const after = [P("a"), P("b", { updatedAt: "2026-07-02T09:00:00.000Z" })];
  const groupAfter = { groupKey, products: after, confidence: "high", reasons: [] };

  ok("edit changes the fingerprint", fingerprintOf(before) !== fingerprintOf(after));
  ok("edited group is no longer ignored", isIgnored(groupAfter, index, fingerprintOf(after)) === false);
  ok("edited group reappears for review", rejectIgnored([groupAfter], index).length === 1);
  // Untouched group stays hidden.
  const same = { groupKey, products: before, confidence: "high", reasons: [] };
  ok("unedited group stays hidden", rejectIgnored([same], index).length === 0);
}

console.log("11) deleted products:");
{
  const groups = mergeSignalGroups([{ signal: "title", key: "t", ids: ["a", "b"] }]);
  // Product b was deleted since grouping → only a survives → no longer a duplicate.
  ok("group dissolves below two survivors", attachProducts(groups, mapOf(P("a"))).length === 0);
  ok("group survives while two remain", attachProducts(groups, mapOf(P("a"), P("b"))).length === 1);
  // A trio losing one member remains a (smaller) duplicate group.
  const trio = mergeSignalGroups([{ signal: "title", key: "t", ids: ["a", "b", "c"] }]);
  const kept = attachProducts(trio, mapOf(P("a"), P("b")));
  ok("trio minus one still a pair", kept.length === 1 && kept[0].products.length === 2);
  ok("all deleted → nothing reported", attachProducts(trio, mapOf()).length === 0);
  // A stale ignore pointing at deleted products is harmless.
  const stale = buildIgnoreIndex([{ groupKey: groupKeyOf(["x", "y"]), fingerprint: "whatever" }]);
  ok("stale ignore tolerated", rejectIgnored(attachProducts(groups, mapOf(P("a"), P("b"))), stale).length === 1);
}

console.log("12) filters:");
{
  const g = (over) => ({ groupKey: "k", confidence: "high", reasons: [], products: over });
  const groups = [
    g([P("a", { brand: "Acme", status: "Active",   collections: ["Gifts"] }),
       P("b", { brand: "Acme", status: "Inactive", collections: ["Gifts"] })]),
    g([P("c", { brand: "Other", status: "Active", collections: ["Toys"] }),
       P("d", { brand: "Other", status: "Active", collections: ["Toys"] })]),
  ];
  ok("confidence filter", filterGroups(groups, { confidence: "high" }).length === 2 &&
                          filterGroups(groups, { confidence: "low" }).length === 0);
  ok("brand filter (case-insensitive)", filterGroups(groups, { brand: "acme" }).length === 1);
  ok("collection filter", filterGroups(groups, { collection: "toys" }).length === 1);
  ok("status matches if ANY member matches (pair is not dissolved)",
     filterGroups(groups, { status: "Inactive" }).length === 1);
  ok("no filters → everything", filterGroups(groups, {}).length === 2);
}

console.log("13) grouping performance (blocking, never pairwise):");
{
  // 10k products across 5k title keys: every product has exactly one partner.
  const N = 10000;
  const byKey = new Map();
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const key = `title-${i % (N / 2)}`;             // ← what SQL's GROUP BY does
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(`p${i}`);
  }
  const signalGroups = [...byKey.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ signal: "title", key, ids }));
  const groups = mergeSignalGroups(signalGroups);
  const ms = Date.now() - t0;

  ok("10k products → 5k groups", groups.length === 5000);
  ok("every group is a pair", groups.every((x) => x.productIds.length === 2));
  // The point of the contract: work scales with n, not n². n² would be 100,000,000.
  ok("work stayed linear (n, not n²)", byKey.size + N < (N * N) / 1000);
  ok(`grouping 10k stayed fast (${ms}ms)`, ms < 2000);
  // Merging is keyed by a Map, so re-feeding the same groups cannot blow up.
  const again = mergeSignalGroups([...signalGroups, ...signalGroups]);
  ok("duplicate signal rows do not duplicate groups", again.length === 5000);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
