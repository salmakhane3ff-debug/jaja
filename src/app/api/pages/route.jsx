/**
 * /api/pages
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    → all pages   [public]
 * POST   → create page [admin]
 * PUT    → update page [admin]
 * DELETE → delete page [admin]
 *
 * AUTH: the Edge middleware matcher excludes /api, so these exports are the only
 * gate. GET stays public — /pages and /pages/[slug] read it anonymously.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { getAllPosts, createPost } from '@/lib/services/postService';
import { getStoreSettings } from '@/lib/services/settingsService';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

// GET: Fetch all CMS pages
export async function GET() {
  try {
    const pages = await getAllPosts('Page');
    const { currencySymbol, storeCurrency } = await getStoreSettings();
    return Response.json(pages.map((p) => ({ ...p, currencySymbol, storeCurrency })));
  } catch (error) {
    console.error('Pages GET error:', error);
    return Response.json({ error: 'Failed to fetch pages' }, { status: 500 });
  }
}

// POST: Create a new CMS page
async function _POST(req) {
  try {
    const body = await req.json();
    const page = await createPost(body, 'Page');
    return Response.json(page, { status: 201 });
  } catch (error) {
    console.error('Pages POST error:', error);
    return Response.json({ error: 'Failed to create page' }, { status: 500 });
  }
}

// PUT: Update a CMS page by _id
async function _PUT(req) {
  try {
    const body = await req.json();
    const { _id, ...rest } = body;

    if (!_id) {
      return Response.json({ error: '_id is required for update' }, { status: 400 });
    }

    const { updatePost } = await import('@/lib/services/postService');
    const updated = await updatePost(_id, { ...rest, category: 'Page' });

    if (!updated) {
      return Response.json({ error: 'Page not found' }, { status: 404 });
    }

    return Response.json(updated);
  } catch (error) {
    console.error('Pages PUT error:', error);
    return Response.json({ error: 'Failed to update page' }, { status: 500 });
  }
}

// DELETE: Delete a CMS page by _id
async function _DELETE(req) {
  try {
    const body = await req.json();
    const { _id } = body;

    if (!_id) {
      return Response.json({ error: '_id is required for delete' }, { status: 400 });
    }

    const { deletePost } = await import('@/lib/services/postService');
    const deleted = await deletePost(_id);

    if (!deleted) {
      return Response.json({ error: 'Page not found' }, { status: 404 });
    }

    return Response.json({ message: 'Page deleted', _id });
  } catch (error) {
    console.error('Pages DELETE error:', error);
    return Response.json({ error: 'Failed to delete page' }, { status: 500 });
  }
}

export const POST = withAdminAuth(_POST);

export const PUT = withAdminAuth(_PUT);

export const DELETE = withAdminAuth(_DELETE);
