/**
 * src/lib/services/imageService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD for the `images` table.
 * Replaces the MongoDB Images collection used by /api/image.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

/** Map a Prisma Image row to the MongoDB-compatible shape { _id, name, url, ... }. */
function mapImage(image) {
  const { id, ...rest } = image;
  return { _id: id, ...rest };
}

/** Fetch all image records, newest first. */
export async function getAllImages() {
  const images = await prisma.image.findMany({ orderBy: { createdAt: 'desc' } });
  return images.map(mapImage);
}

/** Create a new image record. */
export async function createImage({ name, url }) {
  const image = await prisma.image.create({ data: { name, url } });
  return mapImage(image);
}

/** Update an image record by UUID id. Returns null when not found. */
export async function updateImage(id, data) {
  const existing = await prisma.image.findUnique({ where: { id } });
  if (!existing) return null;
  const updated = await prisma.image.update({ where: { id }, data });
  return mapImage(updated);
}

/** Delete an image record by UUID id. Returns the deleted record or null. */
export async function deleteImage(id) {
  const existing = await prisma.image.findUnique({ where: { id } });
  if (!existing) return null;
  const deleted = await prisma.image.delete({ where: { id } });
  return mapImage(deleted);
}
