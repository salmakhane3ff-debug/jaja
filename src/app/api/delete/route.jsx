/**
 * /api/delete
 * ─────────────────────────────────────────────────────────────────────────────
 * Legacy delete endpoint used by the promo-text admin page.
 * Accepts { collection, id } in the request body and deletes the matching
 * ContentItem row from PostgreSQL.
 *
 * DELETE { collection, id } → delete item by id
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { deleteItem } from '@/lib/services/contentService';

export async function DELETE(req) {
  try {
    const body = await req.json();
    // promo-text sends `id` (no underscore); support both `id` and `_id`
    const { id, _id } = body ?? {};
    const itemId = id || _id;

    if (!itemId) {
      return Response.json(
        { error: '`id` field is required in the request body' },
        { status: 400 }
      );
    }

    const deleted = await deleteItem(itemId);
    if (!deleted) {
      return Response.json({ error: 'Item not found' }, { status: 404 });
    }
    return Response.json({ message: 'Deleted successfully', id: itemId });
  } catch (err) {
    console.error('DELETE /api/delete error:', err);
    return Response.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
