#!/usr/bin/env node
/**
 * scripts/ugcService.test.mjs
 * Unit tests for the UGC submission lifecycle service (src/lib/services/ugcService.js).
 * Uses in-memory fakes for the DB (with @@unique + transactional rollback) and the
 * object store — no real database, no network. Run: node scripts/ugcService.test.mjs
 */

import { createUgcService, serializeForAffiliate } from "../src/lib/services/ugcService.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };
const throwsAsync = async (fn, code) => { try { await fn(); return false; } catch (e) { return e.code === code; } };

// ── Fake object store ─────────────────────────────────────────────────────────
function makeStorage({ failUpload = false, yieldUpload = false } = {}) {
  const objects = new Set();
  const removed = [];
  let n = 0;
  return {
    objects, removed,
    async upload() {
      if (yieldUpload) await Promise.resolve();          // force interleaving in race tests
      if (failUpload) throw Object.assign(new Error("upload failed"), { code: "STORAGE_FAIL" });
      const url = `https://cdn.test/ugc/${++n}.mp4`;
      objects.add(url);
      return { videoUrl: url, storageKey: `key-${n}` };
    },
    async remove(url) { objects.delete(url); removed.push(url); },
  };
}

// ── Fake Prisma-ish DB ────────────────────────────────────────────────────────
function makeDb({ products = { "p1": { id: "p1", isActive: true, status: "Active" } }, failCreate = false } = {}) {
  const subs = new Map();            // id → row
  const uniq = new Map();            // "aff::prod" → id
  const history = [];                // append-only
  let idc = 0;
  let ver = 0;                       // monotonic @updatedAt version token
  const key = (s) => `${s.affiliateId}::${s.productId}`;

  const model = {
    product: { findUnique: async ({ where }) => products[where.id] || null },
    ugcVideoSubmission: {
      findUnique: async ({ where }) => {
        if (where.id) return subs.has(where.id) ? { ...subs.get(where.id) } : null;
        if (where.affiliateId_productId) {
          const k = `${where.affiliateId_productId.affiliateId}::${where.affiliateId_productId.productId}`;
          const id = uniq.get(k);
          return id ? { ...subs.get(id) } : null;
        }
        return null;
      },
      create: async ({ data }) => {
        if (failCreate) throw Object.assign(new Error("db down"), { code: "DBFAIL" });
        const k = key(data);
        if (uniq.has(k)) throw Object.assign(new Error("unique violation"), { code: "P2002" });
        const id = data.id || `sub-${++idc}`;
        const row = { id, ...data, updatedAt: ++ver }; // @updatedAt version token
        subs.set(id, row); uniq.set(k, id);
        return { ...row };
      },
      updateMany: async ({ where, data }) => {
        const row = subs.get(where.id);
        if (!row) return { count: 0 };
        if (where.videoUrl !== undefined && row.videoUrl !== where.videoUrl) return { count: 0 };
        if (where.status !== undefined && row.status !== where.status) return { count: 0 };
        if (where.updatedAt !== undefined && row.updatedAt !== where.updatedAt) return { count: 0 };
        Object.assign(row, data);
        row.updatedAt = ++ver;      // @updatedAt bumps on every successful write
        return { count: 1 };
      },
    },
    ugcVideoHistory: { create: async ({ data }) => { const h = { id: `h-${++idc}`, createdAt: new Date(), ...data }; history.push(h); return { ...h }; } },
    // Serialized (mutex) so concurrent transactions don't overlap — models real
    // DB isolation: each transaction snapshots AFTER the previous one commits, so
    // a rollback only reverts that transaction's own changes.
    _txChain: Promise.resolve(),
    $transaction(fn) {
      const run = async () => {
        const snap = { subs: new Map([...subs].map(([k, v]) => [k, { ...v }])), uniq: new Map(uniq), hist: history.length };
        try { return await fn(model); }
        catch (e) {
          subs.clear(); for (const [k, v] of snap.subs) subs.set(k, v);
          uniq.clear(); for (const [k, v] of snap.uniq) uniq.set(k, v);
          history.length = snap.hist;
          throw e;
        }
      };
      const result = model._txChain.then(run, run);
      model._txChain = result.then(() => {}, () => {}); // next tx waits for this to settle
      return result;
    },
    _state: { subs, history, uniq },
  };
  return model;
}

