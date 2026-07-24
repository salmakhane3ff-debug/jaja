/**
 * DELETE /api/admin/demo/avatars/[id] → remove one uploaded demo avatar   [admin]
 *
 * Only an admin deletes avatars. Already-assigned copies live on demo affiliate
 * rows (avatarUrl) and are NOT affected here — they remain until the next
 * generation, so a deleted library image never produces a broken affiliate avatar.
 */

import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { deleteDemoAvatar } from '@/lib/services/demoService';

export const dynamic = 'force-dynamic';

export const DELETE = withAdminAuth(async (_req, ctx) => {
  try {
    const { id } = await ctx.params;
    const res = await deleteDemoAvatar(id);
    return Response.json(res, { status: res.deleted ? 200 : 404 });
  } catch (err) {
    console.error('demo/avatars DELETE error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});
