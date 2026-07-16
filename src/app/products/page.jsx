import { fetchProductsPage } from "@/lib/data/products";
import { getActiveCollections } from "@/lib/services/collectionService";
import { getStoreSettings } from "@/lib/getStoreSettings";
import ProductsClient from "./ProductsClient";
import { SITE_ORIGIN } from "@/lib/siteUrl";
import { PAGE_SIZE } from "@/lib/productFeed";

const PROD_ORIGIN = SITE_ORIGIN;

// Read the `collection` query value (string | null) from the resolved searchParams.
function readCollection(sp) {
  const c = sp?.collection;
  if (Array.isArray(c)) return c[0] || null;
  return typeof c === "string" && c.trim() ? c : null;
}

export async function generateMetadata({ searchParams }) {
  const sp         = await searchParams;
  const collection = readCollection(sp);
  const hasRef     = sp?.ref != null;

  const settings  = await getStoreSettings();
  const storeName = settings?.storeName || "ProPro Gift VIP";

  const title = collection
    ? `${collection} | ${storeName}`
    : `${storeName}`;
  const description = collection
    ? `${collection} — ${storeName}`
    : settings?.websiteDescription || storeName;

  // Canonical keeps only `collection`; affiliate (`ref`) and other params are
  // stripped so affiliate/share URLs collapse to one indexable URL.
  const canonical = collection
    ? `${PROD_ORIGIN}/products?collection=${encodeURIComponent(collection)}`
    : `${PROD_ORIGIN}/products`;

  return {
    title,
    description,
    alternates: { canonical },
    // Affiliate URLs (?ref=...) must not be indexed — but still followed.
    ...(hasRef ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function Page({ searchParams }) {
  const sp         = await searchParams;
  const collection = readCollection(sp);

  // First page only — server-rendered, so crawlers and the first paint both get
  // real product HTML. The collection filter now runs in SQL (case-insensitively)
  // instead of loading the whole catalogue and filtering it in JS.
  const firstPage = await fetchProductsPage({ collection, limit: PAGE_SIZE });

  let collectionBanner = null;
  if (collection) {
    try {
      const collections = await getActiveCollections();
      const match = collections.find(
        (c) => c.title?.toLowerCase() === collection.toLowerCase()
      );
      collectionBanner = match?.banner || null;
    } catch {
      collectionBanner = null;
    }
  }

  return (
    <ProductsClient
      initialProducts={firstPage.items}
      initialCursor={firstPage.nextCursor}
      initialHasMore={firstPage.hasMore}
      initialTotal={firstPage.total}
      selectedCollection={collection}
      collectionBanner={collectionBanner}
    />
  );
}
