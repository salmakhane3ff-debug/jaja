/**
 * src/lib/services/ugcService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * UGC submission lifecycle: create, replace, and status transitions. All status
 * changes go THROUGH the ugcStatus state machine; arbitrary writes are impossible.
 *
 * DESIGN:
 *   • Dependency-injected (db, storage, validate, now) via a factory, so the full
 *     lifecycle — including transactional rollback and concurrency — is unit
 *     testable without a real database or object store. Defaults wire to the real
 *     Prisma client + saveMedia/destroyByUrl.
 *   • AUTHORIZATION lives HERE, not in routes: ownership and actor-role checks are
 *     enforced by the service, so any caller (route, job, script) is safe.
 *   • STORAGE SAFETY is transactional: validate → upload → DB write. If the DB
 *     write fails, the just-uploaded object is removed (no orphan file); if the
 *     upload fails, no DB mutation happens (no orphan row). On replace, the OLD
 *     object is deleted ONLY after the DB transaction commits.
 *   • HISTORY is append-only AND idempotent: a UgcVideoHistory row is written ONLY
 *     inside the same transaction as a GUARDED update that actually changed the
 *     row (updateMany count === 1). A retry of an already-applied change matches 0
 *     rows, so it appends NO history — retries can never duplicate the audit trail.
 *   • CONCURRENCY: create relies on the @@unique(affiliateId, productId) constraint
 *     (duplicate → P2002 → rolled back). Replace/transition use a guarded
 *     updateMany that pins the row's `updatedAt` (optimistic version token — bumped
 *     by @updatedAt on every write) in addition to status/videoUrl, so only one of
 *     two racing requests commits; the loser removes its own upload.
 *
 * DELETE is intentionally NOT implemented — a permanent architectural decision.
 * Submissions are kept forever; affiliates REPLACE videos instead of deleting.
 * Status transitions cover the full lifecycle. No archivedAt, no DELETED status,
 * no hard delete (RESTRICT FKs on history/earnings preserve every record).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';
import { saveMedia, destroyByUrl } from '../cloudinary.js';
import { validateVideoBuffer } from '../videoValidation.js';
import { normalizeUgcSettings } from '../ugcSettings.js';
import {
  UGC_STATUS, UGC_ACTOR, assertTransition, canReach,
} from '../ugcStatus.js';
import { emitUgcEvent, eventForStatus, UGC_NOTIFY_EVENT } from '../ugcNotifications.js';

const err = (code, message) => Object.assign(new Error(message || code), { code });

// Action label for a given legal edge (for the audit trail).
const EDGE_ACTION = {
  'PENDING→APPROVED':  'APPROVE',
  'PENDING→REJECTED':  'REJECT',
  'APPROVED→RUNNING':  'START',
  'RUNNING→PAUSED':    'PAUSE',
  'PAUSED→RUNNING':    'RESUME',
  'REJECTED→PENDING':  'REPLACE',
};

function videoPolicyFromSettings(settings) {
  const s = normalizeUgcSettings(settings);
  return { minSeconds: s.minVideoSeconds, maxSeconds: s.maxVideoSeconds, maxBytes: s.maxUploadBytes };
}

// ── Serialization (business rule: internal notes are ADMIN-ONLY) ──────────────
/** Affiliate-safe view — NEVER includes internalAdminNotes. */
export function serializeForAffiliate(sub) {
  if (!sub) return null;
  const { internalAdminNotes: _internalAdminNotes, ...rest } = sub;  // omit admin-only field
  return rest;
}
/** Admin view — full record. */
export function serializeForAdmin(sub) {
  return sub ? { ...sub } : null;
}

// ── Default storage adapter (wraps the shared media facade) ───────────────────
const defaultStorage = {
  async upload(buffer, opts = {}) {
    const res = await saveMedia(buffer, { resourceType: 'video', folder: 'ugc', subdir: 'ugc', ...opts });
    return { videoUrl: res.url, storageKey: res.key || res.public_id || null };
  },
  async remove(url) {
    if (url) await destroyByUrl(url);
  },
};

/**
 * @param {object} [deps]
 * @param {*} [deps.db]        Prisma client
 * @param {{upload,remove}} [deps.storage]
 * @param {(buffer:Buffer,opts:object)=>object} [deps.validate]  video validator
 * @param {() => Date} [deps.now]
 * @param {(p:object)=>Promise<*>} [deps.notify]  event-driven notification emitter
 */
