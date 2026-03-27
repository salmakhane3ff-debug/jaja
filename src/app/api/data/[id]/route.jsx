/**
 * /api/data/[id]
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles PUT and DELETE for a specific content item by URL-param ID.
 *
 * PUT    /api/data/<uuid>  { collection, ...fields } → replace item data
 * DELETE /api/data/<uuid>                            → delete item
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { updateItem, deleteItem } from '@/lib/services/contentService';

export async function PUT(req, context) {
  try {
    const { id } = await context.params;
    const body = await req.json();

    // Strip meta fields; everything else becomes the new data payload
    // eslint-disable-next-line no-unused-vars
    const { collection, _id, id: bodyId, createdAt, updatedAt, ...data } = body ?? {};

    const item = await updateItem(id, data);
    if (!item) {
      return Response.json({ error: 'Item not found' }, { status: 404 });
    }
    return Response.json(item);
  } catch (err) {
    console.error('PUT /api/data/[id] error:', err);
    return Response.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

export async function DELETE(req, context) {
  try {
    const { id } = await context.params;

    const deleted = await deleteItem(id);
    if (!deleted) {
      return Response.json({ error: 'Item not found' }, { status: 404 });
    }
    return Response.json({ message: 'Deleted successfully', _id: id });
  } catch (err) {
    console.error('DELETE /api/data/[id] error:', err);
    return Response.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