const okValidate = () => ({ ok: true, container: "mp4", durationSeconds: 30, codec: "avc1" });
const badValidate = () => ({ ok: false, reason: "too short" });
const buf = Buffer.from("fake-video");
const baseCreate = { affiliateId: "affA", productId: "p1", videoBuffer: buf, description: "nice", advertisingConsent: true, settings: { enabled: true } };

console.log("1) create — happy path + validation gates:");
{
  const db = makeDb(), storage = makeStorage();
  const svc = createUgcService({ db, storage, validate: okValidate });
  const sub = await svc.createSubmission(baseCreate);
  ok("submission created PENDING", sub.status === "PENDING" && sub.affiliateId === "affA");
  ok("consent recorded", sub.advertisingConsent === true && sub.advertisingConsentAt instanceof Date);
  ok("one object uploaded", storage.objects.size === 1);
  ok("history has one SUBMIT row", db._state.history.length === 1 && db._state.history[0].action === "SUBMIT" && db._state.history[0].newStatus === "PENDING");

  const db2 = makeDb(), svc2 = createUgcService({ db: db2, storage: makeStorage(), validate: okValidate });
  ok("consent required", await throwsAsync(() => svc2.createSubmission({ ...baseCreate, advertisingConsent: false }), "UGC_CONSENT_REQUIRED"));
  ok("inactive product rejected", await throwsAsync(() => createUgcService({ db: makeDb({ products: { p1: { id: "p1", isActive: false, status: "Inactive" } } }), storage: makeStorage(), validate: okValidate }).createSubmission(baseCreate), "UGC_PRODUCT_INACTIVE"));
  ok("missing product rejected", await throwsAsync(() => svc2.createSubmission({ ...baseCreate, productId: "nope" }), "UGC_PRODUCT_NOT_FOUND"));
  ok("invalid video rejected", await throwsAsync(() => createUgcService({ db: makeDb(), storage: makeStorage(), validate: badValidate }).createSubmission(baseCreate), "UGC_INVALID_VIDEO"));
  ok("create blocked when UGC disabled", await throwsAsync(() => createUgcService({ db: makeDb(), storage: makeStorage(), validate: okValidate }).createSubmission({ ...baseCreate, settings: { enabled: false } }), "UGC_DISABLED"));
}

console.log("2) storage safety — transactional rollback:");
{
  // DB write fails AFTER upload → the uploaded object is removed (no orphan file).
  const db = makeDb({ failCreate: true }), storage = makeStorage();
  const svc = createUgcService({ db, storage, validate: okValidate });
  ok("db failure propagates", await throwsAsync(() => svc.createSubmission(baseCreate), "DBFAIL"));
  ok("uploaded object removed on db failure (no orphan file)", storage.objects.size === 0 && storage.removed.length === 1);
  ok("no submission row persisted", db._state.subs.size === 0 && db._state.history.length === 0);

  // Upload fails → NO db mutation (no orphan row).
  const db2 = makeDb(), storage2 = makeStorage({ failUpload: true });
  const svc2 = createUgcService({ db: db2, storage: storage2, validate: okValidate });
  ok("upload failure propagates", await throwsAsync(() => svc2.createSubmission(baseCreate), "STORAGE_FAIL"));
  ok("no db mutation when upload fails (no orphan row)", db2._state.subs.size === 0 && db2._state.history.length === 0);
}

