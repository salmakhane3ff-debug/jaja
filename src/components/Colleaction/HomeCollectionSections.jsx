"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { useDiscountRules } from "@/hooks/useDiscountRules";

// ── Product Card ──────────────────────────────────────────────────────────────

const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|ogv)(\?.*)?$/i;
function getProductImageUrl(images) {
  const list = Array.isArray(images) ? images : [];
  const found = list.find(img => {
    const url = (img?.url || img || "");
    return !VIDEO_EXT.test(url);
  });
  return found?.url || found || "https://placehold.co/400x400?text=No+Image";
}

function ProductCard({ product, formatPrice, getDiscount }) {
  const imageUrl     = getProductImageUrl(product.images);
  const discountRule = getDiscount ? getDiscount(product) : null;
  const price        = discountRule ? discountRule.effectivePrice : (product.salePrice || product.regularPrice);
  const href         = `/products/${product._id || product.id}`;

  return (
    <div className="bg-white rounded-3xl border border-purple-50 p-2 flex flex-col shadow-sm hover:shadow-md transition-all duration-300">
      <Link href={href}>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 mb-3 aspect-square">
          <img
            src={imageUrl}
            alt={product.title}
            className="absolute inset-0 w-full h-full object-cover object-top"
            loading="lazy"
          />
          {product.productLabel && (
            <span className={`absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-semibold rounded-md backdrop-blur-sm ${
              product.productLabel === "New"  ? "bg-blue-500 text-white"
              : product.productLabel === "Hot"  ? "bg-red-500 text-white"
              : product.productLabel === "Sale" ? "bg-pink-500 text-white"
              : "bg-gray-800 text-white"
            }`}>
              {product.productLabel}
            </span>
          )}
          {discountRule && (
            <span className="absolute bottom-2 right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
              -{discountRule.percentage}%
            </span>
          )}
        </div>
      </Link>
      <div className="px-1 pb-1 flex flex-col flex-1">
        <Link href={href}>
          <h3 className="text-sm font-bold text-gray-900 line-clamp-1 leading-tight mb-1">{product.title}</h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-base font-bold text-gray-900">{formatPrice(price)}</span>
            {(discountRule || (product.salePrice && product.regularPrice > 0)) && (
              <span className="text-xs line-through text-gray-400">
                {formatPrice(discountRule ? discountRule.originalPrice : product.regularPrice)}
              </span>
            )}
          </div>
        </Link>
      </div>
    </div>
  );
}

// ── Collection Section ────────────────────────────────────────────────────────

function CollectionSection({ collection, allProducts, formatPrice, t, getDiscount }) {
  const limit = collection.homepageProductLimit || 4;

  const products = allProducts
    .filter((p) =>
      Array.isArray(p.collections) &&
      p.collections.some((c) => c.toLowerCase() === collection.title.toLowerCase())
    )
    .slice(0, limit);

  return (
    <section className="md:mt-16 mt-10">
      <div className="max-w-7xl mx-auto px-4 mb-6 text-center">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900">{collection.title}</h2>
        {collection.description && (
          <p className="text-sm text-gray-500 mt-1">{collection.description}</p>
        )}
      </div>

      {products.length === 0 && (
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-sm text-gray-400 italic">
            No products assigned to this collection yet. Go to Admin → Products and set the collection to &quot;{collection.title}&quot;.
          </p>
        </div>
      )}

      {products.length > 0 && (
        <>
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4">
              {products.map((product) => (
                <ProductCard
                  key={product._id || product.id}
                  product={product}
                  formatPrice={formatPrice}
                  getDiscount={getDiscount}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-center mt-8">
            <Link href={`/products?collection=${encodeURIComponent(collection.title)}`}>
              <button className="px-8 py-2 bg-gray-900 text-white text-sm font-semibold rounded-2xl hover:bg-gray-700 transition-colors">
                {t("product_view_more")}
              </button>
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

// ── Single Collection Section (used by Homepage Builder) ──────────────────────
// Renders products from ONE specific collection by title.

export function SingleCollectionSection({ collectionTitle, collectionId, productLimit = 8, customTitle = "", showViewMore = true }) {
  const [allProducts, setAllProducts] = useState([]);
  const [collection,  setCollection]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const { formatPrice, t } = useLanguage();
  const { getDiscount } = useDiscountRules();

  useEffect(() => {
    if (!collectionTitle && !collectionId) { setLoading(false); return; }
    Promise.all([
      fetch("/api/collection", { cache: "no-store" }).then(r => r.ok ? r.json() : []),
      fetch("/api/product",    { cache: "no-store" }).then(r => r.ok ? r.json() : []),
    ])
      .then(([cols, prods]) => {
        const col = cols.find(c =>
          (collectionId && (c._id || c.id) === collectionId) ||
          (collectionTitle && c.title.toLowerCase() === collectionTitle.toLowerCase())
        );
        setCollection(col || null);
        setAllProducts(Array.isArray(prods) ? prods : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [collectionTitle, collectionId]);

  if (loading) return null;
  if (!collection) return null;

  const products = allProducts
    .filter(p =>
      Array.isArray(p.collections) &&
      p.collections.some(c => c.toLowerCase() === collection.title.toLowerCase())
    )
    .slice(0, productLimit);

  const heading = customTitle || collection.title;

  return (
    <section>
      <div className="max-w-7xl mx-auto px-4 mb-6 text-center">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900">{heading}</h2>
        {collection.description && (
          <p className="text-sm text-gray-500 mt-1">{collection.description}</p>
        )}
      </div>

      {products.length === 0 ? (
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-sm text-gray-400 italic">
            No products assigned to &quot;{collection.title}&quot; yet.
          </p>
        </div>
      ) : (
        <>
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4">
              {products.map(product => (
                <ProductCard key={product._id || product.id} product={product} formatPrice={formatPrice} getDiscount={getDiscount} />
              ))}
            </div>
          </div>
          {showViewMore && (
            <div className="flex justify-center mt-8">
              <Link href={`/products?collection=${encodeURIComponent(collection.title)}`}>
                <button className="px-8 py-2 bg-gray-900 text-white text-sm font-semibold rounded-2xl hover:bg-gray-700 transition-colors">
                  {t("product_view_more")}
                </button>
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function HomeCollectionSections() {
  const [collections,  setCollections]  = useState([]);
  const [allProducts,  setAllProducts]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const { formatPrice, t } = useLanguage();
  const { getDiscount } = useDiscountRules();

  useEffect(() => {
    async function load() {
      try {
        const [colRes, prodRes] = await Promise.all([
          fetch("/api/collection?homepage=true", { cache: "no-store" }),
          fetch("/api/product",                  { cache: "no-store" }),
        ]);
        if (colRes.ok)  setCollections(await colRes.json());
        if (prodRes.ok) setAllProducts(await prodRes.json());
      } catch (e) {
        console.error("HomeCollectionSections fetch error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading || collections.length === 0) return null;

  return (
    <>
      {collections.map((col) => (
        <div key={col._id || col.id}>
          <CollectionSection
            collection={col}
            allProducts={allProducts}
            formatPrice={formatPrice}
            t={t}
            getDiscount={getDiscount}
          />
        </div>
      ))}
    </>
  );
}
