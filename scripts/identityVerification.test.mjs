#!/usr/bin/env node
/**
 * scripts/identityVerification.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Affiliate identity verification (CIN) — validation, state machine, admin
 * actions, private-path safety, and the withdrawal gate. In-memory fake db +
 * injected storage stubs — no real database, no sharp, no filesystem.
 * Run: node scripts/identityVerification.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { isAcceptedCinType, validateCinUpload, resolveCinPath, CIN_MAX_BYTES } from '../src/lib/identityStorage.js';
import {
  getIdentityStatus, isIdentityApproved, submitIdentity,
  adminApproveIdentity, adminRejectIdentity, adminResetIdentity,
} from '../src/lib/services/identityService.js';
import { requestPayout } from '../src/lib/services/affiliateSystemService.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };
const codeOf = async (fn) => { try { await fn(); return null; } catch (e) { return e.code || 'ERR'; } };

console.log('1) File validation (backend-authoritative):');
{
  ok('jpeg accepted', isAcceptedCinType('image/jpeg'));
  ok('png accepted', isAcceptedCinType('image/png'));
  ok('webp accepted', isAcceptedCinType('image/webp'));
  ok('gif rejected', !isAcceptedCinType('image/gif'));
  ok('pdf rejected', !isAcceptedCinType('application/pdf'));
  ok('valid file → no errors', validateCinUpload({ mime: 'image/png', size: 1024 }).length === 0);
  ok('bad type flagged', validateCinUpload({ mime: 'image/gif', size: 1024 }).includes('type'));
  ok('oversize flagged', validateCinUpload({ mime: 'image/png', size: CIN_MAX_BYTES + 1 }).includes('size'));
  ok('exactly 5MB accepted', validateCinUpload({ mime: 'image/png', size: CIN_MAX_BYTES }).length === 0);
  ok('empty file flagged', validateCinUpload({ mime: 'image/png', size: 0 }).includes('size'));
}

console.log('2) Private path safety (no traversal / no public exposure):');
{
  ok('safe filename resolves', typeof resolveCinPath('abc-123.jpg') === 'string');
  ok('parent traversal rejected', resolveCinPath('../secret.jpg') === null);
  ok('absolute path rejected', resolveCinPath('/etc/passwd') === null);
  ok('nested path rejected', resolveCinPath('a/b.jpg') === null);
  ok('empty rejected', resolveCinPath('') === null);
}

// ── Fake db for identity rows ─────────────────────────────────────────────────
function makeDb(initialRow = null) {
  const store = { row: initialRow };
  return {
    _store: store,
    identityVerification: {
      findUnique: async ({ where }) => {
        if (where.affiliateId && store.row?.affiliateId === where.affiliateId) return { ...store.row };
        if (where.id && store.row?.id === where.id) return { ...store.row };
        return null;
      },
      upsert: async ({ where, update, create }) => {
        store.row = store.row ? { ...store.row, ...update } : { id: 'v1', affiliateId: where.affiliateId, ...create };
        return { ...store.row };
      },
      update: async ({ where, data }) => { store.row = { ...store.row, ...data }; return { ...store.row }; },
      delete: async () => { store.row = null; return {}; },
    },
  };
}
const stubStorage = { process: async () => `key_${Math.random().toString(36).slice(2)}.jpg`, removeFile: async () => true };
const img = { buffer: Buffer.from('x'), mime: 'image/png', size: 2048 };

console.log('3) Status reads never leak file keys:');
{
  const empty = makeDb(null);
  ok('no row → NOT_SUBMITTED', (await getIdentityStatus('a', empty)).status === 'NOT_SUBMITTED');

  const approved = makeDb({ id: 'v1', affiliateId: 'a', status: 'APPROVED', approvedAt: new Date('2026-01-01'), cinFrontFile: 'secret.jpg', cinBackFile: 'secret2.jpg' });
  const s = await getIdentityStatus('a', approved);
  ok('approved status surfaced', s.status === 'APPROVED' && s.approvedAt != null);
  ok('NO file keys in affiliate status', !('cinFrontFile' in s) && !('cinBackFile' in s));
  ok('isIdentityApproved true', (await isIdentityApproved('a', approved)) === true);

  const rejected = makeDb({ id: 'v1', affiliateId: 'a', status: 'REJECTED', rejectionReason: 'Flou' });
  ok('rejected reason surfaced', (await getIdentityStatus('a', rejected)).rejectionReason === 'Flou');
  ok('isIdentityApproved false when rejected', (await isIdentityApproved('a', rejected)) === false);
}

console.log('4) Submission state machine + double-submit prevention:');
{
  ok('both images required', (await codeOf(() => submitIdentity('a', { front: img }, makeDb(null), stubStorage))) === 'CIN_BOTH_REQUIRED');

  const approvedDb = makeDb({ affiliateId: 'a', status: 'APPROVED' });
  ok('cannot resubmit when APPROVED', (await codeOf(() => submitIdentity('a', { front: img, back: img }, approvedDb, stubStorage))) === 'IDENTITY_ALREADY_APPROVED');

  const pendingDb = makeDb({ affiliateId: 'a', status: 'PENDING' });
  ok('cannot double-submit when PENDING', (await codeOf(() => submitIdentity('a', { front: img, back: img }, pendingDb, stubStorage))) === 'IDENTITY_ALREADY_PENDING');

  const badType = { buffer: Buffer.from('x'), mime: 'application/pdf', size: 10 };
  ok('invalid file rejected before storage', (await codeOf(() => submitIdentity('a', { front: badType, back: img }, makeDb(null), stubStorage))) === 'CIN_INVALID_FILE');

  // Fresh valid submission → PENDING with stored keys.
  const freshDb = makeDb(null);
  const res = await submitIdentity('a', { front: img, back: img }, freshDb, stubStorage);
  ok('valid submission → PENDING', res.status === 'PENDING');
  ok('both file keys stored on the row', Boolean(freshDb._store.row.cinFrontFile && freshDb._store.row.cinBackFile));
  ok('submittedAt recorded', freshDb._store.row.submittedAt instanceof Date);

  // Resubmission after REJECTED is allowed → PENDING again.
  const rejDb = makeDb({ affiliateId: 'a', status: 'REJECTED', rejectionReason: 'x', cinFrontFile: 'old.jpg', cinBackFile: 'old2.jpg' });
  const r2 = await submitIdentity('a', { front: img, back: img }, rejDb, stubStorage);
  ok('resubmit after REJECTED → PENDING', r2.status === 'PENDING' && rejDb._store.row.rejectionReason === null);
}

console.log('5) Admin approve / reject / reset:');
{
  const db = makeDb({ id: 'v1', affiliateId: 'a', status: 'PENDING', cinFrontFile: 'f.jpg', cinBackFile: 'b.jpg' });
  const appr = await adminApproveIdentity('v1', 'admin@x.com', db);
  ok('approve → APPROVED + approvedAt', appr.status === 'APPROVED' && db._store.row.approvedAt instanceof Date);
  ok('approvedBy recorded', db._store.row.approvedBy === 'admin@x.com');

  ok('reject requires a reason', (await codeOf(() => adminRejectIdentity('v1', '   ', db))) === 'REJECTION_REASON_REQUIRED');
  const rej = await adminRejectIdentity('v1', 'Photo illisible', db);
  ok('reject → REJECTED + reason', rej.status === 'REJECTED' && db._store.row.rejectionReason === 'Photo illisible');

  const reset = await adminResetIdentity('v1', db);
  ok('reset removes the row (→ NOT_SUBMITTED)', reset.reset === true && db._store.row === null);
}

console.log('6) Withdrawal gate — identity must be APPROVED (server-side):');
{
  // Fake db: complete bank info, tunable identity status, minimal tx plumbing.
  const makePayoutDb = (identityStatus) => {
    const s = { txEntered: false };
    return {
      _s: s,
      affiliate: { findUnique: async () => ({ bankName: 'CIH', accountName: 'A B', rib: '1234567890123' }) },
      identityVerification: { findUnique: async () => (identityStatus ? { status: identityStatus } : null) },
      $transaction: async (fn) => { s.txEntered = true; return fn(makePayoutTx()); },
    };
  };
  const makePayoutTx = () => ({
    affiliateOrder: { aggregate: async () => ({ _sum: { commissionAmount: 0 } }) },
    affiliate: { findUnique: async () => ({ bonusBalance: 0 }) },
    affiliatePayout: { aggregate: async () => ({ _sum: { amount: null } }), create: async ({ data }) => ({ id: 'p1', ...data }) },
    ugcEarning: { aggregate: async () => ({ _sum: { amount: null } }) },
  });

  const noRow = makePayoutDb(null);
  ok('no verification → blocked', (await codeOf(() => requestPayout('a', 10, noRow))) === 'IDENTITY_NOT_VERIFIED');
  ok('balance tx never entered when identity blocks', noRow._s.txEntered === false);

  const pending = makePayoutDb('PENDING');
  ok('PENDING → blocked', (await codeOf(() => requestPayout('a', 10, pending))) === 'IDENTITY_NOT_VERIFIED');

  const rejected = makePayoutDb('REJECTED');
  ok('REJECTED → blocked', (await codeOf(() => requestPayout('a', 10, rejected))) === 'IDENTITY_NOT_VERIFIED');

  // APPROVED → passes the identity gate (then fails later on insufficient balance).
  const approved = makePayoutDb('APPROVED');
  const code = await codeOf(() => requestPayout('a', 10, approved));
  ok('APPROVED → passes identity gate (reaches balance tx)', approved._s.txEntered === true && code === 'INSUFFICIENT_BALANCE');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