console.log("3) status transitions — state machine + timestamps + history:");
{
  const db = makeDb(), storage = makeStorage();
  const svc = createUgcService({ db, storage, validate: okValidate });
  const sub = await svc.createSubmission(baseCreate);

  // Admin approve (PENDING→APPROVED), then start (APPROVED→RUNNING).
  const approved = await svc.transitionStatus({ submissionId: sub.id, toStatus: "APPROVED", actorId: "admin1", actorType: "ADMIN" });
  ok("PENDING→APPROVED by admin", approved.status === "APPROVED" && approved.approvedAt instanceof Date);
  const running = await svc.transitionStatus({ submissionId: sub.id, toStatus: "RUNNING", actorId: "admin1", actorType: "ADMIN" });
  ok("APPROVED→RUNNING by admin", running.status === "RUNNING" && running.resumedAt instanceof Date);

  // Affiliate pauses/resumes their own RUNNING video.
  const paused = await svc.transitionStatus({ submissionId: sub.id, toStatus: "PAUSED", actorId: "affA", actorType: "AFFILIATE" });
  ok("RUNNING→PAUSED by owner affiliate", paused.status === "PAUSED" && paused.pausedAt instanceof Date);
  const resumed = await svc.transitionStatus({ submissionId: sub.id, toStatus: "RUNNING", actorId: "affA", actorType: "AFFILIATE" });
  ok("PAUSED→RUNNING by owner affiliate", resumed.status === "RUNNING");

  ok("every transition appended history (1 SUBMIT + 4 transitions)", db._state.history.length === 5);
  ok("history records actor + edge action", db._state.history.at(1).action === "APPROVE" && db._state.history.at(-1).action === "RESUME");

  const freshSvc = createUgcService({ db: makeDb(), storage: makeStorage(), validate: okValidate });
  const freshSub = await freshSvc.createSubmission(baseCreate); // PENDING
  ok("illegal edge rejected (PENDING→RUNNING shortcut)",
     await throwsAsync(() => freshSvc.transitionStatus({ submissionId: freshSub.id, toStatus: "RUNNING", actorId: "admin1", actorType: "ADMIN" }), "UGC_ILLEGAL_TRANSITION"));
}

console.log("4) reject requires reason; internal notes admin-only:");
{
  const db = makeDb(), svc = createUgcService({ db, storage: makeStorage(), validate: okValidate });
  const sub = await svc.createSubmission(baseCreate);
  ok("reject without reason rejected", await throwsAsync(() => svc.transitionStatus({ submissionId: sub.id, toStatus: "REJECTED", actorId: "admin1", actorType: "ADMIN" }), "UGC_REASON_REQUIRED"));
  const rejected = await svc.transitionStatus({ submissionId: sub.id, toStatus: "REJECTED", actorId: "admin1", actorType: "ADMIN", reason: "blurry", internalNote: "spammer" });
  ok("rejection reason stored + visible", rejected.rejectionReason === "blurry");
  ok("internal note stored for admin", rejected.internalAdminNotes === "spammer");
  ok("affiliate view NEVER exposes internal notes", !("internalAdminNotes" in serializeForAffiliate(rejected)));
  ok("affiliate view keeps rejection reason", serializeForAffiliate(rejected).rejectionReason === "blurry");
}

console.log("5) authorization — ownership + admin-only edges:");
{
  const db = makeDb(), svc = createUgcService({ db, storage: makeStorage(), validate: okValidate });
  const sub = await svc.createSubmission(baseCreate); // owned by affA

  ok("affiliate cannot APPROVE (admin-only edge)", await throwsAsync(() => svc.transitionStatus({ submissionId: sub.id, toStatus: "APPROVED", actorId: "affA", actorType: "AFFILIATE" }), "UGC_ILLEGAL_TRANSITION"));
  ok("affiliate cannot act on another's submission", await throwsAsync(() => svc.transitionStatus({ submissionId: sub.id, toStatus: "APPROVED", actorId: "affB", actorType: "AFFILIATE" }), "UGC_FORBIDDEN"));
  ok("affiliate cannot replace another's submission", await throwsAsync(() => svc.replaceSubmission({ submissionId: sub.id, affiliateId: "affB", videoBuffer: buf, settings: {} }), "UGC_FORBIDDEN"));
  ok("getForAffiliate blocks non-owner", await throwsAsync(() => svc.getForAffiliate({ submissionId: sub.id, affiliateId: "affB" }), "UGC_FORBIDDEN"));
  ok("getForAffiliate strips internal notes for owner", !("internalAdminNotes" in await svc.getForAffiliate({ submissionId: sub.id, affiliateId: "affA" })));
}

