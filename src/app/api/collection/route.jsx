/**
 * /api/collection
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    → all collections (active + inactive, for admin list)      [public]
 * POST   { title, slug?, description?, image? } → create collection  [admin]
 * PUT    { _id, ...fields }                      → update collection [admin]
 * DELETE { _id }                                 → delete collection [admin]
 *
 * Response shape is identical to the original MongoDB implementation:
 *   each document includes `_id` for backward compatibility.
 *
 * AUTH: the Edge middleware matcher excludes /api, so these exports are the only
 * gate. GET stays public — the storefront's HomeCollectionSections and
 * SliderCollection read it anonymously. Writes are admin-only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getCollectionsHandler,
  createCollectionHandler,
  updateCollectionHandler,
  deleteCollectionHandler,
} from '@/lib/controllers/collectionController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

// Public — read by the storefront collection sections/slider.
export const GET    = getCollectionsHandler;

export const POST   = withAdminAuth(createCollectionHandler);
export const PUT    = withAdminAuth(updateCollectionHandler);
export const DELETE = withAdminAuth(deleteCollectionHandler);
