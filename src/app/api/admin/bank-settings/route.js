/**
 * src/app/api/admin/bank-settings/route.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin-protected multi-bank & payment methods API.
 *
 * GET  /api/admin/bank-settings  → fetch current settings
 * PUT  /api/admin/bank-settings  → update settings
 *
 * Data shape:
 * {
 *   methods: [{ id, type, name, accountName, accountNumber, rib, swift, logo,
 *               isActive, paymentType, showOnlyIfFullPayment, showOnlyIfDeposit,
 *               instructions, sortOrder, enableMessageBeforePayment, whatsapp }],
 *   depositInstructions: string,
 * }
 *
 * Stored in Setting table under id = "bank-settings".
 * Publicly readable at GET /api/setting?type=bank-settings (checkout, affiliate).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { withAdminAuth }               from '@/lib/middleware/withAdminAuth';
import { getSettings, upsertSettings } from '@/lib/services/settingsService';
import { badRequest, serverError }     from '@/lib/utils/apiResponse';

const SETTING_KEY = 'bank-settings';

// ── GET ───────────────────────────────────────────────────────────────────────

export const GET = withAdminAuth(async () => {
  try {
    const data = await getSettings(SETTING_KEY);
    return Response.json({ ...data, _id: SETTING_KEY });
  } catch (err) {
    console.error('Bank settings GET error:', err);
    return serverError('Failed to fetch bank settings');
  }
});

// ── PUT ───────────────────────────────────────────────────────────────────────

export const PUT = withAdminAuth(async (req) => {
  try {
    const body = await req.json();

    // Validate each method
    const methods = Array.isArray(body.methods) ? body.methods : [];
    for (const m of methods) {
      if (!m.name?.trim()) {
        return badRequest(`Nom requis pour chaque méthode de paiement`);
      }
      // RIB is optional — local methods (CashPlus, WafaCash, etc.) don't need it
    }

    // Strip meta keys from top-level
    const { _id, id, createdAt, updatedAt, ...rest } = body;

    const payload = {
      ...rest,
      methods: methods.map((m) => ({
        id:                         m.id                    || '',
        type:                       m.type                  || 'bank',
        name:                       m.name?.trim()          || '',
        accountName:                m.accountName           || '',
        accountNumber:              m.accountNumber         || '',
        rib:                        m.rib                   || '',
        swift:                      m.swift                 || '',
        logo:                       m.logo                  || '',
        isActive:                   Boolean(m.isActive),
        paymentType:                m.paymentType           || 'prepaid',
        showOnlyIfFullPayment:      Boolean(m.showOnlyIfFullPayment),
        showOnlyIfDeposit:          Boolean(m.showOnlyIfDeposit),
        instructions:               m.instructions          || '',
        sortOrder:                  parseInt(m.sortOrder, 10) || 0,
        enableMessageBeforePayment: Boolean(m.enableMessageBeforePayment),
        whatsapp:                   m.whatsapp              || '',
      })),
      depositInstructions: body.depositInstructions || '',
    };

    const saved = await upsertSettings(SETTING_KEY, payload);
    return Response.json({ ...saved, _id: SETTING_KEY });
  } catch (err) {
    console.error('Bank settings PUT error:', err);
    return serverError('Failed to update bank settings');
  }
});