console.log("6) replace — rejected → pending, old media deleted after commit:");
{
  const db = makeDb(), storage = makeStorage();
  const svc = createUgcService({ db, storage, validate: okValidate });
  const sub = await svc.createSubmission(baseCreate);
  await svc.transitionStatus({ submissionId: sub.id, toStatus: "REJECTED", actorId: "admin1", actorType: "ADMIN", reason: "redo" });
  const oldUrl = [...storage.objects][0];

  const replaced = await svc.replaceSubmission({ submissionId: sub.id, affiliateId: "affA", videoBuffer: buf, description: "v2", settings: {} });
  ok("rejected → replaced → PENDING (same submission)", replaced.id === sub.id && replaced.status === "PENDING");
  ok("new video set, description updated", replaced.videoUrl !== oldUrl && replaced.description === "v2");
  ok("OLD object deleted only after commit", !storage.objects.has(oldUrl) && storage.removed.includes(oldUrl));
  ok("exactly one live object remains", storage.objects.size === 1);
  ok("replace appended REPLACE history with old→new", db._state.history.at(-1).action === "REPLACE" && db._state.history.at(-1).oldVideoUrl === oldUrl);
  ok("cannot replace a RUNNING submission", await throwsAsync(async () => {
    const s2 = await createUgcService({ db: makeDb(), storage: makeStorage(), validate: okValidate });
    const x = await s2.createSubmission(baseCreate);
    await s2.transitionStatus({ submissionId: x.id, toStatus: "APPROVED", actorId: "a", actorType: "ADMIN" });
    await s2.transitionStatus({ submissionId: x.id, toStatus: "RUNNING", actorId: "a", actorType: "ADMIN" });
    return s2.replaceSubmission({ submissionId: x.id, affiliateId: "affA", videoBuffer: buf, settings: {} });
  }, "UGC_NOT_REPLACEABLE"));
}

console.log("7) concurrency — duplicate create + racing replace:");
{
  // Two concurrent CREATES for the same (affiliate, product): unique constraint
  // lets exactly one through; the loser's upload is removed (no duplicate, no orphan).
  const db = makeDb(), storage = makeStorage({ yieldUpload: true });
  const svc = createUgcService({ db, storage, validate: okValidate });
  const results = await Promise.allSettled([svc.createSubmission(baseCreate), svc.createSubmission(baseCreate)]);
  const created = results.filter((r) => r.status === "fulfilled").length;
  const dupErr = results.find((r) => r.status === "rejected")?.reason?.code;
  ok("exactly one submission created", created === 1 && db._state.subs.size === 1);
  ok("the other create rejected as duplicate", dupErr === "UGC_ALREADY_SUBMITTED");
  ok("loser's upload removed (no orphan)", storage.objects.size === 1 && storage.removed.length === 1);

  // Two concurrent REPLACES on the same submission: one wins, loser rolls back.
  const db2 = makeDb(), st2 = makeStorage({ yieldUpload: true });
  const svc2 = createUgcService({ db: db2, storage: st2, validate: okValidate });
  const s = await svc2.createSubmission(baseCreate);
  await svc2.transitionStatus({ submissionId: s.id, toStatus: "REJECTED", actorId: "adm", actorType: "ADMIN", reason: "x" });
  const before = s.videoUrl;
  const rr = await Promise.allSettled([
    svc2.replaceSubmission({ submissionId: s.id, affiliateId: "affA", videoBuffer: buf, settings: {} }),
    svc2.replaceSubmission({ submissionId: s.id, affiliateId: "affA", videoBuffer: buf, settings: {} }),
  ]);
  const wins = rr.filter((r) => r.status === "fulfilled").length;
  const conflict = rr.find((r) => r.status === "rejected")?.reason?.code;
  ok("exactly one replace wins", wins === 1);
  ok("the other replace hits a conflict (guarded update)", conflict === "UGC_REPLACE_CONFLICT");
  const finalUrl = (await db2.ugcVideoSubmission.findUnique({ where: { id: s.id } })).videoUrl;
  ok("submission has the winner's video (not the original)", finalUrl !== before);
  ok("exactly one live object; original + loser removed", st2.objects.size === 1 && st2.objects.has(finalUrl));
}

