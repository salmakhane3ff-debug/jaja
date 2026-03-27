"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@heroui/skeleton";
import { Input, Button } from "@heroui/react";
import { Search, X, ShoppingCart, Heart } from "lucide-react";
import Empty from "@/components/block/Empty";
import { useCart } from "@/hooks/useCart";
import { useLanguage } from "@/context/LanguageContext";
import { useDiscountRules } from "@/hooks/useDiscountRules";

function AllProductsPage() {
  const searchParams = useSearchParams();
  const selectedCollection = searchParams.get("collection");

  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [wishlist, setWishlist] = useState([]);
  const [collectionBanner, setCollectionBanner] = useState(null);
  const { addToCart, isAddingToCart } = useCart();
  const { formatPrice, t } = useLanguage();
  const { getDiscount } = useDiscountRules();

  useEffect(() => {
    async function fetchProducts() {
      try {
        const res = await fetch("/api/product", {
          cache: "force-cache",
          next: { revalidate: 300 },
        });
        if (!res.ok) throw new Error("Network response was not ok");
        const data = await res.json();
        const validData = Array.isArray(data) && data.length > 0 ? data : [];

        // 🔍 Filter by collection if search param exists
        const filtered = selectedCollection ? validData.filter((p) => Array.isArray(p.collections) && p.collections.some((c) => c.toLowerCase() === selectedCollection.toLowerCase())) : validData;

        setProducts(filtered);
        setFilteredProducts(filtered);
      } catch (err) {
        console.error("Failed to fetch products:", err);
        setError("Failed to load products");
        setProducts([]);
        setFilteredProducts([]);
      } finally {
        setLoading(false);
      }
    }

    async function fetchCollectionBanner() {
      if (!selectedCollection) { setCollectionBanner(null); return; }
      try {
        const res  = await fetch("/api/collection", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && Array.isArray(data)) {
          const match = data.find((c) => c.title.toLowerCase() === selectedCollection.toLowerCase());
          setCollectionBanner(match?.banner || null);
        }
      } catch { setCollectionBanner(null); }
    }

    fetchProducts();
    fetchCollectionBanner();
  }, [selectedCollection]);

  // Handle search filtering
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredProducts(products);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = products.filter(
        (product) => product.title?.toLowerCase().includes(query) || product.shortDescription?.toLowerCase().includes(query) || product.description?.toLowerCase().includes(query)
      );
      setFilteredProducts(filtered);
    }
  }, [searchQuery, products]);

  const handleClearSearch = () => {
    setSearchQuery("");
  };

  const handleAddToCart = async (product, e) => {
    // Handle both regular events and HeroUI onPress events
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
      e.stopPropagation();
    }

    try {
      console.log("Adding product to cart:", product.title, product);
      await addToCart(product, 1);
      console.log("Product added to cart successfully:", product.title);
    } catch (error) {
      console.error("Failed to add product to cart:", error);
    }
  };
  const handleWishlist = (product, e) => {
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

    let updatedWishlist;
    const isInWishlist = wishlist.some((item) => item.productId === product._id);

    if (isInWishlist) {
      updatedWishlist = wishlist.filter((item) => item.productId !== product._id);
    } else {
      updatedWishlist = [...wishlist, wishlistItem];
    }

    setWishlist(updatedWishlist);
    localStorage.setItem("wishlist", JSON.stringify(updatedWishlist));

    // Dispatch custom event to update header count
    window.dispatchEvent(new Event("wishlistUpdated"));
  };

  const isInWishlist = (productId) => {
    return wishlist.some((item) => item.productId === productId);
  };

  const calculateDiscount = (regularPrice, salePrice) => {
    if (!salePrice || !regularPrice) return 0;
    return Math.round(((regularPrice - salePrice) / regularPrice) * 100);
  };

  const isLimitedTimeDeal = (limitedTimeDeal) => {
    if (!limitedTimeDeal) return false;
    const dealEndTime = new Date(limitedTimeDeal).getTime();
    const currentTime = new Date().getTime();
    return currentTime < dealEndTime;
  };

  // Load wishlist on mount
  useEffect(() => {
    const savedWishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
    setWishlist(savedWishlist);
  }, []);

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
      <h1 suppressHydrationWarning className="md:text-2xl text-lg font-bold mb-6 text-center">{selectedCollection ? t("page_collection").replace("{name}", selectedCollection) : t("page_all_products")}</h1>

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
          {searchQuery && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              {t("page_found_products").replace("{count}", filteredProducts.length)}
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 md:gap-6 gap-3 px-4">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className="bg-white rounded-xl overflow-hidden">
              <Skeleton className="w-full aspect-square rounded-none" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 md:gap-6 gap-3 px-4">
          {filteredProducts.map((product) => {
            const discount      = calculateDiscount(product.regularPrice, product.salePrice);
            const discountRule  = getDiscount(product);

            return (
              <div key={product._id} className="bg-white rounded-3xl border !border-purple-50 p-2 flex flex-col shadow-sm hover:shadow-md transition-all duration-300">
                {/* Image container */}
                <Link href={`/products/${product._id}`}>
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 mb-3 aspect-square">
                    <img
                      src={product.images?.[0] || "https://placehold.co/400x500?text=No+Image"}
                      alt={product.title}
                      className="absolute inset-0 w-full h-full object-cover object-top"
                    />

                    {/* Product Label */}
                    {product.productLabel && (
                      <span className={`absolute top-2 left-2 px-1.5 py-0.5 text-xs font-medium rounded-lg backdrop-blur-sm ${
                        product.productLabel === "New" ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white"
                        : product.productLabel === "Hot" ? "bg-gradient-to-r from-red-500 to-red-600 text-white"
                        : product.productLabel === "Sale" ? "bg-gradient-to-r from-pink-500 to-pink-600 text-white"
                        : product.productLabel === "Best Seller" ? "bg-gradient-to-r from-green-500 to-green-600 text-white"
                        : product.productLabel === "Trending" ? "bg-gradient-to-r from-yellow-400 to-orange-400 text-black"
                        : product.productLabel === "Limited Edition" ? "bg-gradient-to-r from-purple-500 to-purple-600 text-white"
                        : "bg-gradient-to-r from-gray-700 to-gray-800 text-white"
                      }`}>
                        {product.productLabel}
                      </span>
                    )}

                    {/* Rating badge */}
                    {product.rating > 0 && (
                      <div className="absolute bottom-2 left-2 bg-green-600 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                        <span className="text-xs text-white font-medium">{product.rating}</span>
                        <span className="text-xs text-white font-semibold">★</span>
                      </div>
                    )}
                    {/* Discount badge */}
                    {discountRule && (
                      <div className="absolute bottom-2 right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                        -{discountRule.percentage}%
                      </div>
                    )}

                    {/* Wishlist button */}
                    <button
                      onClick={(e) => handleWishlist(product, e)}
                      className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-sm transition-all duration-200 hover:scale-110 ${
                        isInWishlist(product._id) ? "bg-red-500/90 text-white" : "bg-white/80 text-gray-600 hover:text-red-500"
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isInWishlist(product._id) ? "fill-current" : ""}`} />
                    </button>
                  </div>
                </Link>

                {/* Info */}
                <div className="px-2 pb-2 flex flex-col flex-1">
                  <Link href={`/products/${product._id}`}>
                    <h2 className="text-sm font-bold text-gray-900 line-clamp-1 leading-tight mb-1">{product.title}</h2>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-lg font-bold text-gray-900">
                        {formatPrice(discountRule ? discountRule.effectivePrice : (product.salePrice || product.regularPrice || 0))}
                      </span>
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
          })}
        </div>
      )}

      {!loading && products.length === 0 && <Empty title={t("page_no_products_collection")} />}

      {!loading && products.length > 0 && filteredProducts.length === 0 && (
        <div className="px-4">
          <Empty title={t("page_no_products_search")} description={t("page_no_products_search_desc").replace("{query}", searchQuery)} />
        </div>
      )}

      {error && <p className="text-red-500 mt-6 text-center">{error}</p>}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AllProductsPage />
    </Suspense>
  );
}
