/**
 * src/lib/controllers/spinWheelController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * POST  /api/spin-wheel          → record a new spin (public)
 * PATCH /api/spin-wheel          → update spin lifecycle flag (public)
 *   body { sessionId, copied: true }     → markPromoCopied
 *   body { promoCode, orderId }          → markSpinOrdered
 * GET   /api/spin-wheel?admin=true       → spin stats (admin)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  createSpinEvent,
  markPromoCopied,
  markSpinOrdered,
  getSpinStats,
} from '../services/spinWheelService.js';
import { badRequest, serverError } from '../utils/apiResponse.js';

// ── GET /api/spin-wheel ───────────────────────────────────────────────────────

export async function getSpinWheelHandler(req) {
  try {
    const stats = await getSpinStats();
    return Response.json(stats);
  } catch (err) {
    console.error('SpinWheel GET error:', err);
    return serverError('Failed to fetch spin stats');
  }
}

// ── POST /api/spin-wheel ──────────────────────────────────────────────────────

export async function createSpinEventHandler(req) {
  try {
    const body = await req.json();

    const event = await createSpinEvent({
      sessionId: body.sessionId ?? null,
      prize:     body.prize     ?? null,
      prizeType: body.prizeType ?? 'none',
      promoCode: body.promoCode ?? null,
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                 ?? req.headers.get('x-real-ip')
                 ?? null,
      userAgent: req.headers.get('user-agent') ?? null,
    });

    return Response.json(event, { status: 201 });
  } catch (err) {
    console.error('SpinWheel POST error:', err);
    return serverError('Failed to record spin event');
  }
}

// ── PATCH /api/spin-wheel ─────────────────────────────────────────────────────

export async function updateSpinEventHandler(req) {
  try {
    const body = await req.json();

    // Branch 1 — mark promo code as ordered (called from checkout success)
    if (body.promoCode && body.orderId) {
      const updated = await markSpinOrdered(body.promoCode, body.orderId);
      // Silently succeed even if no matching spin found (non-critical path)
      return Response.json({ ok: true, updated: !!updated });
    }

    // Branch 2 — mark promo code as copied
    if (body.sessionId && body.copied === true) {
      const updated = await markPromoCopied(body.sessionId);
      return Response.json({ ok: true, updated: !!updated });
    }

    return badRequest(
      'Provide either { promoCode, orderId } or { sessionId, copied: true }',
    );
  } catch (err) {
    console.error('SpinWheel PATCH error:', err);
    return serverError('Failed to update spin event');
  }
}
