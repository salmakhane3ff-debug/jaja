import { getAllPosts, createPost } from '@/lib/services/postService';
import { getStoreSettings } from '@/lib/services/settingsService';

// GET: Fetch all blog posts
export async function GET() {
  try {
    const posts = await getAllPosts('Blog');
    const { currencySymbol, storeCurrency } = await getStoreSettings();
    return Response.json(posts.map((p) => ({ ...p, currencySymbol, storeCurrency })));
  } catch (error) {
    console.error('Blog GET error:', error);
    return Response.json({ error: 'Failed to fetch blog posts' }, { status: 500 });
  }
}

// POST: Create a new blog post
export async function POST(req) {
  try {
    const body = await req.json();
    const post = await createPost(body, 'Blog');
    return Response.json(post, { status: 201 });
  } catch (error) {
    console.error('Blog POST error:', error);
    return Response.json({ error: 'Failed to create blog post' }, { status: 500 });
  }
}

// PUT: Update a blog post by _id
export async function PUT(req) {
  try {
    const body = await req.json();
    const { _id, ...rest } = body;

    if (!_id) {
      return Response.json({ error: '_id is required for update' }, { status: 400 });
    }

    const { updatePost } = await import('@/lib/services/postService');
    const updated = await updatePost(_id, { ...rest, category: 'Blog' });

    if (!updated) {
      return Response.json({ error: 'Blog post not found' }, { status: 404 });
    }

    return Response.json(updated);
  } catch (error) {
    console.error('Blog PUT error:', error);
    return Response.json({ error: 'Failed to update blog post' }, { status: 500 });
  }
}

// DELETE: Delete a blog post by _id
export async function DELETE(req) {
  try {
    const body = await req.json();
    const { _id } = body;

    if (!_id) {
      return Response.json({ error: '_id is required for delete' }, { status: 400 });
    }

    const { deletePost } = await import('@/lib/services/postService');
    const deleted = await deletePost(_id);

    if (!deleted) {
      return Response.json({ error: 'Blog post not found' }, { status: 404 });
    }

    return Response.json({ message: 'Blog post deleted', _id });
  } catch (error) {
    console.error('Blog DELETE error:', error);
    return Response.json({ error: 'Failed to delete blog post' }, { status: 500 });
  }
}
