/**
 * /api/data
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic document-store endpoint backed by the `content_items` Prisma table.
 * Replaces the original MongoDB-based generic CRUD so all existing admin pages
 * (slider, promo-text, menu, support-benefits, contact, collection-section, …)
 * work without any frontend changes.
 *
 * GET    ?collection=<name>            → array of items
 * POST   { collection, ...fields }     → create item  (201)
 * PUT    { collection, _id, ...fields} → update item by _id
 * DELETE { collection, _id }           → delete item by _id
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getItems,
  createItem,
  updateItem,
  deleteItem,
} from '@/lib/services/contentService';

// ── GET /api/data?collection=<name> ──────────────────────────────────────────

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const collection = searchParams.get('collection');

    if (!collection) {
      return Response.json(
        { error: 'Query param `collection` is required' },
        { status: 400 }
      );
    }

    const items = await getItems(collection);
    return Response.json(items);
  } catch (err) {
    console.error('GET /api/data error:', err);
    return Response.json({ error: 'Failed to fetch items' }, { status: 500 });
  }
}

// ── POST /api/data ────────────────────────────────────────────────────────────

export async function POST(req) {
  try {
    const body = await req.json();
    // eslint-disable-next-line no-unused-vars
    const { collection, _id, id, createdAt, updatedAt, ...data } = body ?? {};

    if (!collection) {
      return Response.json(
        { error: '`collection` field is required in the request body' },
        { status: 400 }
      );
    }

    const item = await createItem(collection, data);
    return Response.json(item, { status: 201 });
  } catch (err) {
    console.error('POST /api/data error:', err);
    return Response.json({ error: 'Failed to create item' }, { status: 500 });
  }
}

// ── PUT /api/data ─────────────────────────────────────────────────────────────

export async function PUT(req) {
  try {
    const body = await req.json();
    // eslint-disable-next-line no-unused-vars
    const { collection, _id, id, createdAt, updatedAt, ...data } = body ?? {};
    const itemId = _id || id;

    if (!itemId) {
      return Response.json(
        { error: '`_id` field is required in the request body' },
        { status: 400 }
      );
    }

    const item = await updateItem(itemId, data);
    if (!item) {
      return Response.json({ error: 'Item not found' }, { status: 404 });
    }
    return Response.json(item);
  } catch (err) {
    console.error('PUT /api/data error:', err);
    return Response.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

// ── DELETE /api/data ──────────────────────────────────────────────────────────

export async function DELETE(req) {
  try {
    const body = await req.json();
    const { _id, id } = body ?? {};
    const itemId = _id || id;

    if (!itemId) {
      return Response.json(
        { error: '`_id` field is required in the request body' },
        { status: 400 }
      );
    }

    const deleted = await deleteItem(itemId);
    if (!deleted) {
      return Response.json({ error: 'Item not found' }, { status: 404 });
    }
    return Response.json({ message: 'Deleted successfully', _id: itemId });
  } catch (err) {
    console.error('DELETE /api/data error:', err);
    return Response.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
