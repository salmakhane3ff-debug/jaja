/**
 * GET  /api/admin/team-bonus-config  → returns current config
 * POST /api/admin/team-bonus-config  → saves new config
 */

import { getTeamBonusConfig, saveTeamBonusConfig } from '@/lib/services/affiliateSystemService';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const GET = withAdminAuth(async () => {
  try {
    const config = await getTeamBonusConfig();
    return Response.json(config);
  } catch (err) {
    console.error('team-bonus-config GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});

export const POST = withAdminAuth(async (req) => {
  try {
    const body = await req.json();
    const { requiredActiveAffiliates, bonusAmount, commissionTiers } = body;

    if (
      typeof requiredActiveAffiliates !== 'number' ||
      typeof bonusAmount !== 'number' ||
      !Array.isArray(commissionTiers) ||
      commissionTiers.length === 0
    ) {
      return Response.json({ error: 'Données invalides' }, { status: 400 });
    }

    const saved = await saveTeamBonusConfig({ requiredActiveAffiliates, bonusAmount, commissionTiers });
    return Response.json(saved);
  } catch (err) {
    console.error('team-bonus-config POST error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});
