/**
 * /api/spin-wheel-config
 * GET              — public config for storefront (isEnabled + segments)
 * GET ?admin=true  — full config + segments for admin panel (admin — requires auth)
 * PUT              — update config + segments (admin)
 */

import { getConfig, updateConfig, replaceSegments } from '@/lib/services/spinWheelConfigService.js';
import { serverError } from '@/lib/utils/apiResponse.js';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('admin') === 'true') {
    return withAdminAuth(_getAdmin)(req);
  }
  return _getPublic(req);
}

async function _getPublic(_req) {
  try {
    const config = await getConfig();
    if (!config.isEnabled) return Response.json({ isEnabled: false });
    return Response.json({
      isEnabled:    config.isEnabled,
      deviceTarget: config.deviceTarget,
      pageTarget:   config.pageTarget,
      triggerType:  config.triggerType,
      triggerValue: config.triggerValue,
      title:        config.title,
      subtitle:     config.subtitle,
      segments:     config.segments,
    });
  } catch (err) {
    console.error('SpinWheelConfig GET error:', err);
    return serverError('Failed to fetch spin wheel config');
  }
}

async function _getAdmin(_req) {
  try {
    const config = await getConfig();
    return Response.json(config);
  } catch (err) {
    console.error('SpinWheelConfig GET (admin) error:', err);
    return serverError('Failed to fetch spin wheel config');
  }
}

async function _PUT(req) {
  try {
    const body = await req.json();
    const config = await getConfig();

    const { segments, ...configFields } = body;

    await updateConfig(config.id, configFields);
    if (Array.isArray(segments)) {
      await replaceSegments(config.id, segments);
    }

    const updated = await getConfig();
    return Response.json(updated);
  } catch (err) {
    console.error('SpinWheelConfig PUT error:', err);
    return serverError('Failed to update spin wheel config');
  }
}

export const PUT = withAdminAuth(_PUT);
