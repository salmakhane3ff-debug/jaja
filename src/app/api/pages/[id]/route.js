import { getPostById } from '@/lib/services/postService';
import { getStoreSettings } from '@/lib/services/settingsService';

// GET /api/pages/[id]
export async function GET(req, context) {
  const { id } = await context.params;

  try {
    const page = await getPostById(id, 'Page');

    if (!page) {
      return Response.json({ error: 'Page not found' }, { status: 404 });
    }

    const { currencySymbol, storeCurrency } = await getStoreSettings();
    return Response.json({ ...page, currencySymbol, storeCurrency });
  } catch (error) {
    console.error('Pages GET by ID error:', error);
    return Response.json({ error: 'Failed to fetch page' }, { status: 500 });
  }
}
