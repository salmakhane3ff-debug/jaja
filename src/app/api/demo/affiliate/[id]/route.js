/**
 * GET /api/demo/affiliate/:id
 * Lazy-loaded full details for the modal popup.
 */
import { getDemoAffiliateDetails } from '@/lib/services/demoService';

export async function GET(req, ctx) {
  try {
    const { id } = await ctx.params;
    const details = await getDemoAffiliateDetails(id);
    if (!details) return Response.json({ error: 'Introuvable' }, { status: 404 });
    return Response.json(details);
  } catch (err) {
    console.error('demo/affiliate/[id] error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
