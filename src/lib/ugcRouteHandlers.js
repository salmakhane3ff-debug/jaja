/**
 * src/lib/ugcRouteHandlers.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The bodies of the UGC API routes, as dependency-injected handlers. The route
 * files are thin: they wire the real deps + auth wrapper. Tests wire fake deps
 * and drive the handlers directly (identity, validation, error mapping, note
 * stripping, admin-only actions, pagination, settings) — which routeAuth alone
 * cannot cover.
 *
 * IDENTITY: affiliate handlers ALWAYS take the id from the authenticated session
 * argument (`decoded.affiliateId`), never from the request body/form.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ugcService as realService } from './services/ugcService.js';
import { getUgcStats as realGetUgcStats } from './services/ugcEarningsService.js';
import { getSettings as realGetSettings, upsertSettings as realUpsertSettings } from './services/settingsService.js';
import {
  recordUgcSettingsChange as realRecordSettingsChange,
  listUgcSettingsHistory as realListSettingsHistory,
} from './services/ugcAuditService.js';
import { extractUploadedVideo as realExtractVideo } from './ugcUpload.js';
import { normalizeUgcSettings, estimatePotentialEarnings, assertValidUgcSettings } from './ugcSettings.js';
import { ugcErrorResponse } from './ugcHttp.js';

const json = (data, status = 200) => Response.json(data, { status });

// ── Affiliate ─────────────────────────────────────────────────────────────────
export function affiliateUgcHandlers(deps = {}) {
  const {
    service = realService,
    getUgcStats = realGetUgcStats,
    getSettings = realGetSettings,
    extractVideo = realExtractVideo,
  } = deps;

  return {
    async list(decoded) {
      try {
        const [submissions, stats] = await Promise.all([
          service.listForAffiliate({ affiliateId: decoded.affiliateId }),
          getUgcStats(decoded.affiliateId),
        ]);
        return json({ submissions, stats, hasSubmitted: submissions.length > 0 });
      } catch (e) { return ugcErrorResponse(e); }
    },

    async create(req, decoded) {
      try {
        const { videoBuffer, form } = await extractVideo(req, { required: true });
        const settings = await getSettings('ugc');
        const consent = form.get('advertisingConsent');
        const sub = await service.createSubmission({
          affiliateId: decoded.affiliateId,          // session — body affiliateId is ignored
          productId: form.get('productId'),
          videoBuffer,
          description: form.get('description') || null,
          advertisingConsent: consent === 'true' || consent === true,
          settings,
        });
        return json({ submission: service.serializeForAffiliate(sub) }, 201);
      } catch (e) { return ugcErrorResponse(e); }
    },

    async getOne(id, decoded) {
      try {
        return json({ submission: await service.getForAffiliate({ submissionId: id, affiliateId: decoded.affiliateId }) });
      } catch (e) { return ugcErrorResponse(e); }
    },

    async replace(req, id, decoded) {
      try {
        const { videoBuffer, form } = await extractVideo(req, { required: true });
        const settings = await getSettings('ugc');
        const description = form.get('description') === null ? undefined : (form.get('description') || null);
        const sub = await service.replaceSubmission({ submissionId: id, affiliateId: decoded.affiliateId, videoBuffer, description, settings });
        return json({ submission: service.serializeForAffiliate(sub) });
      } catch (e) { return ugcErrorResponse(e); }
    },

    async pauseResume(id, decoded, action) {
      try {
        if (action !== 'pause' && action !== 'resume') return json({ error: 'unknown action', code: 'UGC_BAD_INPUT' }, 400);
        const toStatus = action === 'pause' ? 'PAUSED' : 'RUNNING';
        const sub = await service.transitionStatus({ submissionId: id, toStatus, actorId: decoded.affiliateId, actorType: 'AFFILIATE' });
        return json({ submission: service.serializeForAffiliate(sub) });
      } catch (e) { return ugcErrorResponse(e); }
    },

    async settings() {
      try {
        const raw = await getSettings('ugc');
        const s = normalizeUgcSettings(raw);
        return json({
          enabled: s.enabled,
          commissionPerSale: s.commissionPerSale,
          instructions: s.instructions,
          exampleVideoUrl: s.exampleVideoUrl,
          minVideoSeconds: s.minVideoSeconds,
          maxVideoSeconds: s.maxVideoSeconds,
          maxUploadBytes: s.maxUploadBytes,
          estimate: estimatePotentialEarnings(raw),
        });
      } catch (e) { return ugcErrorResponse(e); }
    },
  };
}

// ── Admin ─────────────────────────────────────────────────────────────────────
const ADMIN_ACTION_TO_STATUS = { approve: 'APPROVED', reject: 'REJECTED', start: 'RUNNING', pause: 'PAUSED', resume: 'RUNNING' };

export function adminUgcHandlers(deps = {}) {
  const {
    service = realService,
    getSettings = realGetSettings,
    upsertSettings = realUpsertSettings,
    recordSettingsChange = realRecordSettingsChange,
    listSettingsHistory = realListSettingsHistory,
  } = deps;

  return {
    async list(query) {
      try {
        return json(await service.listForAdmin({
          status: query.status || undefined,
          affiliateId: query.affiliateId || undefined,
          productId: query.productId || undefined,
          page: query.page || 1,
          pageSize: query.pageSize || 20,
        }));
      } catch (e) { return ugcErrorResponse(e); }
    },

    async getOne(id) {
      try { return json({ submission: await service.getForAdmin({ submissionId: id }) }); }
      catch (e) { return ugcErrorResponse(e); }
    },

    async patch(id, body, adminId) {
      try {
        const action = body?.action;
        const toStatus = ADMIN_ACTION_TO_STATUS[action];
        if (!toStatus) return json({ error: 'unknown action', code: 'UGC_BAD_INPUT' }, 400);

        // APPROVE goes through the orchestration so `defaultApprovedStatus` takes
        // effect (APPROVED, or composed APPROVED→RUNNING). Every other action is a
        // single explicit edge.
        const sub = action === 'approve'
          ? await service.approveSubmission({
              submissionId: id, actorId: adminId,
              settings: await getSettings('ugc'),
              reason: body.reason, internalNote: body.internalNote,
            })
          : await service.transitionStatus({
              submissionId: id, toStatus, actorId: adminId, actorType: 'ADMIN',
              reason: body.reason, internalNote: body.internalNote,
            });
        return json({ submission: service.serializeForAdmin(sub) });
      } catch (e) { return ugcErrorResponse(e); }
    },

    async getSettings() {
      try {
        const [raw, history] = await Promise.all([getSettings('ugc'), listSettingsHistory({ limit: 20 })]);
        return json({ settings: normalizeUgcSettings(raw), history });
      } catch (e) { return ugcErrorResponse(e); }
    },

    /**
     * Save settings and APPEND an audit row describing exactly what changed.
     * The audit is best-effort (recordSettingsChange never throws) so it can
     * never block an admin from saving.
     */
    async saveSettings(body, adminId) {
      try {
        const before = await getSettings('ugc');           // snapshot for the diff
        const validated = assertValidUgcSettings(body);    // throws UGC_INVALID_SETTINGS
        const saved = await upsertSettings('ugc', validated);
        const audit = await recordSettingsChange({ actorId: adminId, before, after: saved });
        return json({
          settings: normalizeUgcSettings(saved),
          changes: audit?.changes || [],
          earningsAffecting: audit?.earningsAffecting === true,
        });
      } catch (e) { return ugcErrorResponse(e); }
    },
  };
}
