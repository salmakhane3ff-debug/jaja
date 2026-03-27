/**
 * /api/data
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic collection CRUD — Prisma-backed replacement for the retired MongoDB
 * /api/data endpoint.  Uses the ContentItem model (content_items table).
 *
 * GET    ?collection=<name>                  → list all items in collection
 * POST   { collection, title, image, url, …} → create new item
 * PUT    { collection, _id, title, image, … } → full-replace item data
 * DELETE { collection, _id }                 → delete item
 *
 * Response shape mirrors the original MongoDB API so existing admin pages
 * require zero changes:
 *   GET  → [{ _id, ...fields, createdAt, updatedAt }]
 *   POST → { _id, ...fields, createdAt, updatedAt }
 *   PUT  → { _id, ...fields, createdAt, updatedAt }
 *   DELETE → { ok: true }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getItems,
  createItem,
  updateItem,
  deleteItem,
} from '@/lib/services/contentService';

// ── GET ?collection=<name> ───────────────────────────────────────────────────

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const collection = searchParams.get('collection');

    if (!collection) {
      return Response.json({ error: 'collection query param required' }, { status: 400 });
    }

    const items = await getItems(collection);
    return Response.json(items);
  } catch (err) {
    console.error('[/api/data GET]', err);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── POST { collection, ...data } ─────────────────────────────────────────────

export async function POST(req) {
  try {
    const body = await req.json();
    const { collection, _id, ...fields } = body;

    if (!collection) {
      return Response.json({ error: 'collection is required' }, { status: 400 });
    }

    const item = await createItem(collection, fields);
    return Response.json(item, { status: 201 });
  } catch (err) {
    console.error('[/api/data POST]', err);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── PUT { collection, _id, ...data } ─────────────────────────────────────────

export async function PUT(req) {
  try {
    const body = await req.json();
    const { collection, _id, id, ...fields } = body;
    const itemId = _id || id;

    if (!itemId) {
      return Response.json({ error: '_id is required' }, { status: 400 });
    }

    const item = await updateItem(itemId, fields);
    if (!item) {
      return Response.json({ error: 'Item not found' }, { status: 404 });
    }
    return Response.json(item);
  } catch (err) {
    console.error('[/api/data PUT]', err);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── DELETE { collection, _id } ───────────────────────────────────────────────

export async function DELETE(req) {
  try {
    const body = await req.json();
    const { _id, id } = body;
    const itemId = _id || id;

    if (!itemId) {
      return Response.json({ error: '_id is required' }, { status: 400 });
    }

    const deleted = await deleteItem(itemId);
    if (!deleted) {
      return Response.json({ error: 'Item not found' }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[/api/data DELETE]', err);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
