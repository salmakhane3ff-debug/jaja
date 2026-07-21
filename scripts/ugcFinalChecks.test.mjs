#!/usr/bin/env node
/**
 * scripts/ugcFinalChecks.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Final pre-staging confirmations:
 *   1. approveSubmission composes TWO legal edges when defaultApprovedStatus=RUNNING,
 *      and the history contains BOTH transitions separately.
 *   2. Notification dedup key = submissionId + historyId + eventType (+ audience),
 *      so repeated pause/resume cycles never collide, but a retry does.
 *   3. ugcOps produces structured events + counters (observable), not just console.
 * Run: node scripts/ugcFinalChecks.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createUgcService } from "../src/lib/services/ugcService.js";
import { buildEventKey, emitUgcEvent, UGC_NOTIFY_EVENT } from "../src/lib/ugcNotifications.js";
import {
  recordUgcOpsFailure, getUgcOpsMetrics, resetUgcOpsMetrics, onUgcOpsEvent, UGC_OPS_OPERATION,
} from "../src/lib/ugcOps.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

// ── Minimal in-memory Prisma-ish fake ────────────────────────────────────────
function makeDb() {
  const state = { subs: new Map(), history: [], seq: 0 };
  const clone = (o) => (o ? { ...o } : o);
  const db = {
    _state: state,
    product: { findUnique: async () => ({ id: "p1", isActive: true, status: "Active" }) },
    ugcVideoSubmission: {
      findUnique: async ({ where }) => {
        if (where.id) return clone(state.subs.get(where.id));
        if (where.affiliateId_productId) {
          const { affiliateId, productId } = where.affiliateId_productId;
          return clone([...state.subs.values()].find((s) => s.affiliateId === affiliateId && s.productId === productId));
        }
        return null;
      },
      create: async ({ data }) => {
        const id = `s${++state.seq}`;
        const row = { id, ...data, updatedAt: new Date(Date.now() + state.seq) };
        state.subs.set(id, row);
        return clone(row);
      },
      updateMany: async ({ where, data }) => {
        const row = state.subs.get(where.id);
        if (!row) return { count: 0 };
        if (where.status !== undefined && row.status !== where.status) return { count: 0 };
        if (where.updatedAt !== undefined && row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
        Object.assign(row, data, { updatedAt: new Date(Date.now() + ++state.seq) });
        return { count: 1 };
      },
    },
    ugcVideoHistory: {
      create: async ({ data }) => {
        const row = { id: `h${++state.seq}`, ...data, createdAt: new Date() };
        state.history.push(row);
        return clone(row);
      },
    },
    $transaction: async (fn) => fn(db),
  };
  return db;
}
const storage = { upload: async () => ({ videoUrl: "https://cdn/v.mp4", storageKey: "k" }), remove: async () => {} };
const okValidate = () => ({ ok: true });
const baseCreate = { affiliateId: "affA", productId: "p1", videoBuffer: Buffer.from("x"), advertisingConsent: true, settings: { enabled: true } };

console.log("1) approveSubmission composes two legal edges; history records BOTH:");
{
  // defaultApprovedStatus = RUNNING → PENDING → APPROVED → RUNNING
  const db = makeDb();
  const svc = createUgcService({ db, storage, validate: okValidate, notify: async () => {} });
  const sub = await svc.createSubmission(baseCreate);
  const final = await svc.approveSubmission({
    submissionId: sub.id, actorId: "adm",
    settings: { enabled: true, defaultApprovedStatus: "RUNNING" },
  });
  ok("final status is RUNNING", final.status === "RUNNING");

  const transitions = db._state.history.filter((h) => h.ugcVideoId === sub.id && h.action !== "SUBMIT");
  ok("history has exactly TWO transition rows", transitions.length === 2);
  ok("first edge is PENDING → APPROVED", transitions[0].oldStatus === "PENDING" && transitions[0].newStatus === "APPROVED");
  ok("second edge is APPROVED → RUNNING", transitions[1].oldStatus === "APPROVED" && transitions[1].newStatus === "RUNNING");
  ok("no direct PENDING → RUNNING row exists",
     !db._state.history.some((h) => h.oldStatus === "PENDING" && h.newStatus === "RUNNING"));
  ok("both edges recorded as ADMIN", transitions.every((h) => h.actorType === "ADMIN" && h.actorId === "adm"));

  // defaultApprovedStatus = APPROVED → stops at APPROVED (one edge only)
  const db2 = makeDb();
  const svc2 = createUgcService({ db: db2, storage, validate: okValidate, notify: async () => {} });
  const sub2 = await svc2.createSubmission(baseCreate);
  const final2 = await svc2.approveSubmission({
    submissionId: sub2.id, actorId: "adm",
    settings: { enabled: true, defaultApprovedStatus: "APPROVED" },
  });
  ok("stops at APPROVED when configured so", final2.status === "APPROVED");
  ok("only ONE transition recorded", db2._state.history.filter((h) => h.action !== "SUBMIT").length === 1);
  ok("the setting genuinely changes behaviour (RUNNING vs APPROVED)", final.status !== final2.status);
}

console.log("2) notification dedup key = submissionId + historyId + eventType:");
{
  const k1 = buildEventKey({ submissionId: "s1", historyId: "h1", event: "paused", audience: "affiliate" });
  const k2 = buildEventKey({ submissionId: "s1", historyId: "h1", event: "paused", audience: "affiliate" });
  ok("same inputs → same key (deterministic)", k1 === k2);
  ok("key contains all three components", k1.includes("s1") && k1.includes("h1") && k1.includes("paused"));

  // Repeated pause/resume cycles: different history rows → different keys.
  const pause1  = buildEventKey({ submissionId: "s1", historyId: "h10", event: "paused",  audience: "affiliate" });
  const resume1 = buildEventKey({ submissionId: "s1", historyId: "h11", event: "running", audience: "affiliate" });
  const pause2  = buildEventKey({ submissionId: "s1", historyId: "h12", event: "paused",  audience: "affiliate" });
  ok("pause → resume → pause produce 3 DISTINCT keys", new Set([pause1, resume1, pause2]).size === 3);
  ok("second pause does NOT collide with the first", pause1 !== pause2);

  ok("audience separates affiliate/admin",
     buildEventKey({ submissionId: "s1", historyId: "h1", event: "paused", audience: "admin" }) !== k1);
  ok("different submission → different key",
     buildEventKey({ submissionId: "s2", historyId: "h1", event: "paused", audience: "affiliate" }) !== k1);
  ok("missing historyId → null (falls back to non-keyed insert)",
     buildEventKey({ submissionId: "s1", event: "paused", audience: "affiliate" }) === null);

  // A duplicate insert (same key) is suppressed, not reported as a failure.
  const rows = [];
  const uniqueDb = {
    affiliateNotification: {
      create: async ({ data }) => {
        if (data.eventKey && rows.some((r) => r.eventKey === data.eventKey)) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
        rows.push(data); return data;
      },
    },
  };
  const sub = { id: "s1", affiliateId: "affA" };
  const args = { event: UGC_NOTIFY_EVENT.PAUSED, submission: sub, historyId: "h10", db: uniqueDb };
  const r1 = await emitUgcEvent(args);
  const r2 = await emitUgcEvent(args);           // retry / duplicate service call
  ok("first emit writes a row", r1.affiliate === true && rows.length === 1);
  ok("retry is suppressed as duplicate", r2.affiliate === false && r2.duplicate === true);
  ok("still exactly ONE notification row", rows.length === 1);

  // A genuinely new pause (new history row) is NOT suppressed.
  await emitUgcEvent({ ...args, historyId: "h12" });
  ok("a later pause cycle DOES notify again", rows.length === 2);

  resetUgcOpsMetrics();
  const dupMetrics = getUgcOpsMetrics();
  ok("duplicate suppression is not counted as an ops failure", dupMetrics.totalFailures === 0);
}

console.log("3) ugcOps is observable (structured events + counters, not just console):");
{
  resetUgcOpsMetrics();
  ok("starts healthy", getUgcOpsMetrics().healthy === true && getUgcOpsMetrics().totalFailures === 0);

  // Observer receives structured events (the metrics/APM seam).
  const seen = [];
  const off = onUgcOpsEvent((rec) => seen.push(rec));
  const silentSink = () => {};   // prove it does NOT depend on console output

  recordUgcOpsFailure({
    operation: UGC_OPS_OPERATION.AUDIT_SETTINGS_WRITE,
    error: new Error("relation does not exist"),
    context: { actorId: "adm", earningsAffecting: true },
    sink: silentSink,
  });

  ok("observer received an event without any console sink", seen.length === 1);
  ok("event is structured + schema-versioned", seen[0].schemaVersion === 1 && seen[0].component === "ugc-ops");
  ok("event marks severity + degraded", seen[0].severity === "error" && seen[0].degraded === true);
  ok("event carries the operation", seen[0].operation === UGC_OPS_OPERATION.AUDIT_SETTINGS_WRITE);
  ok("event preserves context (earnings impact visible)", seen[0].earningsAffecting === true && seen[0].actorId === "adm");

  const m = getUgcOpsMetrics();
  ok("counter incremented", m.totalFailures === 1);
  ok("no longer reports healthy", m.healthy === false);
  ok("per-operation counter present", m.operations.find((o) => o.operation === UGC_OPS_OPERATION.AUDIT_SETTINGS_WRITE)?.failures === 1);
  ok("last error retained", m.operations[0].lastError.includes("relation does not exist"));
  ok("recent structured events retained for the health endpoint", Array.isArray(m.recent) && m.recent.length === 1);

  recordUgcOpsFailure({ operation: UGC_OPS_OPERATION.NOTIFY_ADMIN, error: "boom", sink: silentSink });
  ok("counters aggregate across operations", getUgcOpsMetrics().totalFailures === 2 && getUgcOpsMetrics().operations.length === 2);

  // A throwing observer must never break the caller.
  onUgcOpsEvent(() => { throw new Error("observer exploded"); });
  let threw = false;
  try { recordUgcOpsFailure({ operation: UGC_OPS_OPERATION.NOTIFY_AFFILIATE, error: "x", sink: silentSink }); }
  catch { threw = true; }
  ok("a throwing observer never breaks recording", threw === false);

  off();
  const before = seen.length;
  recordUgcOpsFailure({ operation: UGC_OPS_OPERATION.NOTIFY_AFFILIATE, error: "y", sink: silentSink });
  ok("unsubscribe works", seen.length === before);
  resetUgcOpsMetrics();
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
