/**
 * src/lib/controllers/collectionController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles /api/collection requests.
 * Response shape mirrors the original MongoDB implementation so the product
 * admin form (which uses `c.title` as the Select key) works without changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getAllCollections,
  getHomepageCollections,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection,
} from '../services/collectionService.js';
import { badRequest, notFound, serverError } from '../utils/apiResponse.js';

// ── GET /api/collection ───────────────────────────────────────────────────────

export async function getCollectionsHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const isHomepage = searchParams.get('homepage') === 'true';
    const collections = isHomepage ? await getHomepageCollections() : await getAllCollections();
    return Response.json(collections.map((c) => ({ ...c, _id: c.id })));
  } catch (err) {
    console.error('Collection GET error:', err);
    return serverError('Failed to fetch collections');
  }
}

// ── POST /api/collection ──────────────────────────────────────────────────────

export async function createCollectionHandler(req) {
  try {
    const body = await req.json();
    const collection = await createCollection(body);
    return Response.json(collection, { status: 201 });
  } catch (err) {
    console.error('Collection POST error:', err?.message ?? err);
    if (err.code === 'P2002') {
      return Response.json({ error: 'A collection with that title already exists' }, { status: 400 });
    }
    return Response.json({ error: err?.message ?? 'Failed to create collection' }, { status: 500 });
  }
}

// ── PUT /api/collection ───────────────────────────────────────────────────────

export async function updateCollectionHandler(req) {
  try {
    const body = await req.json();
    const { _id, id } = body;
    const collectionId = _id || id;

    if (!collectionId) return badRequest('_id is required');

    const collection = await updateCollection(collectionId, body);
    if (!collection) return notFound('Collection not found');

    return Response.json(collection);
  } catch (err) {
    console.error('Collection PUT error:', err?.message ?? err);
    if (err.code === 'P2002') {
      return Response.json({ error: 'A collection with that title already exists' }, { status: 400 });
    }
    return Response.json({ error: err?.message ?? 'Failed to update collection' }, { status: 500 });
  }
}

// ── DELETE /api/collection ────────────────────────────────────────────────────

export async function deleteCollectionHandler(req) {
  try {
    const body = await req.json();
    const { _id, id } = body;
    const collectionId = _id || id;

    if (!collectionId) return badRequest('_id is required');

    const deleted = await deleteCollection(collectionId);
    if (!deleted) return notFound('Collection not found');

    return Response.json({ message: 'Deleted successfully', _id: collectionId });
  } catch (err) {
    console.error('Collection DELETE error:', err);
    return serverError('Failed to delete collection');
  }
}
