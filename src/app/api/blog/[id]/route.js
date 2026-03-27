import { getPostById } from '@/lib/services/postService';
import { getStoreSettings } from '@/lib/services/settingsService';

// GET /api/blog/[id]
export async function GET(req, context) {
  const { id } = await context.params;

  try {
    const post = await getPostById(id, 'Blog');

    if (!post) {
      return Response.json({ error: 'Blog post not found' }, { status: 404 });
    }

    const { currencySymbol, storeCurrency } = await getStoreSettings();
    return Response.json({ ...post, currencySymbol, storeCurrency });
  } catch (error) {
    console.error('Blog GET by ID error:', error);
    return Response.json({ error: 'Failed to fetch blog post' }, { status: 500 });
  }
}
