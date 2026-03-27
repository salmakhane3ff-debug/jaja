/**
 * /api/collection
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    → all collections (active + inactive, for admin list)
 * POST   { title, slug?, description?, image? } → create collection
 * PUT    { _id, ...fields }                      → update collection
 * DELETE { _id }                                 → delete collection
 *
 * Response shape is identical to the original MongoDB implementation:
 *   each document includes `_id` for backward compatibility.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getCollectionsHandler,
  createCollectionHandler,
  updateCollectionHandler,
  deleteCollectionHandler,
} from '@/lib/controllers/collectionController';

export const GET    = getCollectionsHandler;
export const POST   = createCollectionHandler;
export const PUT    = updateCollectionHandler;
export const DELETE = deleteCollectionHandler;