console.log("8) history is append-only (failed ops add nothing):");
{
  const db = makeDb({ failCreate: true }), svc = createUgcService({ db, storage: makeStorage(), validate: okValidate });
  await throwsAsync(() => svc.createSubmission(baseCreate), "DBFAIL");
  ok("no history written when the transaction rolls back", db._state.history.length === 0);

  const db2 = makeDb(), svc2 = createUgcService({ db: db2, storage: makeStorage(), validate: okValidate });
  const sub = await svc2.createSubmission(baseCreate);
  const lenAfterCreate = db2._state.history.length;
  await throwsAsync(() => svc2.transitionStatus({ submissionId: sub.id, toStatus: "RUNNING", actorId: "a", actorType: "ADMIN" }), "UGC_ILLEGAL_TRANSITION");
  ok("illegal transition adds no history", db2._state.history.length === lenAfterCreate);
}

console.log("9) history append-only + idempotent transitions (refinement #2):");
{
  const db = makeDb(), svc = createUgcService({ db, storage: makeStorage(), validate: okValidate });
  const sub = await svc.createSubmission(baseCreate);
  await svc.transitionStatus({ submissionId: sub.id, toStatus: "APPROVED", actorId: "adm", actorType: "ADMIN" });
  const histAfter = db._state.history.length; // SUBMIT + APPROVE = 2

  // Retry the SAME transition (client retry): already APPROVED → idempotent
  // SUCCESS, unchanged, with NO new history (operational idempotency).
  const retry = await svc.transitionStatus({ submissionId: sub.id, toStatus: "APPROVED", actorId: "adm", actorType: "ADMIN" });
  ok("retry of an applied transition is an idempotent success (unchanged)", retry.status === "APPROVED");
  ok("no duplicate history on idempotent retry", db._state.history.length === histAfter);
  // But the idempotent no-op still respects authorization: an affiliate cannot
  // "succeed" at an admin-only status even when already there.
  ok("idempotent no-op still forbidden for an actor who can't reach the status",
     await throwsAsync(() => svc.transitionStatus({ submissionId: sub.id, toStatus: "APPROVED", actorId: "affA", actorType: "AFFILIATE" }), "UGC_ILLEGAL_TRANSITION"));

  // Concurrent SAME transition from the same read state: exactly one applies,
  // exactly one history row is added (the loser's guarded update matches 0 rows).
  const db2 = makeDb(), svc2 = createUgcService({ db: db2, storage: makeStorage({ yieldUpload: true }), validate: okValidate });
  const s2 = await svc2.createSubmission(baseCreate);
  const h0 = db2._state.history.length;
  const rr = await Promise.allSettled([
    svc2.transitionStatus({ submissionId: s2.id, toStatus: "APPROVED", actorId: "adm", actorType: "ADMIN" }),
    svc2.transitionStatus({ submissionId: s2.id, toStatus: "APPROVED", actorId: "adm", actorType: "ADMIN" }),
  ]);
  ok("one concurrent transition wins", rr.filter((r) => r.status === "fulfilled").length === 1);
  ok("the other hits a transition conflict", rr.find((r) => r.status === "rejected")?.reason?.code === "UGC_TRANSITION_CONFLICT");
  ok("exactly ONE history row added by two racing identical transitions", db2._state.history.length === h0 + 1);
}

