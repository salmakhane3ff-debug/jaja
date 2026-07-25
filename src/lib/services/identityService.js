/**
 * src/lib/services/identityService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Affiliate identity verification (CIN) business logic.
 *
 * Statuses: NOT_SUBMITTED (no row) | PENDING | APPROVED | REJECTED.
 * Sensitive file keys (cinFrontFile / cinBackFile) NEVER leave this module in an
 * affiliate-facing shape — `getIdentityStatus` returns only status + metadata.
 * Documents are streamed exclusively through the admin route via
 * `getCinFileForAdmin`. All DB access is injectable (`db`) for unit tests.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';
import {
  validateCinUpload, processAndStoreCin, readCinByKey, deleteCinByKey,
} from '../identityStorage.js';

export const IDENTITY_STATUS = { NOT_SUBMITTED: 'NOT_SUBMITTED', PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' };

/** Affiliate-facing status — NO file keys ever. Absence of a row = NOT_SUBMITTED. */
export async function getIdentityStatus(affiliateId, db = prisma) {
  const row = await db.identityVerification.findUnique({ where: { affiliateId } });
  if (!row) return { status: 'NOT_SUBMITTED', rejectionReason: null, submittedAt: null, approvedAt: null };
  return {
    status:          row.status,
    rejectionReason: row.status === 'REJECTED' ? (row.rejectionReason || null) : null,
    submittedAt:     row.submittedAt,
    approvedAt:      row.status === 'APPROVED' ? row.approvedAt : null,
  };
}

/** True only when the affiliate's identity is APPROVED (withdrawal gate). */
export async function isIdentityApproved(affiliateId, db = prisma) {
  const row = await db.identityVerification.findUnique({ where: { affiliateId }, select: { status: true } });
  return row?.status === 'APPROVED';
}

/**
 * Submit (or resubmit) both CIN images. Backend-authoritative validation.
 * Blocks double submission: only allowed from NOT_SUBMITTED or REJECTED.
 *
 * @param {string} affiliateId
 * @param {{front:{buffer:Buffer,mime:string,size:number}, back:{...}}} files
 * @returns {Promise<{status:string}>}
 */
export async function submitIdentity(affiliateId, files, db = prisma, storage = { process: processAndStoreCin, removeFile: deleteCinByKey }) {
  const front = files?.front;
  const back  = files?.back;
  if (!front || !back) {
    throw Object.assign(new Error('Les deux faces de la CIN sont requises.'), { code: 'CIN_BOTH_REQUIRED' });
  }

  const existing = await db.identityVerification.findUnique({ where: { affiliateId } });
  if (existing?.status === 'APPROVED') {
    throw Object.assign(new Error('Votre identité est déjà vérifiée.'), { code: 'IDENTITY_ALREADY_APPROVED' });
  }
  if (existing?.status === 'PENDING') {
    throw Object.assign(new Error('Une vérification est déjà en cours.'), { code: 'IDENTITY_ALREADY_PENDING' });
  }

  // Validate BOTH before touching storage (type + size, server-side).
  const frontErr = validateCinUpload({ mime: front.mime, size: front.size });
  const backErr  = validateCinUpload({ mime: back.mime,  size: back.size });
  if (frontErr.length || backErr.length) {
    throw Object.assign(new Error('Fichier invalide (type JPG/PNG/WEBP, max 5 Mo).'), {
      code: 'CIN_INVALID_FILE', details: { front: frontErr, back: backErr },
    });
  }

  // Normalize + store privately (sharp re-encode also rejects non-images).
  const frontKey = await storage.process(front.buffer);
  const backKey  = await storage.process(back.buffer);

  // Replace old (rejected) files if any.
  if (existing?.cinFrontFile) await storage.removeFile(existing.cinFrontFile);
  if (existing?.cinBackFile)  await storage.removeFile(existing.cinBackFile);

  await db.identityVerification.upsert({
    where:  { affiliateId },
    update: { status: 'PENDING', cinFrontFile: frontKey, cinBackFile: backKey, rejectionReason: null, submittedAt: new Date(), approvedAt: null, approvedBy: null },
    create: { affiliateId, status: 'PENDING', cinFrontFile: frontKey, cinBackFile: backKey, submittedAt: new Date() },
  });

  return { status: 'PENDING' };
}

// ── Admin ────────────────────────────────────────────────────────────────────

/** List all verification requests (admin). Includes affiliate identity, NO file keys. */
export async function adminListIdentityVerifications(db = prisma) {
  const rows = await db.identityVerification.findMany({
    orderBy: { submittedAt: 'desc' },
    include: { affiliate: { select: { id: true, name: true, username: true, phone: true } } },
  });
  return rows.map((r) => ({
    id:              r.id,
    affiliateId:     r.affiliateId,
    affiliateName:   r.affiliate?.name || null,
    username:        r.affiliate?.username || null,
    phone:          r.affiliate?.phone || null,
    status:          r.status,
    rejectionReason: r.rejectionReason || null,
    submittedAt:     r.submittedAt,
    approvedAt:      r.approvedAt,
    approvedBy:      r.approvedBy || null,
    hasFront:        Boolean(r.cinFrontFile),
    hasBack:         Boolean(r.cinBackFile),
  }));
}

export async function adminApproveIdentity(id, adminId = null, db = prisma) {
  const row = await db.identityVerification.update({
    where: { id },
    data:  { status: 'APPROVED', approvedAt: new Date(), approvedBy: adminId, rejectionReason: null },
  });
  return { id: row.id, status: row.status, approvedAt: row.approvedAt };
}

export async function adminRejectIdentity(id, reason, db = prisma) {
  const clean = String(reason || '').trim();
  if (!clean) throw Object.assign(new Error('Le motif de refus est requis.'), { code: 'REJECTION_REASON_REQUIRED' });
  const row = await db.identityVerification.update({
    where: { id },
    data:  { status: 'REJECTED', rejectionReason: clean, approvedAt: null, approvedBy: null },
  });
  return { id: row.id, status: row.status, rejectionReason: row.rejectionReason };
}

/** Reset a verification (delete files + row) so the affiliate can re-upload. */
export async function adminResetIdentity(id, db = prisma) {
  const row = await db.identityVerification.findUnique({ where: { id } });
  if (!row) return { reset: false };
  if (row.cinFrontFile) await deleteCinByKey(row.cinFrontFile);
  if (row.cinBackFile)  await deleteCinByKey(row.cinBackFile);
  await db.identityVerification.delete({ where: { id } });
  return { reset: true };
}

/** Stream one CIN side for an admin. side ∈ 'front' | 'back'. Returns null if missing. */
export async function getCinFileForAdmin(id, side, db = prisma) {
  const row = await db.identityVerification.findUnique({ where: { id } });
  if (!row) return null;
  const key = side === 'back' ? row.cinBackFile : row.cinFrontFile;
  if (!key) return null;
  return readCinByKey(key);
}
