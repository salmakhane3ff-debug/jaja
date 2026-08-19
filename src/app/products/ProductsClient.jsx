"use client";

import { useEffect, useState, useCallback } from "react";
import { Skeleton } from "@heroui/skeleton";
import { Input } from "@heroui/react";
import { Search, X, RotateCw } from "lucide-react";
import Empty from "@/components/block/Empty";
import ProductCard from "@/components/Product/ProductCard";
import { useLanguage } from "@/context/LanguageContext";
import { useDiscountRules } from "@/hooks/useDiscountRules";
import { useProductFeed } from "@/hooks/useProductFeed";

// WHY: Static array defined once outside the component — avoids recreating
// Array.from(...) on every render cycle during loading state.
const SKELETON_ITEMS = Array.from({ length: 8 }, (_, i) => i);

const GRID_CLASS = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 px-4";

function SkeletonCards() {
  return SKELETON_ITEMS.map((idx) => (
    <div key={`sk-${idx}`} className="bg-white rounded-xl overflow-hidden">
      <Skeleton className="w-full aspect-square rounded-none" />
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  ));
}

export default function ProductsClient({
  initialProducts = [],
  initialCursor = null,
  initialHasMore = false,
  initialTotal = null,
  selectedCollection = null,
  collectionBanner = null,
}) {
  const [wishlist, setWishlist] = useState([]);
  const { formatPrice, t } = useLanguage();
  const { getDiscount } = useDiscountRules();

  // The feed owns the search text (still debounced 300ms, still server-side): on
  // back-navigation it must restore the query together with the list it produced.
  const {
    items, total, hasMore, loading, error, sentinelRef, retry, loadMore,
    query: searchQuery, setQuery: setSearchQuery, activeQuery,
  } = useProductFeed({
    initialItems: initialProducts,
    initialCursor,
    initialHasMore,
    initialTotal,
    collection: selectedCollection,
  });

  const handleClearSearch = useCallback(() => setSearchQuery(""), [setSearchQuery]);

  // WHY: useCallback keeps this reference stable so memo()'d ProductCards do not
  // all re-render when unrelated state changes.
  const handleWishlist = useCallback((product, e) => {
    e.preventDefault();
    e.stopPropagation();

    const wishlistItem = {
      productId: product._id,
      title: product.title,
      image: product.images?.[0],
      price: product.salePrice || product.regularPrice,
      regularPrice: product.regularPrice,
      salePrice: product.salePrice,
      currency: "MAD",
      rating: product.rating,
      productLabel: product.productLabel,
      addedAt: new Date().toISOString(),
    };

    setWishlist((prev) => {
      const exists = prev.some((item) => item.productId === product._id);
      const updated = exists
        ? prev.filter((item) => item.productId !== product._id)
        : [...prev, wishlistItem];
      localStorage.setItem("wishlist", JSON.stringify(updated));
      window.dispatchEvent(new Event("wishlistUpdated"));
      return updated;
    });
  }, []);

  const isInWishlist = useCallback(
    (productId) => wishlist.some((item) => item.productId === productId),
    [wishlist]
  );

  // Load wishlist on mount
  useEffect(() => {
    const savedWishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
    setWishlist(savedWishlist);
  }, []);

  const isSearching  = activeQuery.length > 0;
  const showEmpty    = !loading && !error && items.length === 0;
  const foundCount   = total ?? items.length;

  return (
    <div className="min-h-screen">
      {/* Collection Banner */}
      {collectionBanner && (
        <div className="w-full relative overflow-hidden" style={{ paddingBottom: "37.5%" }}>
          <img
            src={collectionBanner}
            alt={selectedCollection}
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
          />
        </div>
      )}

      <div className="md:px-20 py-10 container mx-auto">
      <h1 suppressHydrationWarning className="md:text-2xl text-lg font-bold mb-6 text-center">{selectedCollection ? selectedCollection : t("page_all_products")}</h1>

      {/* Search Input */}
      <div className="px-4 mb-6 md:mb-8">
        <div className="max-w-2xl mx-auto">
          <Input
            type="text"
            placeholder={t("page_search_placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            startContent={<Search className="w-4 h-4 text-gray-400" />}
            endContent={
              searchQuery && (
                <button onClick={handleClearSearch} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )
            }
            classNames={{
              input: "text-sm",
              inputWrapper: "bg-white border border-gray-200 shadow-sm hover:border-gray-300",
            }}
            size="lg"
          />
          {isSearching && !loading && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              {t("page_found_products").replace("{count}", foundCount)}
            </p>
          )}
        </div>
      </div>

      <div className={GRID_CLASS}>
        {items.map((product) => (
          <ProductCard
            key={product._id}
            product={product}
            discountRule={getDiscount(product)}
            isWishlisted={isInWishlist(product._id)}
            onWishlist={handleWishlist}
            formatPrice={formatPrice}
          />
        ))}
        {/* Skeletons sit INSIDE the grid so appending a page never shifts layout. */}
        {loading && <SkeletonCards />}
      </div>

      {/* Sentinel: crossing it (600px early) pulls the next page. */}
      {hasMore && !error && (
        <div ref={sentinelRef} data-feed-sentinel="" aria-hidden="true" className="h-px w-full" />
      )}

      {/* Explicit Load more — infinite scroll stays the primary path, but every
          remaining match must be reachable even if the observer never fires
          (sentinel already on screen, reduced motion, assistive tech). */}
      {hasMore && !error && !loading && (
        <div className="flex justify-center py-8">
          <button
            type="button"
            onClick={loadMore}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            {t("page_load_more")}
          </button>
        </div>
      )}

      {/* Failure: keep everything already loaded on screen and offer a retry. */}
      {error && (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-sm text-gray-500">{t("page_load_failed")}</p>
          {/* Plain button on purpose: rendering HeroUI's Button here pulled ~14 kB
              into every visit for an error state most users never see. Matches the
              raw <button> this page already uses for clear-search and wishlist. */}
          <button
            onClick={retry}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <RotateCw className="w-4 h-4" />
            {t("page_retry")}
          </button>
        </div>
      )}

      {showEmpty && !isSearching && <Empty title={t("page_no_products_collection")} />}

      {showEmpty && isSearching && (
        <div className="px-4">
          <Empty title={t("page_no_products_search")} description={t("page_no_products_search_desc").replace("{query}", activeQuery)} />
        </div>
      )}
      </div>
    </div>
  );
}
