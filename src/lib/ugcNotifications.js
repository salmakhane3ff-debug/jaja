/**
 * src/lib/ugcNotifications.js
 * ─────────────────────────────────────────────────────────────────────────────
 * EVENT-DRIVEN UGC notifications. The service emits a domain EVENT at the moment
 * a state change commits; this module turns that event into notification rows.
 *
 * Events → who is told:
 *   SUBMISSION_RECEIVED → affiliate ("we got your video") + ADMIN ("review needed")
 *   APPROVED / RUNNING / PAUSED / REJECTED → affiliate
 *
 * ── NON-FATAL BY CONTRACT ────────────────────────────────────────────────────
 * A notification is a side effect, never part of the money/submission path.
 * `emitUgcEvent` NEVER throws and is always called AFTER the owning transaction
 * commits, so a notification failure (including the admin_notifications table not
 * existing yet, because the migration is additive and may not be applied) can
 * never roll back or block a submission or a status transition.
 *
 * The message builders are pure and unit-tested; only emitUgcEvent touches a DB.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { UGC_STATUS } from './ugcStatus.js';
import { recordUgcOpsFailure, UGC_OPS_OPERATION } from './ugcOps.js';

export const UGC_NOTIFY_EVENT = Object.freeze({
  SUBMISSION_RECEIVED: 'submission_received',
  APPROVED:            'approved',
  RUNNING:             'running',
  PAUSED:              'paused',
  REJECTED:            'rejected',
});

export const ADMIN_NOTIFICATION_TYPE = Object.freeze({
  UGC_REVIEW_PENDING: 'ugc_submission_pending',
});

/** Map a committed target status to the event affiliates should be told about. */
export function eventForStatus(toStatus) {
  switch (toStatus) {
    case UGC_STATUS.APPROVED: return UGC_NOTIFY_EVENT.APPROVED;
    case UGC_STATUS.RUNNING:  return UGC_NOTIFY_EVENT.RUNNING;
    case UGC_STATUS.PAUSED:   return UGC_NOTIFY_EVENT.PAUSED;
    case UGC_STATUS.REJECTED: return UGC_NOTIFY_EVENT.REJECTED;
    case UGC_STATUS.PENDING:  return UGC_NOTIFY_EVENT.SUBMISSION_RECEIVED;
    default: return null;
  }
}

const withProduct = (base, productTitle) => (productTitle ? `${base} (${productTitle})` : base);

/** Affiliate-facing message (French, plain text). Pure. */
export function affiliateMessage(event, { productTitle, reason } = {}) {
  switch (event) {
    case UGC_NOTIFY_EVENT.SUBMISSION_RECEIVED:
      return withProduct('🎬 Votre vidéo a bien été reçue et sera examinée par notre équipe.', productTitle);
    case UGC_NOTIFY_EVENT.APPROVED:
      return withProduct('✅ Votre vidéo a été approuvée.', productTitle);
    case UGC_NOTIFY_EVENT.RUNNING:
      return withProduct('▶️ Votre vidéo est maintenant en diffusion et peut générer des gains.', productTitle);
    case UGC_NOTIFY_EVENT.PAUSED:
      return withProduct('⏸️ Votre vidéo a été mise en pause : elle ne génère plus de gains.', productTitle);
    case UGC_NOTIFY_EVENT.REJECTED:
      return withProduct(
        `❌ Votre vidéo a été refusée.${reason ? ` Motif : ${reason}` : ''} Vous pouvez la remplacer.`,
        productTitle,
      );
    default:
      return null;
  }
}

/** Admin-facing message. Pure. Only SUBMISSION_RECEIVED notifies admins. */
export function adminMessage(event, { productTitle, affiliateLabel } = {}) {
  if (event !== UGC_NOTIFY_EVENT.SUBMISSION_RECEIVED) return null;
  const who = affiliateLabel ? ` de ${affiliateLabel}` : '';
  return withProduct(`🎬 Nouvelle vidéo UGC${who} en attente de validation.`, productTitle);
}

