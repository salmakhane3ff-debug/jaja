/**
 * /api/admin/fake-orders
 * GET  → { configs, affiliates, products }  (admin Fake Orders panel data)
 * PUT  → upsert one affiliate's fake-order config
 * DELETE ?affiliateId= → remove a config
 */
import prisma from '@/lib/prisma';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import {
  listFakeOrderConfigs,
  upsertFakeOrderConfig,
  deleteFakeOrderConfig,
} from '@/lib/services/fakeOrderService';

export const dynamic = 'force-dynamic';

export const GET = withAdminAuth(async () => {
  try {
    const [configs, affiliates, products] = await Promise.all([
      listFakeOrderConfigs(),
      prisma.affiliate.findMany({
        where:   { isActive: true },
        select:  { id: true, username: true, name: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.findMany({
        where:   { isActive: true },
        select:  { id: true, title: true },
        orderBy: { createdAt: 'desc' },
        take:    500,
      }),
    ]);
    return Response.json({ configs, affiliates, products });
  } catch (err) {
    console.error('admin/fake-orders GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});

export const PUT = withAdminAuth(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const affiliateId = String(body.affiliateId || '').trim();
    if (!affiliateId) return Response.json({ error: 'affiliateId requis' }, { status: 400 });

    // Guard the FK — only configure real, existing affiliates.
    const exists = await prisma.affiliate.count({ where: { id: affiliateId } });
    if (!exists) return Response.json({ error: 'Affilié introuvable' }, { status: 404 });

    const config = await upsertFakeOrderConfig(affiliateId, body);
    return Response.json(config);
  } catch (err) {
    console.error('admin/fake-orders PUT error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});

export const DELETE = withAdminAuth(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const affiliateId = searchParams.get('affiliateId');
    if (!affiliateId) return Response.json({ error: 'affiliateId requis' }, { status: 400 });
    await deleteFakeOrderConfig(affiliateId);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('admin/fake-orders DELETE error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});