console.log("10) updatedAt version guard (refinement #1):");
{
  // A replace using a STALE updatedAt (row changed since read) matches 0 rows even
  // if status/videoUrl are re-supplied — the version token catches it.
  const db = makeDb(), storage = makeStorage();
  const svc = createUgcService({ db, storage, validate: okValidate });
  const sub = await svc.createSubmission(baseCreate);
  await svc.transitionStatus({ submissionId: sub.id, toStatus: "REJECTED", actorId: "adm", actorType: "ADMIN", reason: "x" });

  // Simulate a concurrent write between an affiliate's read and their replace by
  // bumping the row (another admin note) — the affiliate's replace, carrying the
  // now-stale updatedAt, must conflict rather than clobber.
  const staleRead = await db.ugcVideoSubmission.findUnique({ where: { id: sub.id } });
  await db.ugcVideoSubmission.updateMany({ where: { id: sub.id }, data: { internalAdminNotes: "touched" } }); // bumps updatedAt
  // Directly exercise the guard: an update pinned to the stale updatedAt fails.
  const guarded = await db.ugcVideoSubmission.updateMany({ where: { id: sub.id, updatedAt: staleRead.updatedAt }, data: { description: "z" } });
  ok("stale updatedAt guard matches 0 rows", guarded.count === 0);
  const fresh = await db.ugcVideoSubmission.findUnique({ where: { id: sub.id } });
  const current = await db.ugcVideoSubmission.updateMany({ where: { id: sub.id, updatedAt: fresh.updatedAt }, data: { description: "z" } });
  ok("current updatedAt guard matches", current.count === 1);
}

console.log("11) event-driven notifications are emitted AFTER commit (never blocking):");
{
  // Collect emitted events via the injected notifier.
  const mkNotify = () => { const f = async (p) => { f.events.push(p); }; f.events = []; return f; };

  const notify = mkNotify();
  const db = makeDb(), svc = createUgcService({ db, storage: makeStorage(), validate: okValidate, notify });
  const sub = await svc.createSubmission(baseCreate);
  await new Promise((r) => setImmediate(r));           // emission is fire-and-forget
  ok("create emits submission_received", notify.events.length === 1 && notify.events[0].event === "submission_received");
  ok("event carries the committed submission", notify.events[0].submission?.id === sub.id);

  await svc.transitionStatus({ submissionId: sub.id, toStatus: "APPROVED", actorId: "adm", actorType: "ADMIN" });
  await new Promise((r) => setImmediate(r));
  ok("approve emits approved", notify.events.at(-1).event === "approved");

  await svc.transitionStatus({ submissionId: sub.id, toStatus: "RUNNING", actorId: "adm", actorType: "ADMIN" });
  await new Promise((r) => setImmediate(r));
  ok("start emits running", notify.events.at(-1).event === "running");

  await svc.transitionStatus({ submissionId: sub.id, toStatus: "PAUSED", actorId: "affA", actorType: "AFFILIATE" });
  await new Promise((r) => setImmediate(r));
  ok("pause emits paused", notify.events.at(-1).event === "paused");

  // Rejection carries the reason through to the notification.
  const n2 = mkNotify();
  const db2 = makeDb(), svc2 = createUgcService({ db: db2, storage: makeStorage(), validate: okValidate, notify: n2 });
  const s2 = await svc2.createSubmission(baseCreate);
  await svc2.transitionStatus({ submissionId: s2.id, toStatus: "REJECTED", actorId: "adm", actorType: "ADMIN", reason: "trop sombre" });
  await new Promise((r) => setImmediate(r));
  ok("reject emits rejected with the reason", n2.events.at(-1).event === "rejected" && n2.events.at(-1).reason === "trop sombre");

  // An idempotent no-op transition changes nothing → must not notify again.
  const before = n2.events.length;
  await svc2.transitionStatus({ submissionId: s2.id, toStatus: "REJECTED", actorId: "adm", actorType: "ADMIN", reason: "x" })
    .catch(() => {});
  await new Promise((r) => setImmediate(r));
  ok("repeated same-status command does not re-notify", n2.events.length === before);

  // A THROWING notifier must never break the operation.
  const boom = async () => { throw new Error("notification backend down"); };
  const db3 = makeDb(), svc3 = createUgcService({ db: db3, storage: makeStorage(), validate: okValidate, notify: boom });
  let created = null, threw = false;
  try { created = await svc3.createSubmission(baseCreate); } catch { threw = true; }
  await new Promise((r) => setImmediate(r));
  ok("failing notifier does not break create", threw === false && created?.status === "PENDING");
  ok("submission still persisted despite notify failure", db3._state.history.length === 1);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
