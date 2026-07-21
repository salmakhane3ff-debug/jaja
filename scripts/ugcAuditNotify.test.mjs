#!/usr/bin/env node
/**
 * scripts/ugcAuditNotify.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the UGC settings AUDIT diff (src/lib/ugcSettingsAudit.js) and the
 * event-driven NOTIFICATIONS (src/lib/ugcNotifications.js) — both pure logic
 * plus the non-fatal emitter, driven with fake clients. No DB.
 * Run: node scripts/ugcAuditNotify.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  diffUgcSettings, hasEarningsImpact, describeChange, EARNINGS_AFFECTING_KEYS,
} from "../src/lib/ugcSettingsAudit.js";
import {
  UGC_NOTIFY_EVENT, ADMIN_NOTIFICATION_TYPE, eventForStatus,
  affiliateMessage, adminMessage, emitUgcEvent,
} from "../src/lib/ugcNotifications.js";
import { UGC_DEFAULT_SETTINGS } from "../src/lib/ugcSettings.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };
const base = (over = {}) => ({ ...UGC_DEFAULT_SETTINGS, ...over });

console.log("1) settings diff detects real changes only:");
{
  ok("identical settings → no changes", diffUgcSettings(base(), base()).length === 0);
  ok("type coercion is NOT a change ('4' vs 4)", diffUgcSettings(base({ commissionPerSale: 4 }), base({ commissionPerSale: "4" })).length === 0);
  const d = diffUgcSettings(base({ commissionPerSale: 4 }), base({ commissionPerSale: 6 }));
  ok("value change detected", d.length === 1 && d[0].key === "commissionPerSale");
  ok("carries from/to", d[0].from === 4 && d[0].to === 6);
  const multi = diffUgcSettings(base(), base({ commissionPerSale: 9, minVideoSeconds: 10 }));
  ok("multiple changes detected", multi.length === 2);
  const arr = diffUgcSettings(base({ instructions: ["a"] }), base({ instructions: ["a", "b"] }));
  ok("array (instructions) change detected", arr.length === 1 && arr[0].key === "instructions");
  ok("same array content → no change", diffUgcSettings(base({ instructions: ["a"] }), base({ instructions: ["a"] })).length === 0);
}

console.log("2) earnings-affecting classification:");
{
  const money = diffUgcSettings(base(), base({ commissionPerSale: 99 }));
  ok("commissionPerSale flagged earnings-affecting", money[0].earningsAffecting === true && hasEarningsImpact(money));
  const engine = diffUgcSettings(base(), base({ earningsEngineEnabled: true }));
  ok("earningsEngineEnabled flagged", hasEarningsImpact(engine));
  const bounds = diffUgcSettings(base(), base({ maxGeneratedSales: 50 }));
  ok("generation bounds flagged", hasEarningsImpact(bounds));
  const cosmetic = diffUgcSettings(base(), base({ exampleVideoUrl: "https://x.test/v.mp4" }));
  ok("exampleVideoUrl NOT earnings-affecting", cosmetic.length === 1 && hasEarningsImpact(cosmetic) === false);
  const instr = diffUgcSettings(base(), base({ instructions: ["film in daylight"] }));
  ok("instructions NOT earnings-affecting", hasEarningsImpact(instr) === false);
  const video = diffUgcSettings(base(), base({ maxVideoSeconds: 90 }));
  ok("video limits NOT earnings-affecting", hasEarningsImpact(video) === false);
  ok("estimate-only knobs NOT earnings-affecting", hasEarningsImpact(diffUgcSettings(base(), base({ maxDailyEstimate: 99 }))) === false);
  ok("defaultApprovedStatus IS earnings-affecting", EARNINGS_AFFECTING_KEYS.includes("defaultApprovedStatus"));
  ok("describeChange is readable", describeChange({ key: "commissionPerSale", from: 4, to: 6 }) === "commissionPerSale: 4 → 6");
}

console.log("3) event mapping + messages:");
{
  ok("APPROVED → approved event", eventForStatus("APPROVED") === UGC_NOTIFY_EVENT.APPROVED);
  ok("RUNNING → running event", eventForStatus("RUNNING") === UGC_NOTIFY_EVENT.RUNNING);
  ok("PAUSED → paused event", eventForStatus("PAUSED") === UGC_NOTIFY_EVENT.PAUSED);
  ok("REJECTED → rejected event", eventForStatus("REJECTED") === UGC_NOTIFY_EVENT.REJECTED);
  ok("PENDING → submission received", eventForStatus("PENDING") === UGC_NOTIFY_EVENT.SUBMISSION_RECEIVED);
  ok("unknown status → null", eventForStatus("NOPE") === null);

  ok("every affiliate event has a message", Object.values(UGC_NOTIFY_EVENT).every((e) => typeof affiliateMessage(e) === "string" && affiliateMessage(e).length > 0));
  ok("rejection message includes the reason", affiliateMessage(UGC_NOTIFY_EVENT.REJECTED, { reason: "trop sombre" }).includes("trop sombre"));
  ok("message includes the product title", affiliateMessage(UGC_NOTIFY_EVENT.APPROVED, { productTitle: "Tapis" }).includes("Tapis"));
  ok("running message mentions earnings", affiliateMessage(UGC_NOTIFY_EVENT.RUNNING).toLowerCase().includes("gains"));
  ok("paused message says it stops earning", affiliateMessage(UGC_NOTIFY_EVENT.PAUSED).toLowerCase().includes("plus de gains"));

  ok("admin notified ONLY on submission received", adminMessage(UGC_NOTIFY_EVENT.SUBMISSION_RECEIVED) !== null);
  ok("admin NOT notified on approved", adminMessage(UGC_NOTIFY_EVENT.APPROVED) === null);
  ok("admin NOT notified on paused/rejected/running",
     [UGC_NOTIFY_EVENT.PAUSED, UGC_NOTIFY_EVENT.REJECTED, UGC_NOTIFY_EVENT.RUNNING].every((e) => adminMessage(e) === null));
}

console.log("4) emitUgcEvent writes the right rows:");
{
  const mkDb = () => {
    const db = { affiliateRows: [], adminRows: [] };
    db.affiliateNotification = { create: async ({ data }) => { db.affiliateRows.push(data); return data; } };
    db.adminNotification = { create: async ({ data }) => { db.adminRows.push(data); return data; } };
    return db;
  };
  const sub = { id: "s1", affiliateId: "aff1" };

  const db1 = mkDb();
  const r1 = await emitUgcEvent({ event: UGC_NOTIFY_EVENT.SUBMISSION_RECEIVED, submission: sub, productTitle: "Tapis", db: db1 });
  ok("received → affiliate + admin rows", r1.affiliate === true && r1.admin === true);
  ok("affiliate row targets the owner", db1.affiliateRows[0].affiliateId === "aff1");
  ok("admin row carries the type + entityId", db1.adminRows[0].type === ADMIN_NOTIFICATION_TYPE.UGC_REVIEW_PENDING && db1.adminRows[0].entityId === "s1");

  const db2 = mkDb();
  const r2 = await emitUgcEvent({ event: UGC_NOTIFY_EVENT.APPROVED, submission: sub, db: db2 });
  ok("approved → affiliate only", r2.affiliate === true && r2.admin === false && db2.adminRows.length === 0);

  const db3 = mkDb();
  await emitUgcEvent({ event: UGC_NOTIFY_EVENT.REJECTED, submission: sub, reason: "flou", db: db3 });
  ok("rejection reason reaches the affiliate row", db3.affiliateRows[0].message.includes("flou"));
}

console.log("5) notifications are NON-FATAL (never throw):");
{
  const sub = { id: "s1", affiliateId: "aff1" };
  const exploding = {
    affiliateNotification: { create: async () => { throw new Error("table does not exist"); } },
    adminNotification:     { create: async () => { throw new Error("table does not exist"); } },
  };
  let threw = false;
  let res;
  try { res = await emitUgcEvent({ event: UGC_NOTIFY_EVENT.SUBMISSION_RECEIVED, submission: sub, db: exploding }); }
  catch { threw = true; }
  ok("a failing DB never throws", threw === false);
  ok("reports nothing was written", res.affiliate === false && res.admin === false);

  // Missing models entirely (e.g. migration not applied yet)
  const bare = {};
  const res2 = await emitUgcEvent({ event: UGC_NOTIFY_EVENT.SUBMISSION_RECEIVED, submission: sub, db: bare });
  ok("missing tables degrade silently", res2.affiliate === false && res2.admin === false);

  const res3 = await emitUgcEvent({ event: null, submission: sub, db: bare });
  ok("null event is a no-op", res3.affiliate === false && res3.admin === false);
  const res4 = await emitUgcEvent({ event: UGC_NOTIFY_EVENT.APPROVED, submission: null, db: bare });
  ok("null submission is a no-op", res4.affiliate === false);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
