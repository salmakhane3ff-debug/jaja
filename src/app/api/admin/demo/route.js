/**
 * GET  /api/admin/demo          → settings + competition info
 * POST /api/admin/demo          → generate demo affiliates
 * PUT  /api/admin/demo          → save settings (isEnabled, simulationSpeed)
 */
import {
  getDemoSettings,
  saveDemoSettings,
  getCompetitionInfo,
  generateDemoAffiliates,
} from '@/lib/services/demoService';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const GET = withAdminAuth(async () => {
  try {
    const [settings, competition] = await Promise.all([
      getDemoSettings(),
      getCompetitionInfo(),
    ]);
    return Response.json({ settings, competition });
  } catch (err) {
    console.error('admin/demo GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});

export const POST = withAdminAuth(async (req) => {
  try {
    const body  = await req.json().catch(() => ({}));
    const count = Math.min(100, Math.max(10, parseInt(body.count || 60, 10)));
    const result = await generateDemoAffiliates(count);
    return Response.json(result);
  } catch (err) {
    console.error('admin/demo POST error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});

export const PUT = withAdminAuth(async (req) => {
  try {
    const body = await req.json();
    const saved = await saveDemoSettings(body);
    return Response.json(saved);
  } catch (err) {
    console.error('admin/demo PUT error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});
