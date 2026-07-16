/**
 * GET /api/products/feed
 * ─────────────────────────────────────────────────────────────────────────────
 * Keyset-paginated Active product feed for the All-Products infinite scroll.
 *
 *   ?cursor=<opaque>   page cursor from the previous response (omit → first page)
 *   ?limit=16          page size (default 16, capped at 48)
 *   ?collection=<name> case-insensitive collection ("category") filter
 *   ?q=<text>          search over title / shortDescription / description
 *
 * → { items: [...], nextCursor: string|null, hasMore: boolean, total: number|null }
 *
 * NOTE: this is a NEW endpoint. /api/products keeps its original bare-array
 * contract untouched — admin, checkout, cart and homepage all still depend on it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getProductsPage } from "@/lib/services/productService";
import { clampLimit } from "@/lib/productFeed";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const cursor     = searchParams.get("cursor") || null;
    const collection = searchParams.get("collection") || null;
    const q          = searchParams.get("q") || null;
    const limit      = clampLimit(searchParams.get("limit"));

    const page = await getProductsPage({ cursor, limit, collection, q });

    // Browsing pages are identical for everyone and cheap to revalidate; search
    // responses are per-user noise and must not fill a shared CDN cache.
    const cacheHeader = q
      ? "no-store"
      : "public, max-age=60, stale-while-revalidate=300";

    return Response.json(page, { headers: { "Cache-Control": cacheHeader } });
  } catch (err) {
    console.error("GET /api/products/feed error:", err);
    return Response.json({ error: "Failed to load products" }, { status: 500 });
  }
}
