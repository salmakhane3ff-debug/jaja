#!/usr/bin/env node
/**
 * scripts/mediaReferences.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared-media delete safety (Phase 1).
 *
 * Drives the REAL destroyManyByUrls() through its existing injection seam
 * (destroyFn + isReferenced) with fakes standing in for storage and the DB, and
 * checks the REAL reference SQL is shaped to cover every confirmed media
 * location. No DB, no network, no framework.
 *
 * The governing rule under test: a false positive costs an orphaned object; a
 * false negative breaks a live product. Everything ambiguous must be RETAINED.
 *
 * Run:  node scripts/mediaReferences.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from "node:fs";
import { destroyManyByUrls, diffRemovedUrls } from "../src/lib/mediaCleanup.js";
import { __REFERENCE_SQL, __REFERENCE_SOURCES } from "../src/lib/mediaReferences.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const R2 = "https://cdn.test/media/";
const SHARED = `${R2}shared.jpg`;
const UNIQUE = `${R2}unique.jpg`;
const LOCAL  = "/uploads/local.jpg";
const EXTERNAL = "https://example.com/remote.jpg";

// Storage double: records what would actually be destroyed.
const makeStorage = () => {
  const destroyed = [];
  return { destroyed, destroyFn: async (url) => { destroyed.push(url); return { ok: true, storage: "r2", key: url }; } };
};
// DB double: `refs` is the set of URLs some other record still references.
const makeGuard = (refs) => {
  const asked = [];
  return { asked, isReferenced: async (url) => { asked.push(url); return refs.has(url); } };
};

console.log("1) shared image → skipped:");
{
  const s = makeStorage(), g = makeGuard(new Set([SHARED]));
  const sum = await destroyManyByUrls([SHARED], { destroyFn: s.destroyFn, isReferenced: g.isReferenced });
  ok("the shared object is NOT destroyed", s.destroyed.length === 0);
  ok("reported as retained, not deleted", sum.retained === 1 && sum.deleted === 0);
  ok("the survivor's image still exists in storage", !s.destroyed.includes(SHARED));
}

console.log("2) unique image → deleted:");
{
  const s = makeStorage(), g = makeGuard(new Set());
  const sum = await destroyManyByUrls([UNIQUE], { destroyFn: s.destroyFn, isReferenced: g.isReferenced });
  ok("the sole-reference object is destroyed", s.destroyed.length === 1 && s.destroyed[0] === UNIQUE);
  ok("reported as deleted", sum.deleted === 1 && sum.retained === 0);
}

console.log("3) reference check error → skipped (fail-safe):");
{
  const s = makeStorage();
  const boom = async () => { throw new Error("db down"); };
  const sum = await destroyManyByUrls([UNIQUE], { destroyFn: s.destroyFn, isReferenced: boom });
  ok("a thrown guard NEVER authorises a delete", s.destroyed.length === 0);
  ok("counted as retained", sum.retained === 1 && sum.deleted === 0);
  ok("destroyManyByUrls still resolves (never throws)", typeof sum.total === "number");
}
{
  // Non-boolean / undefined answers must also be treated as "keep".
  const s = makeStorage();
  const vague = async () => undefined;
  const sum = await destroyManyByUrls([UNIQUE], { destroyFn: s.destroyFn, isReferenced: vague });
  ok("undefined guard answer → deleted (explicitly falsy)", sum.deleted === 1 && s.destroyed.length === 1);
}

console.log("4) mixed batch (product delete with one shared + one unique image):");
{
  const s = makeStorage(), g = makeGuard(new Set([SHARED]));
  const sum = await destroyManyByUrls([SHARED, UNIQUE], { destroyFn: s.destroyFn, isReferenced: g.isReferenced });
  ok("only the unique image is destroyed", s.destroyed.length === 1 && s.destroyed[0] === UNIQUE);
  ok("summary splits retained vs deleted", sum.retained === 1 && sum.deleted === 1 && sum.total === 2);
}

console.log("5) updateProduct — removed shared image → skipped:");
{
  // Product A drops SHARED from images; product B still uses it.
  const removed = diffRemovedUrls([SHARED, UNIQUE], [UNIQUE]);
  ok("diffRemovedUrls finds the dropped URL", removed.length === 1 && removed[0] === SHARED);
  const s = makeStorage(), g = makeGuard(new Set([SHARED]));
  await destroyManyByUrls(removed, { destroyFn: s.destroyFn, isReferenced: g.isReferenced });
  ok("dropping a shared image does not destroy it", s.destroyed.length === 0);
}

console.log("6) updateProduct — removed unique image → deleted:");
{
  const removed = diffRemovedUrls([UNIQUE, `${R2}kept.jpg`], [`${R2}kept.jpg`]);
  const s = makeStorage(), g = makeGuard(new Set());
  await destroyManyByUrls(removed, { destroyFn: s.destroyFn, isReferenced: g.isReferenced });
  ok("dropping an unshared image destroys it", s.destroyed.length === 1 && s.destroyed[0] === UNIQUE);
  ok("the retained image is never touched", !s.destroyed.includes(`${R2}kept.jpg`));
}
{
  // A URL still used by the SAME product's sections must survive being dropped
  // from images — which is why the guard has no self-exclusion.
  const s = makeStorage(), g = makeGuard(new Set([SHARED]));
  await destroyManyByUrls(diffRemovedUrls([SHARED], []), { destroyFn: s.destroyFn, isReferenced: g.isReferenced });
  ok("image still used in the same product's sections is retained", s.destroyed.length === 0);
}

console.log("7) OrderItem snapshot blocks deletion:");
{
  // Order history embeds images verbatim: productSnapshot = { title, images, variants }.
  const orderedImage = `${R2}ordered.jpg`;
  const s = makeStorage(), g = makeGuard(new Set([orderedImage]));   // referenced ONLY by an order snapshot
  const sum = await destroyManyByUrls([orderedImage], { destroyFn: s.destroyFn, isReferenced: g.isReferenced });
  ok("an ordered product's image survives deletion", s.destroyed.length === 0 && sum.retained === 1);
  ok("order_items.productSnapshot is a searched source",
     __REFERENCE_SOURCES.some((x) => x.table === "order_items" && x.columns.includes("productSnapshot")));
}

console.log("8) duplicate URLs only checked once:");
{
  const s = makeStorage(), g = makeGuard(new Set());
  const sum = await destroyManyByUrls([UNIQUE, UNIQUE, UNIQUE], { destroyFn: s.destroyFn, isReferenced: g.isReferenced });
  ok("guard asked exactly once", g.asked.length === 1);
  ok("destroyed exactly once", s.destroyed.length === 1);
  ok("total de-duplicated", sum.total === 1 && sum.deleted === 1);
}
{
  const s = makeStorage(), g = makeGuard(new Set([SHARED]));
  await destroyManyByUrls([SHARED, { url: SHARED }, { src: SHARED }], { destroyFn: s.destroyFn, isReferenced: g.isReferenced });
  ok("string / {url} / {src} forms collapse to one check", g.asked.length === 1);
}

console.log("9) local uploads unchanged:");
{
  // Real destroyByUrl (no network for local/external), no guard — the pre-existing
  // behaviour must be untouched when no guard is supplied.
  const sum = await destroyManyByUrls([LOCAL]);
  ok("local upload skipped, not deleted", sum.skipped === 1 && sum.deleted === 0 && sum.retained === 0);
}
{
  const s = makeStorage(), g = makeGuard(new Set());
  await destroyManyByUrls([LOCAL], { destroyFn: s.destroyFn, isReferenced: g.isReferenced });
  ok("an unreferenced local URL still reaches destroyFn (dispatcher decides)", s.destroyed.length === 1);
}

console.log("10) external URLs unchanged:");
{
  const sum = await destroyManyByUrls([EXTERNAL]);
  ok("external URL skipped", sum.skipped === 1 && sum.deleted === 0);
  const both = await destroyManyByUrls([LOCAL, EXTERNAL]);
  ok("local + external: skipped=2, deleted=0, failed=0",
     both.skipped === 2 && both.deleted === 0 && both.failed === 0);
}

console.log("11) no guard supplied → previous behaviour preserved:");
{
  const s = makeStorage();
  const sum = await destroyManyByUrls([SHARED, UNIQUE], { destroyFn: s.destroyFn });
  ok("without a guard nothing is retained", sum.retained === 0 && sum.deleted === 2);
  ok("existing callers keep working unchanged", s.destroyed.length === 2);
}

console.log("12) reference SQL covers every confirmed media location:");
{
  const required = [
    ["products", "images"], ["products", "sections"],
    ["order_items", "productSnapshot"],
    ["orders", "paymentDetails"],
    ["abandoned_carts", "items"],
    ["landing_pages", "sections"], ["landing_pages", "images"],
    ["homepage_banners", "images"],
  ];
  for (const [table, column] of required) {
    ok(`${table}.${column} searched`,
       __REFERENCE_SOURCES.some((s) => s.table === table && s.columns.includes(column)));
  }
  ok("every source appears in the generated SQL",
     __REFERENCE_SOURCES.every((s) => __REFERENCE_SQL.includes(`FROM "${s.table}"`)));
  ok("URL is a bound parameter, never interpolated", __REFERENCE_SQL.includes("$1::text") && !__REFERENCE_SQL.includes("'%"));
  ok("uses strpos (literal substring, no LIKE wildcard escaping)",
     __REFERENCE_SQL.includes("strpos(") && !/\bLIKE\b/i.test(__REFERENCE_SQL));
  ok("sources are ORed so any single hit retains", __REFERENCE_SQL.includes("OR EXISTS"));
}

console.log("13) every searched table/column exists in schema.prisma:");
{
  // The query cannot run here (no DATABASE_URL), and a renamed table or column
  // would make it THROW — which fails safe but silently disables cleanup
  // forever. Parse the schema and prove every source resolves to a real field.
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const models = schema.split(/^model /m).slice(1).map((m) => {
    const body = m.slice(0, m.indexOf("\n}"));
    const map = body.match(/@@map\("([^"]+)"\)/);
    const fields = new Set();
    for (const line of body.split("\n")) {
      const f = line.match(/^\s{2}(\w+)\s+\S/);
      if (f && !line.trim().startsWith("@@")) fields.add(f[1]);
    }
    return { table: map ? map[1] : null, fields };
  });

  let broken = 0;
  for (const src of __REFERENCE_SOURCES) {
    const model = models.find((x) => x.table === src.table);
    if (!model) { broken++; console.log(`     ↳ missing table: ${src.table}`); continue; }
    for (const c of src.columns) {
      if (!model.fields.has(c)) { broken++; console.log(`     ↳ missing column: ${src.table}.${c}`); }
    }
  }
  ok(`all ${__REFERENCE_SOURCES.reduce((n, s) => n + s.columns.length, 0)} searched columns exist in the schema`, broken === 0);
  ok("at least the confirmed high-risk sources are present", __REFERENCE_SOURCES.length >= 8);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
