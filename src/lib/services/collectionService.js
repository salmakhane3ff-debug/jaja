/**
 * src/lib/services/collectionService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD for the `collections` table.
 * Collections are the store's product categories (e.g. "Electronics").
 * The product form sends `collections: string[]` (array of titles); the
 * storefront filters products by collection title.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

/** Return all collections, active ones first then alphabetical. */
export async function getAllCollections() {
  return prisma.collection.findMany({
    orderBy: [{ isActive: 'desc' }, { title: 'asc' }],
  });
}

/** Return collections marked to show on homepage, ordered by homepageOrder. */
export async function getHomepageCollections() {
  const rows = await prisma.collection.findMany({
    where:   { isActive: true, showOnHomepage: true },
    orderBy: { homepageOrder: 'asc' },
  });
  return rows.map(mapCollection);
}

/** Return only active collections (for storefront / product form). */
export async function getActiveCollections() {
  return prisma.collection.findMany({
    where:   { isActive: true },
    orderBy: { title: 'asc' },
  });
}

/** Fetch a single collection by UUID. Returns null when not found. */
export async function getCollectionById(id) {
  return prisma.collection.findUnique({ where: { id } });
}

/** Create a new collection. Returns the created row with `_id` alias. */
export async function createCollection(body) {
  const {
    title, description, image, banner, slug,
    isActive, showOnHomepage, homepageOrder, homepageProductLimit,
  } = body ?? {};

  const data = {
    ...(title              !== undefined && { title }),
    ...(description        !== undefined && { description }),
    ...(image              !== undefined && { image: image || null }),
    ...(banner             !== undefined && { banner: banner || null }),
    ...(slug               !== undefined && { slug: slug || null }),
    ...(isActive           !== undefined && { isActive }),
    ...(showOnHomepage     !== undefined && { showOnHomepage }),
    ...(homepageOrder      !== undefined && { homepageOrder }),
    ...(homepageProductLimit !== undefined && { homepageProductLimit }),
  };

  const collection = await prisma.collection.create({ data });
  return mapCollection(collection);
}

/**
 * Update a collection by UUID.
 * Returns null when not found.
 */
export async function updateCollection(id, body) {
  const {
    _id, id: _bodyId, createdAt: _createdAt, updatedAt: _updatedAt,
    title, description, image, banner, slug,
    isActive, showOnHomepage, homepageOrder, homepageProductLimit,
  } = body ?? {};

  // Build a safe update object with only known Collection fields
  const data = {
    ...(title              !== undefined && { title }),
    ...(description        !== undefined && { description }),
    ...(image              !== undefined && { image: image || null }),
    ...(banner             !== undefined && { banner: banner || null }),
    ...(slug               !== undefined && { slug: slug || null }),
    ...(isActive           !== undefined && { isActive }),
    ...(showOnHomepage     !== undefined && { showOnHomepage }),
    ...(homepageOrder      !== undefined && { homepageOrder }),
    ...(homepageProductLimit !== undefined && { homepageProductLimit }),
  };

  try {
    const collection = await prisma.collection.update({ where: { id }, data });
    return mapCollection(collection);
  } catch (err) {
    if (err.code === 'P2025') return null;
    throw err;
  }
}

/** Delete a collection by UUID. Returns true on success, false if not found. */
export async function deleteCollection(id) {
  try {
    await prisma.collection.delete({ where: { id } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return false;
    throw err;
  }
}

// ── Mapper ─────────────────────────────────────────────────────────────────────

/** Add `_id` alias so any admin page using `collection._id` keeps working. */
function mapCollection(c) {
  if (!c) return null;
  return { ...c, _id: c.id };
}
