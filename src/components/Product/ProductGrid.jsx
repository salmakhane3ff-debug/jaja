"use client";
import { useEffect, useState } from "react";
import ProductLabel from "@/components/ProductLabel";
import Link from "next/link";
import { Skeleton } from "@heroui/skeleton";
import { ShoppingCart, Clock, Heart } from "lucide-react";
import { Button } from "@heroui/react";
import { useCart } from "@/hooks/useCart";
import { useLanguage } from "@/context/LanguageContext";
import { useDiscountRules } from "@/hooks/useDiscountRules";

export default function StyleOne() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wishlist, setWishlist] = useState([]);
  const { addToCart, isAddingToCart } = useCart();
  const { t, formatPrice } = useLanguage();
  const { getDiscount } = useDiscountRules();

  useEffect(() => {
    async function fetchProducts() {
      try {
        const res = await fetch("/api/product");
        if (!res.ok) throw new Error("Network response was not ok");
        const data = await res.json();
        setProducts(Array.isArray(data) && data.length > 0 ? data : []);
      } catch (err) {
        console.error("Failed to fetch products:", err);
        setError("Failed to load products");
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }

    const savedWishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
    setWishlist(savedWishlist);
    fetchProducts();
  }, []);

  const navigateProduct = (product, e) => {
    if (
      product.redirectMode === "landing" &&
      typeof product.redirectUrl === "string" &&
      product.redirectUrl.trim()
    ) {
      if (e && typeof e.preventDefault === "function") {
        e.preventDefault();
        e.stopPropagation();
      }
      window.location.href = product.redirectUrl.trim();
      return true;
    }
    return false;
  };

  const handleAddToCart = async (product, e) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      await addToCart(product, 1);

      const notification = document.createElement("div");
      notification.textContent = `${product.title} — ${t("product_added_to_cart")}`;
      notification.className =
        "fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 transition-opacity";
      document.body.appendChild(notification);
      setTimeout(() => {
        notification.style.opacity = "0";
        setTimeout(() => {
          if (document.body.contains(notification)) document.body.removeChild(notification);
        }, 300);
      }, 2000);
    } catch (error) {
      console.error("Failed to add product to cart:", error);
      const notification = document.createElement("div");
      notification.textContent = t("product_add_failed");
      notification.className =
        "fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 transition-opacity";
      document.body.appendChild(notification);
      setTimeout(() => {
        notification.style.opacity = "0";
        setTimeout(() => {
          if (document.body.contains(notification)) document.body.removeChild(notification);
        }, 300);
      }, 3000);
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
    updatedWishlist = isInWishlist
      ? wishlist.filter((item) => item.productId !== product._id)
      : [...wishlist, wishlistItem];

    setWishlist(updatedWishlist);
    localStorage.setItem("wishlist", JSON.stringify(updatedWishlist));
    window.dispatchEvent(new Event("wishlistUpdated"));
  };

  const isInWishlist = (productId) => wishlist.some((item) => item.productId === productId);

  const calculateDiscount = (regularPrice, salePrice) => {
    if (!salePrice || !regularPrice) return 0;
    return Math.round(((regularPrice - salePrice) / regularPrice) * 100);
  };

  const isLimitedTimeDeal = (limitedTimeDeal) => {
    if (!limitedTimeDeal) return false;
    return new Date(limitedTimeDeal).getTime() > Date.now();
  };

  const getTimeRemaining = (limitedTimeDeal) => {
    if (!limitedTimeDeal) return "";
    const timeLeft = new Date(limitedTimeDeal).getTime() - Date.now();
    if (timeLeft <= 0) return t("product_expired");
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} ${t("product_days_left")}`;
    }
    return `${hours}h ${minutes}m ${t("product_hours_min_left")}`;
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="bg-white rounded-3xl border border-purple-50 p-2">
              <Skeleton className="w-full rounded-2xl" style={{ height: 220 }} />
              <div className="px-2 mt-4 space-y-2">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-3 w-3/4 rounded" />
                <Skeleton className="h-6 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) return null;

  const displayProducts = products.slice(0, 10);
  const hasMoreProducts = products.length > 10;

  return (
    <div className="max-w-7xl mx-auto px-4">
      {/* Section header */}
      <div className="text-center mb-8">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">{t("nav_products")}</h1>
        <p className="text-sm text-gray-500">{t("product_grid_subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4">
        {displayProducts.map((product) => {
          const discount    = calculateDiscount(product.regularPrice, product.salePrice);
          const imageUrl    = product.images?.[0]?.url || product.images?.[0] || "https://placehold.co/400x500?text=No+Image";
          const productHref = `/products/${product._id}`;
          // Resolve collection name — skip raw IDs (numbers / short strings)
          const rawCol      = Array.isArray(product.collections) ? product.collections[0] : null;
          const colName     = typeof rawCol === "string" && rawCol.length > 4 ? rawCol
                            : rawCol?.title || rawCol?.name || null;

          const discountRule = getDiscount(product);

          return (
            <div
              key={product._id}
              className="bg-white rounded-3xl glass-card border !border-purple-50 p-2 flex flex-col shadow-sm hover:shadow-md transition-all duration-300"
            >
              {/* Image */}
              <a href={productHref} onClick={(e) => navigateProduct(product, e)}>
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 mb-3 aspect-square">
                  <img
                    src={imageUrl}
                    alt={product.title}
                    className="absolute inset-0 w-full h-full object-cover object-top"
                  />
                  {!!product.productLabel && (
                    <div className="absolute top-2 left-2">
                      <ProductLabel label={product.productLabel} />
                    </div>
                  )}
                  {product.rating > 0 && (
                    <div className="absolute bottom-2 left-2 bg-green-600/90 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <span className="text-xs text-white font-medium">{product.rating}</span>
                      <span className="text-xs text-white">★</span>
                    </div>
                  )}
                  {discountRule && (
                    <div className="absolute bottom-2 right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                      -{discountRule.percentage}%
                    </div>
                  )}
                  {/* Wishlist */}
                  <button
                    onClick={(e) => handleWishlist(product, e)}
                    className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-sm transition-all duration-200 hover:scale-110 ${
                      isInWishlist(product._id)
                        ? "bg-red-500/90 text-white"
                        : "bg-white/80 text-gray-600 hover:text-red-500"
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${isInWishlist(product._id) ? "fill-current" : ""}`} />
                  </button>
                </div>
              </a>

              {/* Info */}
              <div className="px-2 pb-2 flex flex-col flex-1">
                {colName && (
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 truncate">
                    {colName}
                  </p>
                )}

                <a href={productHref} onClick={(e) => navigateProduct(product, e)}>
                  <h2 className="text-sm font-bold text-gray-900 line-clamp-1 leading-tight">
                    {product.title}
                  </h2>
                </a>

                {product.shortDescription && (
                  <p className="text-xs text-gray-600 line-clamp-1 my-1 leading-normal">
                    {product.shortDescription}
                  </p>
                )}

                {/* Price row */}
                <div className="flex items-center gap-2 mt-1 mb-2 flex-wrap">
                  <span className="text-lg font-bold text-gray-900">
                    {formatPrice(discountRule ? discountRule.effectivePrice : (product.salePrice || product.regularPrice || 0))}
                  </span>
                  {(discountRule || (product.salePrice && product.regularPrice)) && (
                    <span className="text-xs text-gray-400 line-through">
                      {formatPrice(discountRule ? discountRule.originalPrice : product.regularPrice)}
                    </span>
                  )}
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {hasMoreProducts && (
        <div className="flex justify-center mt-10">
          <Link href="/products">
            <Button className="bg-gray-900 text-white font-medium rounded-2xl px-10 py-2 text-sm">
              {t("product_view_more")}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