/**
 * Deterministic notification key: submissionId + historyId + eventType (+ audience).
 *
 * IDEMPOTENCY MODEL: every committed state change writes EXACTLY ONE
 * UgcVideoHistory row (history is append-only and idempotent — a retry of an
 * already-applied transition matches 0 rows and appends nothing). The historyId
 * therefore identifies "this state change happened exactly once", so a retry or a
 * duplicate service call rebuilds the SAME key and collides on the UNIQUE index
 * instead of creating a second notification.
 *
 * Keying on (submissionId, eventType) ALONE would be WRONG: a video can legitimately
 * be paused → resumed → paused again, and each of those deserves its own notice.
 * Including historyId keeps repeated pause/resume cycles collision-free, while
 * submissionId and eventType keep the key self-describing and greppable in logs.
 *
 * `audience` separates the affiliate and admin rows (they live in different tables,
 * each with its own unique index, but distinct keys keep them unambiguous).
 */
export function buildEventKey({ submissionId, historyId, event, audience }) {
  if (!submissionId || !historyId || !event || !audience) return null;
  return `ugc:${submissionId}:${historyId}:${event}:${audience}`;
}

const isUniqueViolation = (err) => err && (err.code === 'P2002' || err.code === '23505');

/**
 * Persist the notifications for an event. NEVER throws.
 *
 * Failures are swallowed (a notification must not roll back a submission) but are
 * recorded via recordUgcOpsFailure so they are logged and counted — never silent.
 * A unique-key collision is an EXPECTED duplicate suppression, not a failure.
 *
 * @param {object} p
 * @param {string} p.event                one of UGC_NOTIFY_EVENT
 * @param {{id:string, affiliateId:string}} p.submission
 * @param {string}  [p.productTitle]
 * @param {string}  [p.affiliateLabel]
 * @param {string}  [p.reason]            rejection reason (REJECTED only)
 * @param {string}  [p.historyId]         the committed history row → idempotency key
 * @param {*}        p.db                 Prisma-like client
 * @param {Function} [p.onFailure]        injectable ops recorder (tests)
 * @returns {Promise<{affiliate:boolean, admin:boolean, duplicate:boolean}>}
 */
export async function emitUgcEvent({
  event, submission, productTitle, affiliateLabel, reason, historyId, db,
  onFailure = recordUgcOpsFailure,
}) {
  const result = { affiliate: false, admin: false, duplicate: false };
  if (!event || !submission || !db) return result;

  // Affiliate notification
  try {
    const message = affiliateMessage(event, { productTitle, reason });
    if (message && submission.affiliateId && db.affiliateNotification?.create) {
      const eventKey = buildEventKey({ submissionId: submission.id, historyId, event, audience: 'affiliate' });
      await db.affiliateNotification.create({
        data: { affiliateId: submission.affiliateId, message, ...(eventKey ? { eventKey } : {}) },
      });
      result.affiliate = true;
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      result.duplicate = true;   // already notified for this exact state change
    } else {
      onFailure({
        operation: UGC_OPS_OPERATION.NOTIFY_AFFILIATE,
        error: err,
        context: { event, submissionId: submission.id, affiliateId: submission.affiliateId },
      });
    }
  }

  // Admin notification (review queue)
  try {
    const message = adminMessage(event, { productTitle, affiliateLabel });
    if (message && db.adminNotification?.create) {
      const eventKey = buildEventKey({ submissionId: submission.id, historyId, event, audience: 'admin' });
      await db.adminNotification.create({
        data: {
          type: ADMIN_NOTIFICATION_TYPE.UGC_REVIEW_PENDING,
          message,
          entityId: submission.id || null,
          ...(eventKey ? { eventKey } : {}),
        },
      });
      result.admin = true;
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      result.duplicate = true;
    } else {
      onFailure({
        operation: UGC_OPS_OPERATION.NOTIFY_ADMIN,
        error: err,
        context: { event, submissionId: submission.id },
      });
    }
  }

  return result;
}
