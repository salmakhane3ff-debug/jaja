import { fetchAllProducts } from "@/lib/data/products";
import { getActiveCollections } from "@/lib/services/collectionService";
import { getStoreSettings } from "@/lib/getStoreSettings";
import ProductsClient from "./ProductsClient";

const PROD_ORIGIN = "https://proprogiftvip.com";

// Read the `collection` query value (string | null) from the resolved searchParams.
function readCollection(sp) {
  const c = sp?.collection;
  if (Array.isArray(c)) return c[0] || null;
  return typeof c === "string" && c.trim() ? c : null;
}

// Server-side collection filter — same matching the client used to do.
function filterByCollection(products, collection) {
  if (!collection) return products;
  return products.filter(
    (p) =>
      Array.isArray(p.collections) &&
      p.collections.some((c) => c.toLowerCase() === collection.toLowerCase())
  );
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

  const allProducts = await fetchAllProducts();
  const products    = filterByCollection(allProducts, collection);

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
      initialProducts={products}
      selectedCollection={collection}
      collectionBanner={collectionBanner}
    />
  );
}
