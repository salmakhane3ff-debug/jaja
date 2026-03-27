/**
 * src/lib/services/contentService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic CRUD for the `content_items` table.
 *
 * This is the Prisma-backed replacement for the retired MongoDB /api/data and
 * /api/delete endpoints.  Each row stores one "document" in a named collection
 * (e.g. "slider-image", "promo-text") as a JSONB `data` column.
 *
 * Response shape mirrors the original MongoDB shape expected by admin pages:
 *   { _id, ...dataFields, createdAt, updatedAt }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

// ── Internal mapper ────────────────────────────────────────────────────────────

/**
 * Flatten a ContentItem row into a MongoDB-compatible shape.
 * data JSONB fields are spread at the top level; `id` is aliased as `_id`.
 */
function mapItem(item) {
  if (!item) return null;
  const data = (item.data && typeof item.data === 'object') ? item.data : {};
  return {
    _id:       item.id,
    ...data,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

// ── Read ───────────────────────────────────────────────────────────────────────

/**
 * Return all items in a collection, newest first.
 * Each item is flattened so all data fields are at the top level.
 */
export async function getItems(collection) {
  const rows = await prisma.contentItem.findMany({
    where:   { collection },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mapItem);
}

/**
 * Return a single item by its UUID.  Returns null when not found.
 */
export async function getItemById(id) {
  const row = await prisma.contentItem.findUnique({ where: { id } });
  return mapItem(row);
}

// ── Write ──────────────────────────────────────────────────────────────────────

/**
 * Create a new item in a collection.
 * Pass all item-specific fields as the `data` object (collection is stored
 * separately and must NOT be inside the data payload).
 */
export async function createItem(collection, data) {
  const row = await prisma.contentItem.create({
    data: { collection, data },
  });
  return mapItem(row);
}

/**
 * Replace the data payload of an existing item (full replace, not merge).
 * Returns null when not found (Prisma P2025).
 */
export async function updateItem(id, data) {
  try {
    const row = await prisma.contentItem.update({
      where: { id },
      data:  { data },
    });
    return mapItem(row);
  } catch (err) {
    if (err.code === 'P2025') return null;
    throw err;
  }
}

/**
 * Merge partial fields into an existing item's data payload.
 * Useful for PATCH-style updates (e.g. toggling a `status` field).
 * Returns null when not found.
 */
export async function patchItem(id, patch) {
  const existing = await prisma.contentItem.findUnique({ where: { id } });
  if (!existing) return null;

  const currentData = (existing.data && typeof existing.data === 'object')
    ? existing.data
    : {};
  const merged = { ...currentData, ...patch };

  const row = await prisma.contentItem.update({
    where: { id },
    data:  { data: merged },
  });
  return mapItem(row);
}

// ── Delete ─────────────────────────────────────────────────────────────────────

/**
 * Delete an item by UUID.
 * Returns true on success, false when not found.
 */
export async function deleteItem(id) {
  try {
    await prisma.contentItem.delete({ where: { id } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return false;
    throw err;
  }
}
