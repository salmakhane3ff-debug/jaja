/**
 * GET  /api/affiliate/notifications  → list of notifications
 * PUT  /api/affiliate/notifications  → mark all as read
 */

import { withAffiliateAuth }                         from '@/lib/middleware/withAffiliateAuth';
import {
  getAffiliateNotifications,
  markNotificationsRead,
} from '@/lib/services/affiliateSystemService';

async function getHandler(req, _ctx, decoded) {
  try {
    const notifications = await getAffiliateNotifications(decoded.affiliateId);
    return Response.json(notifications);
  } catch (err) {
    console.error('Affiliate notifications GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

async function putHandler(req, _ctx, decoded) {
  try {
    const result = await markNotificationsRead(decoded.affiliateId);
    return Response.json(result);
  } catch (err) {
    console.error('Affiliate notifications PUT error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export const GET = withAffiliateAuth(getHandler);
export const PUT = withAffiliateAuth(putHandler);
