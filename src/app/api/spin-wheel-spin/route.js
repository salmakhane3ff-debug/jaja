/**
 * /api/spin-wheel-spin
 * POST — execute a spin; returns winning segment
 * GET  ?admin=true — analytics
 */

import { getConfig, pickWinner, recordEvent, getAnalytics } from '@/lib/services/spinWheelConfigService.js';
import { serverError, badRequest } from '@/lib/utils/apiResponse.js';

export async function POST(req) {
  try {
    const body = await req.json();
    const { sessionId, clickId } = body;
    if (!sessionId) return badRequest('sessionId required');

    const config = await getConfig();
    if (!config.isEnabled) return badRequest('Spin wheel is disabled');
    if (!config.segments.length) return badRequest('No segments configured');

    const ip        = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                   || req.headers.get('x-real-ip') || null;
    const userAgent = req.headers.get('user-agent') || null;

    const winner = pickWinner(config.segments);

    await recordEvent({
      sessionId,
      eventType:  'spin_win',
      segmentId:  winner.id,
      rewardType: winner.rewardType,
      couponCode: winner.rewardType === 'coupon' ? winner.couponCode : null,
      productId:  winner.rewardType === 'product' ? winner.productId : null,
      clickId:    clickId || null,
      ipAddress:  ip,
      userAgent,
    });

    return Response.json({
      segmentId:    winner.id,
      label:        winner.label,
      rewardType:   winner.rewardType,
      couponCode:   winner.couponCode || null,
      productId:    winner.productId  || null,
      minCartValue: winner.minCartValue,
      color:        winner.color,
      // position in segments array — used by frontend to calculate stop angle
      index:        config.segments.findIndex((s) => s.id === winner.id),
      total:        config.segments.length,
    });
  } catch (err) {
    console.error('SpinWheelSpin POST error:', err);
    return serverError('Spin failed');
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get('admin') !== 'true') return badRequest('Admin only');
    const stats = await getAnalytics();
    return Response.json(stats);
  } catch (err) {
    console.error('SpinWheelSpin GET error:', err);
    return serverError('Failed to fetch analytics');
  }
}

// Track additional events (view, click, reward_unlock, coupon_used, spin_conversion)
export async function PATCH(req) {
  try {
    const body = await req.json();
    const { sessionId, eventType, ...rest } = body;
    if (!sessionId || !eventType) return badRequest('sessionId + eventType required');

    await recordEvent({ sessionId, eventType, ...rest });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('SpinWheelSpin PATCH error:', err);
    return serverError('Failed to record event');
  }
}
