#!/usr/bin/env node
/**
 * scripts/ugcRouteHandlers.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * RUNTIME route-handler tests with MOCKED services (refinement #3). routeAuth
 * proves the routes are *wrapped* in auth; these prove the handler behaviour that
 * auth-wrapping alone cannot:
 *   • identity ALWAYS from the session — a body/form affiliateId is ignored
 *   • multipart upload validation (via the injected extractVideo)
 *   • coded-error → HTTP status mapping
 *   • affiliate responses strip internalAdminNotes (real serializer)
 *   • admin-only actions (affiliate cannot approve/reject/start)
 *   • admin list pagination + filters pass-through
 *   • admin settings validation (real assertValidUgcSettings)
 *   • affiliate settings endpoint exposes ONLY intro fields (no engine config)
 *
 * The real serializers / settings validators are used; only the data-access
 * methods are stubbed — so no DB is touched. Run: node scripts/ugcRouteHandlers.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { affiliateUgcHandlers, adminUgcHandlers } from '../src/lib/ugcRouteHandlers.js';
import { ugcService as realService } from '../src/lib/services/ugcService.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };

const coded = (code) => Object.assign(new Error(code), { code });
const makeForm = (map) => ({ get: (k) => (k in map ? map[k] : null) });
const jsonReq = (body, contentType = 'application/json') => ({
  headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
  json: async () => body,
});
// A spy: records the last call args, returns `ret` or throws `throws`.
function spy(ret, throws) {
  const f = async (...args) => { f.calls.push(args); if (throws) throw throws; return typeof ret === 'function' ? ret(...args) : ret; };
  f.calls = [];
  return f;
}
// Fake service keeps the REAL serializers, stubs the data methods.
const svc = (over) => ({ ...realService, ...over });

const AFF = { affiliateId: 'AFF-1' };

console.log('1) identity is ALWAYS from the session — body/form affiliateId ignored:');
{
  const createSubmission = spy((a) => ({ id: 's1', ...a, status: 'PENDING' }));
  const extractVideo = spy({ videoBuffer: Buffer.from('x'), form: makeForm({ affiliateId: 'ATTACKER', productId: 'p1', advertisingConsent: 'true', description: 'hi' }) });
  const h = affiliateUgcHandlers({ service: svc({ createSubmission }), extractVideo, getSettings: spy({ enabled: true }), getUgcStats: spy({}) });
  const res = await h.create({}, AFF);
  ok('create used session affiliateId, not form value', createSubmission.calls[0][0].affiliateId === 'AFF-1');
  ok('create passed productId from form', createSubmission.calls[0][0].productId === 'p1');
  ok('create parsed consent=true', createSubmission.calls[0][0].advertisingConsent === true);
  ok('create returns 201', res.status === 201);

  const transitionStatus = spy((a) => ({ id: 's1', status: 'PAUSED', affiliateId: a.actorId }));
  const h2 = affiliateUgcHandlers({ service: svc({ transitionStatus }), getUgcStats: spy({}) });
  await h2.pauseResume('s1', AFF, 'pause');
  ok('affiliate pauseResume uses session actorId', transitionStatus.calls[0][0].actorId === 'AFF-1');
  ok('affiliate transitions are actorType AFFILIATE', transitionStatus.calls[0][0].actorType === 'AFFILIATE');
}

console.log('2) multipart upload validation (via injected extractVideo):');
{
  const mkCreate = (throws) => affiliateUgcHandlers({
    service: svc({ createSubmission: spy({ id: 's', status: 'PENDING' }) }),
    extractVideo: spy(undefined, throws), getSettings: spy({ enabled: true }),
  });
  ok('oversized upload → 413', (await mkCreate(coded('UGC_UPLOAD_TOO_LARGE')).create({}, AFF)).status === 413);
  ok('missing video → 400', (await mkCreate(coded('UGC_BAD_INPUT')).create({}, AFF)).status === 400);
  ok('non-video → 400', (await mkCreate(coded('UGC_INVALID_VIDEO')).create({}, AFF)).status === 400);
}

console.log('3) coded-error → HTTP status mapping:');
{
  const affWith = (over) => affiliateUgcHandlers({ service: svc(over), getUgcStats: spy({}) });
  ok('getForAffiliate UGC_NOT_FOUND → 404',
     (await affWith({ getForAffiliate: spy(undefined, coded('UGC_NOT_FOUND')) }).getOne('x', AFF)).status === 404);
  ok('getForAffiliate UGC_FORBIDDEN → 403',
     (await affWith({ getForAffiliate: spy(undefined, coded('UGC_FORBIDDEN')) }).getOne('x', AFF)).status === 403);
  ok('transition UGC_ILLEGAL_TRANSITION → 409',
     (await affWith({ transitionStatus: spy(undefined, coded('UGC_ILLEGAL_TRANSITION')) }).pauseResume('x', AFF, 'pause')).status === 409);
  ok('transition UGC_TRANSITION_CONFLICT → 409',
     (await affWith({ transitionStatus: spy(undefined, coded('UGC_TRANSITION_CONFLICT')) }).pauseResume('x', AFF, 'pause')).status === 409);
  const disabled = affiliateUgcHandlers({ service: svc({ createSubmission: spy(undefined, coded('UGC_DISABLED')) }),
    extractVideo: spy({ videoBuffer: Buffer.from('x'), form: makeForm({ productId: 'p' }) }), getSettings: spy({}) });
  ok('createSubmission UGC_DISABLED → 403', (await disabled.create({}, AFF)).status === 403);
  const unexpected = affWith({ getForAffiliate: spy(undefined, new Error('boom')) });
  ok('uncoded error → 500', (await unexpected.getOne('x', AFF)).status === 500);
}

console.log('4) affiliate responses strip internalAdminNotes (real serializer):');
{
  const dirty = { id: 's1', status: 'PENDING', videoUrl: 'u', internalAdminNotes: 'SECRET admin note' };
  const h = affiliateUgcHandlers({ service: svc({ createSubmission: spy(dirty) }),
    extractVideo: spy({ videoBuffer: Buffer.from('x'), form: makeForm({ productId: 'p', advertisingConsent: 'true' }) }), getSettings: spy({}) });
  const body = await (await h.create({}, AFF)).json();
  ok('created submission omits internalAdminNotes', !('internalAdminNotes' in body.submission));
  ok('created submission keeps public fields', body.submission.id === 's1' && body.submission.status === 'PENDING');

  const h2 = affiliateUgcHandlers({ service: svc({ transitionStatus: spy(dirty) }), getUgcStats: spy({}) });
  const body2 = await (await h2.pauseResume('s1', AFF, 'pause')).json();
  ok('pauseResume result omits internalAdminNotes', !('internalAdminNotes' in body2.submission));
}

console.log('5) admin-only actions — affiliate cannot approve/reject/start:');
{
  const transitionStatus = spy({ id: 's1', status: 'RUNNING' });
  const aff = affiliateUgcHandlers({ service: svc({ transitionStatus }), getUgcStats: spy({}) });
  ok('affiliate action "approve" → 400 unknown action', (await aff.pauseResume('s1', AFF, 'approve')).status === 400);
  ok('affiliate action "reject" → 400 unknown action', (await aff.pauseResume('s1', AFF, 'reject')).status === 400);
  ok('affiliate action "start" → 400 unknown action', (await aff.pauseResume('s1', AFF, 'start')).status === 400);
  ok('affiliate no-op actions never reach the service', transitionStatus.calls.length === 0);

  // APPROVE goes through the orchestration (so defaultApprovedStatus applies);
  // every other admin action is a single explicit edge via transitionStatus.
  const adminTransition = spy({ id: 's1', status: 'RUNNING' });
  const approveSubmission = spy({ id: 's1', status: 'APPROVED', internalAdminNotes: 'note' });
  const adminSettings = spy({ enabled: true, defaultApprovedStatus: 'RUNNING' });
  const admin = adminUgcHandlers({
    service: svc({ transitionStatus: adminTransition, approveSubmission }),
    getSettings: adminSettings, upsertSettings: spy({}),
  });

  const res = await admin.patch('s1', { action: 'approve', reason: 'looks good', internalNote: 'note' }, 'ADMIN-9');
  ok('admin approve → 200', res.status === 200);
  ok('approve uses the orchestration, not a raw transition', approveSubmission.calls.length === 1 && adminTransition.calls.length === 0);
  ok('approve receives the current settings (defaultApprovedStatus applies)', approveSubmission.calls[0][0].settings?.defaultApprovedStatus === 'RUNNING');
  ok('approve uses the passed adminId', approveSubmission.calls[0][0].actorId === 'ADMIN-9');
  ok('approve passes reason + internalNote', approveSubmission.calls[0][0].reason === 'looks good' && approveSubmission.calls[0][0].internalNote === 'note');
  const adminBody = await res.json();
  ok('admin view KEEPS internalAdminNotes', adminBody.submission.internalAdminNotes === 'note');

  // Non-approve actions still take the single-edge path.
  await admin.patch('s1', { action: 'start' }, 'ADMIN-9');
  ok('start uses transitionStatus', adminTransition.calls.length === 1 && adminTransition.calls[0][0].toStatus === 'RUNNING');
  ok('start transition actorType ADMIN', adminTransition.calls[0][0].actorType === 'ADMIN');
  await admin.patch('s1', { action: 'pause' }, 'ADMIN-9');
  ok('pause uses transitionStatus', adminTransition.calls[1][0].toStatus === 'PAUSED');
  ok('approve was not re-invoked by other actions', approveSubmission.calls.length === 1);

  ok('admin unknown action → 400', (await admin.patch('s1', { action: 'nope' }, 'ADMIN-9')).status === 400);
}

console.log('6) admin list pagination + filters pass-through:');
{
  const listForAdmin = spy({ items: [], total: 0, page: 2, pages: 0 });
  const admin = adminUgcHandlers({ service: svc({ listForAdmin }) });
  await admin.list({ status: 'RUNNING', affiliateId: 'a1', productId: 'p1', page: 2, pageSize: 50 });
  const args = listForAdmin.calls[0][0];
  ok('filters forwarded', args.status === 'RUNNING' && args.affiliateId === 'a1' && args.productId === 'p1');
  ok('pagination forwarded', args.page === 2 && args.pageSize === 50);
  await admin.list({});
  const empty = listForAdmin.calls[1][0];
  ok('empty filters → undefined (not empty string)', empty.status === undefined && empty.affiliateId === undefined && empty.productId === undefined);
  ok('defaults applied when absent', empty.page === 1 && empty.pageSize === 20);
}

console.log('7) admin settings validation (real assertValidUgcSettings):');
{
  const upsertSettings = spy((_id, v) => v);
  const admin = adminUgcHandlers({ service: svc({}), getSettings: spy({}), upsertSettings });
  const bad = await admin.saveSettings({ commissionPerSale: -5 });
  ok('invalid settings → 400', bad.status === 400);
  ok('invalid settings NOT persisted', upsertSettings.calls.length === 0);
  const good = await admin.saveSettings({ enabled: true, commissionPerSale: 4 });
  ok('valid settings → 200', good.status === 200);
  ok('valid settings persisted', upsertSettings.calls.length === 1);
  ok('persisted value is normalized (has all keys)', typeof upsertSettings.calls[0][1].pollIntervalMs === 'number');
}

console.log('8) affiliate settings endpoint exposes ONLY intro fields:');
{
  const raw = { enabled: true, commissionPerSale: 4, earningsEngineEnabled: true, pollIntervalMs: 3600000,
    instructions: ['film in daylight'], exampleVideoUrl: 'https://x/v.mp4', minGeneratedSales: 2, maxGeneratedSales: 8 };
  const h = affiliateUgcHandlers({ getSettings: spy(raw) });
  const body = await (await h.settings()).json();
  ok('exposes commissionPerSale', body.commissionPerSale === 4);
  ok('instructions is an array (rendered as text client-side)', Array.isArray(body.instructions));
  ok('exposes an estimate object', body.estimate && typeof body.estimate.maxEarning === 'number');
  ok('does NOT leak earningsEngineEnabled', !('earningsEngineEnabled' in body));
  ok('does NOT leak pollIntervalMs', !('pollIntervalMs' in body));
  ok('does NOT leak generation bounds', !('minGeneratedSales' in body) && !('maxGeneratedSales' in body));
}

console.log('9) UGC settings changes are audited (earnings-affecting flagged):');
{
  const upsertSettings = spy((_id, v) => v);
  const recordSettingsChange = spy((p) => ({ recorded: true, changes: [{ key: 'commissionPerSale', from: 4, to: 9, earningsAffecting: true }], earningsAffecting: true }));
  const listSettingsHistory = spy([{ id: 'h1', changes: [], earningsAffecting: false, createdAt: new Date().toISOString() }]);
  const getSettings = spy({ commissionPerSale: 4 });
  const admin = adminUgcHandlers({ service: svc({}), getSettings, upsertSettings, recordSettingsChange, listSettingsHistory });

  const res = await admin.saveSettings({ enabled: true, commissionPerSale: 9 }, 'ADMIN-7');
  const body = await res.json();
  ok('save succeeds', res.status === 200);
  ok('audit was recorded', recordSettingsChange.calls.length === 1);
  ok('audit carries the acting admin id', recordSettingsChange.calls[0][0].actorId === 'ADMIN-7');
  ok('audit gets the BEFORE snapshot', recordSettingsChange.calls[0][0].before.commissionPerSale === 4);
  ok('audit gets the AFTER value', recordSettingsChange.calls[0][0].after.commissionPerSale === 9);
  ok('response reports the changes', Array.isArray(body.changes) && body.changes[0].key === 'commissionPerSale');
  ok('response flags earnings impact', body.earningsAffecting === true);

  // Invalid settings must never be persisted NOR audited.
  const upsert2 = spy((_id, v) => v), record2 = spy({ recorded: false, changes: [] });
  const admin2 = adminUgcHandlers({ service: svc({}), getSettings: spy({}), upsertSettings: upsert2, recordSettingsChange: record2, listSettingsHistory: spy([]) });
  const bad = await admin2.saveSettings({ commissionPerSale: -5 }, 'ADMIN-7');
  ok('invalid settings → 400', bad.status === 400);
  ok('invalid settings not persisted', upsert2.calls.length === 0);
  ok('invalid settings not audited', record2.calls.length === 0);

  // GET exposes the history for the admin UI.
  const getRes = await admin.getSettings();
  const getBody = await getRes.json();
  ok('GET returns settings + history', Array.isArray(getBody.history) && getBody.history.length === 1);
  ok('history fetch was requested with a limit', listSettingsHistory.calls[0][0].limit === 20);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
