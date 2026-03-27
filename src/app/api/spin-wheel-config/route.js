/**
 * /api/spin-wheel-config
 * GET  — public config for storefront (isEnabled check)
 * GET  ?admin=true — full config + segments for admin panel
 * PUT  — update config + segments (admin)
 */

import { getConfig, updateConfig, replaceSegments } from '@/lib/services/spinWheelConfigService.js';
import { serverError } from '@/lib/utils/apiResponse.js';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const admin = searchParams.get('admin') === 'true';
    const config = await getConfig();

    if (!admin) {
      // Storefront only needs enabled status + segments (stripped of internal ids)
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
    }

    return Response.json(config);
  } catch (err) {
    console.error('SpinWheelConfig GET error:', err);
    return serverError('Failed to fetch spin wheel config');
  }
}

export async function PUT(req) {
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