export function createUgcService(deps = {}) {
  const {
    db = prisma,
    storage = defaultStorage,
    validate = (buf, opts) => validateVideoBuffer(buf, opts),
    now = () => new Date(),
    notify = emitUgcEvent,
  } = deps;

  /**
   * Fire a domain notification AFTER a transaction has committed. Never throws
   * and is never awaited by the caller's critical path — a notification failure
   * must not roll back or block a submission/transition.
   */
  function emitAfterCommit(event, submission, extra = {}) {
    try {
      Promise.resolve(notify({ event, submission, db, ...extra })).catch(() => {});
    } catch { /* non-fatal by contract */ }
  }

  /**
   * Create the (single) submission for an affiliate+product.
   * affiliateId MUST be the authenticated affiliate's id (ownership is implicit —
   * an affiliate can only create for themselves).
   */
  async function createSubmission({ affiliateId, productId, videoBuffer, description, advertisingConsent, settings }) {
    if (!affiliateId) throw err('UGC_UNAUTHENTICATED', 'affiliate identity required');
    if (!normalizeUgcSettings(settings).enabled) throw err('UGC_DISABLED', 'UGC uploads are currently disabled');
    if (!productId) throw err('UGC_BAD_INPUT', 'productId required');
    if (advertisingConsent !== true) throw err('UGC_CONSENT_REQUIRED', 'advertising consent is required');

    const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, isActive: true, status: true } });
    if (!product) throw err('UGC_PRODUCT_NOT_FOUND', 'product not found');
    if (product.isActive === false || product.status !== 'Active') throw err('UGC_PRODUCT_INACTIVE', 'product is not active');

    // Fast pre-check; the @@unique constraint is the authoritative guard.
    const existing = await db.ugcVideoSubmission.findUnique({ where: { affiliateId_productId: { affiliateId, productId } } });
    if (existing) throw err('UGC_ALREADY_SUBMITTED', 'a submission already exists for this product — replace it instead');

    const v = validate(videoBuffer, videoPolicyFromSettings(settings));
    if (!v.ok) throw err('UGC_INVALID_VIDEO', v.reason || 'invalid video');

    // validate → upload → DB. Upload happens before the DB write so a failed
    // upload never leaves a row; a failed DB write removes the upload.
    const up = await storage.upload(videoBuffer, {});
    try {
      let historyId = null;   // deterministic idempotency anchor for the notification
      const created = await db.$transaction(async (tx) => {
        const sub = await tx.ugcVideoSubmission.create({
          data: {
            affiliateId, productId,
            videoUrl: up.videoUrl, storageKey: up.storageKey,
            description: description || null,
            status: UGC_STATUS.PENDING,
            advertisingConsent: true, advertisingConsentAt: now(),
            submittedAt: now(),
          },
        });
        const hist = await tx.ugcVideoHistory.create({
          data: {
            ugcVideoId: sub.id, oldVideoUrl: null, newVideoUrl: up.videoUrl,
            oldStatus: null, newStatus: UGC_STATUS.PENDING, action: 'SUBMIT',
            actorId: affiliateId, actorType: UGC_ACTOR.AFFILIATE, reason: null,
          },
        });
        historyId = hist?.id || null;
        return sub;
      });
      // Committed → tell the affiliate it was received and the admins to review it.
      emitAfterCommit(UGC_NOTIFY_EVENT.SUBMISSION_RECEIVED, created, { historyId });
      return created;
    } catch (e) {
      await storage.remove(up.videoUrl).catch(() => {}); // rollback the orphaned upload
      if (e && e.code === 'P2002') throw err('UGC_ALREADY_SUBMITTED', 'a submission already exists for this product');
      throw e;
    }
  }

  /**
   * Replace the video of an existing submission (rejected → re-review, or pending
   * swap). Same submission row — never a second submission.
   */
  async function replaceSubmission({ submissionId, affiliateId, videoBuffer, description, settings }) {
    if (!affiliateId) throw err('UGC_UNAUTHENTICATED', 'affiliate identity required');
    const sub = await db.ugcVideoSubmission.findUnique({ where: { id: submissionId } });
    if (!sub) throw err('UGC_NOT_FOUND', 'submission not found');
    if (sub.affiliateId !== affiliateId) throw err('UGC_FORBIDDEN', 'not your submission');

    const isRejected = sub.status === UGC_STATUS.REJECTED;
    if (!(isRejected || sub.status === UGC_STATUS.PENDING)) {
      throw err('UGC_NOT_REPLACEABLE', `cannot replace a submission in status ${sub.status}`);
    }
    // A rejected replacement transitions REJECTED → PENDING via the state machine.
    if (isRejected) assertTransition(UGC_STATUS.REJECTED, UGC_STATUS.PENDING, UGC_ACTOR.AFFILIATE);

    const v = validate(videoBuffer, videoPolicyFromSettings(settings));
    if (!v.ok) throw err('UGC_INVALID_VIDEO', v.reason || 'invalid video');

    const oldUrl = sub.videoUrl;
    const up = await storage.upload(videoBuffer, {});
    let historyId = null;
    try {
      await db.$transaction(async (tx) => {
        // Guard on the exact row we read — status + videoUrl + the updatedAt
        // version token. If another replace/transition touched the row since our
        // read, updatedAt no longer matches → 0 rows → conflict (loser rolls back).
        const upd = await tx.ugcVideoSubmission.updateMany({
          where: { id: submissionId, videoUrl: oldUrl, status: sub.status, updatedAt: sub.updatedAt },
          data: {
            videoUrl: up.videoUrl, storageKey: up.storageKey,
            description: description === undefined ? sub.description : (description || null),
            status: UGC_STATUS.PENDING, submittedAt: now(),
          },
        });
        if (upd.count === 0) throw err('UGC_REPLACE_CONFLICT', 'submission changed concurrently');
        const hist = await tx.ugcVideoHistory.create({
          data: {
            ugcVideoId: submissionId, oldVideoUrl: oldUrl, newVideoUrl: up.videoUrl,
            oldStatus: sub.status, newStatus: UGC_STATUS.PENDING, action: 'REPLACE',
            actorId: affiliateId, actorType: UGC_ACTOR.AFFILIATE, reason: null,
          },
        });
        historyId = hist?.id || null;
      });
      // Only AFTER the transaction commits do we delete the previous object.
      if (oldUrl && oldUrl !== up.videoUrl) await storage.remove(oldUrl).catch(() => {});
      const fresh = await db.ugcVideoSubmission.findUnique({ where: { id: submissionId } });
      // A replacement re-enters review → same event as a new submission.
      emitAfterCommit(UGC_NOTIFY_EVENT.SUBMISSION_RECEIVED, fresh || sub, { historyId });
      return fresh;
    } catch (e) {
      await storage.remove(up.videoUrl).catch(() => {}); // remove the NEW upload; keep the old
      throw e;
    }
  }

  /**
   * Perform ONE state-machine transition. Ownership + actor-role are enforced
   * here. Admin-only edges (approve/reject/start) reject affiliate actors.
   */
  async function transitionStatus({ submissionId, toStatus, actorId, actorType, reason, internalNote }) {
    const sub = await db.ugcVideoSubmission.findUnique({ where: { id: submissionId } });
    if (!sub) throw err('UGC_NOT_FOUND', 'submission not found');
    if (actorType === UGC_ACTOR.AFFILIATE && sub.affiliateId !== actorId) throw err('UGC_FORBIDDEN', 'not your submission');

    // Operationally idempotent: a repeated command that finds the submission
    // ALREADY in the requested status returns unchanged — no DB update, no history —
    // provided this actor could legitimately reach that status (else it is an
    // unauthorized command, not a retry).
    if (sub.status === toStatus) {
      if (!canReach(toStatus, actorType)) {
        throw Object.assign(new Error(`${actorType} may not set status ${toStatus}`), { code: 'UGC_ILLEGAL_TRANSITION' });
      }
      return sub;
    }

    // Throws UGC_ILLEGAL_TRANSITION / UGC_BAD_ACTOR / UGC_BAD_STATUS for anything
    // this actor may not do (e.g. an affiliate trying to APPROVE).
    assertTransition(sub.status, toStatus, actorType);

    if (toStatus === UGC_STATUS.REJECTED && !(reason && String(reason).trim())) {
      throw err('UGC_REASON_REQUIRED', 'a rejection reason is required');
    }

    const data = { status: toStatus };
    if (toStatus === UGC_STATUS.APPROVED) data.approvedAt = now();
    if (toStatus === UGC_STATUS.REJECTED) { data.rejectedAt = now(); data.rejectionReason = String(reason).trim(); }
    if (toStatus === UGC_STATUS.PAUSED)   data.pausedAt = now();
    if (toStatus === UGC_STATUS.RUNNING)  data.resumedAt = now();
    // internalAdminNotes are admin-only — never settable by an affiliate.
    if (actorType === UGC_ACTOR.ADMIN && internalNote != null) data.internalAdminNotes = String(internalNote);

    let historyId = null;
    await db.$transaction(async (tx) => {
      // Guard on from-status AND the updatedAt version token: a retry of an
      // already-applied transition (or a concurrent change) matches 0 rows, so it
      // makes no change and appends no history — history stays idempotent.
      const upd = await tx.ugcVideoSubmission.updateMany({
        where: { id: submissionId, status: sub.status, updatedAt: sub.updatedAt },
        data,
      });
      if (upd.count === 0) throw err('UGC_TRANSITION_CONFLICT', 'submission status changed concurrently');
      const hist = await tx.ugcVideoHistory.create({
        data: {
          ugcVideoId: submissionId, oldStatus: sub.status, newStatus: toStatus,
          action: EDGE_ACTION[`${sub.status}→${toStatus}`] || 'TRANSITION',
          actorId, actorType, reason: reason ? String(reason).trim() : null,
        },
      });
      historyId = hist?.id || null;
    });
    const updated = await db.ugcVideoSubmission.findUnique({ where: { id: submissionId } });
    // Committed → notify the affiliate of the new state (approved/running/paused/rejected).
    emitAfterCommit(eventForStatus(toStatus), updated || sub, {
      reason: reason ? String(reason).trim() : null,
      historyId,
    });
    return updated;
  }

  /**
   * ORCHESTRATED APPROVAL — the single place `defaultApprovedStatus` takes effect.
   *
   * The state machine deliberately has no PENDING→RUNNING edge. When settings say
   * `defaultApprovedStatus = RUNNING`, approval COMPOSES the two legal edges:
   *     PENDING → APPROVED   (approve)
   *     APPROVED → RUNNING   (start)
   * Each edge is asserted, guarded and audited separately, so the history shows
   * both steps and the notification for each is emitted — no hidden jumps.
   *
   * With `defaultApprovedStatus = APPROVED` the submission stops at APPROVED and an
   * admin starts it manually. Either way the setting has a real, visible effect.
   *
   * @returns {Promise<object>} the submission in its final status
   */
  async function approveSubmission({ submissionId, actorId, settings, reason, internalNote }) {
    const approved = await transitionStatus({
      submissionId, toStatus: UGC_STATUS.APPROVED,
      actorId, actorType: UGC_ACTOR.ADMIN, reason, internalNote,
    });

    const { defaultApprovedStatus } = normalizeUgcSettings(settings);
    if (defaultApprovedStatus !== UGC_STATUS.RUNNING) return approved;

    // Compose the second legal edge. If it fails (e.g. a concurrent change moved
    // the row), the approval itself still stands — report the approved state.
    try {
      return await transitionStatus({
        submissionId, toStatus: UGC_STATUS.RUNNING,
        actorId, actorType: UGC_ACTOR.ADMIN,
      });
    } catch {
      return approved;
    }
  }

  /** Ownership-enforced read (affiliate can only fetch their own). */
  async function getForAffiliate({ submissionId, affiliateId }) {
    const sub = await db.ugcVideoSubmission.findUnique({ where: { id: submissionId } });
    if (!sub) throw err('UGC_NOT_FOUND', 'submission not found');
    if (sub.affiliateId !== affiliateId) throw err('UGC_FORBIDDEN', 'not your submission');
    return serializeForAffiliate(sub);
  }

  /** An affiliate's own submissions (internal notes stripped). */
  async function listForAffiliate({ affiliateId }) {
    const subs = await db.ugcVideoSubmission.findMany({ where: { affiliateId }, orderBy: { createdAt: 'desc' } });
    return subs.map(serializeForAffiliate);
  }

  /** Admin detail: full record + status history. */
  async function getForAdmin({ submissionId }) {
    const sub = await db.ugcVideoSubmission.findUnique({
      where: { id: submissionId },
      include: { histories: { orderBy: { createdAt: 'desc' } } },
    });
    if (!sub) throw err('UGC_NOT_FOUND', 'submission not found');
    return serializeForAdmin(sub);
  }

  /** Admin paginated list with optional filters. */
  async function listForAdmin({ status, affiliateId, productId, page = 1, pageSize = 20 } = {}) {
    const where = {};
    if (status) where.status = status;
    if (affiliateId) where.affiliateId = affiliateId;
    if (productId) where.productId = productId;
    const take = Math.min(Math.max(1, Number(pageSize) || 20), 100);
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;
    const [items, total] = await Promise.all([
      db.ugcVideoSubmission.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      db.ugcVideoSubmission.count({ where }),
    ]);
    return { items: items.map(serializeForAdmin), total, page: Number(page) || 1, pages: Math.ceil(total / take) };
  }

  return {
    createSubmission, replaceSubmission, transitionStatus, approveSubmission,
    getForAffiliate, listForAffiliate, getForAdmin, listForAdmin,
    serializeForAffiliate, serializeForAdmin,
  };
}

// Default singleton (real prisma + storage) for route/consumer use.
export const ugcService = createUgcService();
