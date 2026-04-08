"use client";

// PERF: prose.css scoped to this route — not loaded on the homepage or checkout.
import "@/app/prose.css";
import React, { useState, useEffect, useRef, useCallback, lazy, Suspense, useMemo } from "react";
import StickyAddToCart from "@/components/product/StickyAddToCart";
import ProductGallery from "@/components/ProductGallery";
import { BadgeCheck, ShieldCheck, ShoppingCart } from "lucide-react";
import SectionRenderer from "@/components/SectionRenderer";
import { ShoppingBag, Heart, Star, Truck, Shield, Share2, Plus, Minus, Award, Box, Tag, Check } from "lucide-react";
import { Button } from "@heroui/react";
import { useCart } from "@/hooks/useCart";
import { useUIControl } from "@/hooks/useUIControl";
import { useLanguage } from "@/context/LanguageContext";
import { useSetting } from "@/context/SettingsContext";
import { applyGiftsToItems } from "@/lib/giftUtils";
import { useProductScarcity } from "@/hooks/useProductScarcity";
import { useDiscountRules } from "@/hooks/useDiscountRules";

// ── Lazy-loaded non-critical components ───────────────────────────────────────
const ConversionBadges  = lazy(() => import("@/components/ConversionBadges"));
const FeedbackSection   = lazy(() => import("@/components/FeedbackSection"));
const SliderProduct     = lazy(() => import("@/components/Product/SliderProduct"));
const SliderCollection  = lazy(() => import("@/components/Colleaction/SliderCollection"));
const VideoReels        = lazy(() => import("@/components/VideoReels"));
const SupportBenefits   = lazy(() => import("@/components/SupportBenefits"));
const ProductGrid       = lazy(() => import("@/components/Product/ProductGrid"));

const DEFAULT_FB_SETTINGS = {
  enableProductFeedback: true,
  showStarsUnderTitle: true,
  showFeedbackCount: true,
  starClickAction: "scrollToFeedback",
  formDisplay: "modal",
};

export default function Product({ data }) {
  const ui = useUIControl();
  const { t, formatPrice } = useLanguage();
  const { getDiscount } = useDiscountRules();
  const discountRule = getDiscount(data);

  // ── Settings from context — no individual fetches ─────────────────────────
  const { data: fbRaw }         = useSetting("feedback-settings");
  const { data: convRaw }       = useSetting("conversion-settings");

  const fbSettings = useMemo(() => (
    fbRaw && !fbRaw.error ? { ...DEFAULT_FB_SETTINGS, ...fbRaw } : DEFAULT_FB_SETTINGS
  ), [fbRaw]);

  const randomBarEnabled = useMemo(() => (
    convRaw ? (convRaw?.randomStockBar?.enabled !== false) : true
  ), [convRaw]);

  // ── Bundle & Save — parse product bundles once ────────────────────────────
  const bundles = useMemo(() => {
    const raw = data.bundles;
    if (Array.isArray(raw) && raw.length > 0) return raw;
    if (typeof raw === "string") {
      try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
  }, [data.bundles]);

  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);
  // When bundles exist, track the selected bundle (default: first)
  const [selectedBundle, setSelectedBundle] = useState(() => bundles[0] ?? null);
  const [wishlist, setWishlist] = useState([]);
  const [feedbackStats, setFeedbackStats] = useState({ avg: 0, count: 0 });
  const [globalStats, setGlobalStats] = useState({ avg: 0, count: 0 });
  const feedbackRef = useRef(null);
  const actionsRef = useRef(null);

  const { addToCart, isAddingToCart } = useCart();

  // Stable scarcity data — DB values if admin set them, otherwise random (localStorage-cached)
  const scarcity = useProductScarcity(
    data._id,
    data.conversionEnabled,
    data.conversionSold,
    data.conversionStock,
  );

  useEffect(() => {
    const savedWishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
    setWishlist(savedWishlist);

    // Fetch global feedback stats only when starClickAction needs them
    if (fbSettings.starClickAction === "goToFeedbackPage") {
      fetch("/api/feedback")
        .then((r) => r.json())
        .then((list) => {
          if (!Array.isArray(list) || list.length === 0) return;
          const avg = list.reduce((a, b) => a + (b.rating || 0), 0) / list.length;
          setGlobalStats({ avg: parseFloat(avg.toFixed(1)), count: list.length });
        })
        .catch(() => {});
    }
  }, [fbSettings.starClickAction]);

  const handleFbStats = useCallback((avg, count) => {
    setFeedbackStats({ avg, count });
  }, []);

  const handleStarClick = () => {
    if (fbSettings.starClickAction === "scrollToFeedback") {
      feedbackRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (fbSettings.starClickAction === "goToFeedbackPage") {
      window.location.href = "/feedback";
    }
  };

  const handleQuantityChange = (type) => {
    if (type === "increment") setQuantity(quantity + 1);
    else if (type === "decrement" && quantity > 1) setQuantity(quantity - 1);
  };

  // Effective price per "unit" sent to cart/checkout:
  //   • Bundle selected → bundle.price (the bundle is one "unit" in the cart)
  //   • No bundle       → discount rule price or sale/regular price
  const effectivePrice = selectedBundle
    ? parseFloat(selectedBundle.price)
    : parseFloat(discountRule ? discountRule.effectivePrice : (data.salePrice || data.regularPrice));

  const handleAddToCart = async () => {
    if (selectedBundle) {
      // Inject bundle price — addToCart reads data.salePrice, so we pass a patched copy
      await addToCart({ ...data, salePrice: selectedBundle.price, regularPrice: null }, quantity);
    } else {
      await addToCart(data, quantity);
    }
  };

  const handleBuyNow = async () => {
    const baseItems = [
      {
        productId: data._id,
        title: data.title,
        quantity,
        color: selectedColor || null,
        size: selectedSize || null,
        image: data.images?.[0] || "",
        price: effectivePrice,
        currency: "MAD",
      },
    ];
    // Apply gift eligibility before navigating — same logic as cart flow
    const withGifts = await applyGiftsToItems(baseItems);
    localStorage.setItem("buyNow", JSON.stringify(withGifts));
    window.location.href = "/checkout/address";
  };

  const handleWishlist = () => {
    const wishlistItem = {
      productId: data._id,
      title: data.title,
      image: data.images[0]?.url,
      price: data.salePrice || data.regularPrice,
      regularPrice: data.regularPrice,
      salePrice: data.salePrice,
      currency: "MAD",
      rating: data.rating,
      productLabel: data.productLabel,
      addedAt: new Date().toISOString(),
    };

    const isInWishlist = wishlist.some((item) => item.productId === data._id);
    const updatedWishlist = isInWishlist
      ? wishlist.filter((item) => item.productId !== data._id)
      : [...wishlist, wishlistItem];

    setWishlist(updatedWishlist);
    localStorage.setItem("wishlist", JSON.stringify(updatedWishlist));
    window.dispatchEvent(new Event("wishlistUpdated"));
  };

  const isInWishlist = () => wishlist.some((item) => item.productId === data._id);

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: data.title, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        const notification = document.createElement("div");
        notification.textContent = t("product_link_copied");
        notification.className = "fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 transition-opacity";
        document.body.appendChild(notification);
        setTimeout(() => {
          notification.style.opacity = "0";
          setTimeout(() => { if (document.body.contains(notification)) document.body.removeChild(notification); }, 300);
        }, 2000);
      }
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const calculateDiscount = () => {
    if (data.salePrice && data.regularPrice) {
      return Math.round(((+data.regularPrice - +data.salePrice) / +data.regularPrice) * 100);
    }
    return 0;
  };

  const discount = calculateDiscount();

  return (
    <div className="bg-white min-h-screen">
      {/* Main Product Section */}
      <div className="container mx-auto px-3 py-4 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gallery */}
          <div>
            <ProductGallery images={data.images} title={data.title} />
          </div>

          {/* Product Details */}
          <div className="space-y-4">
            {/* Title & Stars */}
            <div>
              <h1 className="text-lg font-medium text-gray-900 leading-relaxed mb-2">{data.title}</h1>

              {fbSettings.enableProductFeedback && fbSettings.showStarsUnderTitle && (() => {
                const isGlobal = fbSettings.starClickAction === "goToFeedbackPage";
                const displayAvg = isGlobal ? (globalStats.avg || 0) : (feedbackStats.avg || data.rating || 0);
                const displayCount = isGlobal ? globalStats.count : (feedbackStats.count || data.reviewsCount || 0);

                return (
                  <button
                    onClick={fbSettings.starClickAction !== "disabled" ? handleStarClick : undefined}
                    className={`flex items-center gap-2 mb-3 ${fbSettings.starClickAction !== "disabled" ? "cursor-pointer hover:opacity-75 transition-opacity" : "cursor-default"}`}
                  >
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-4 h-4 ${s <= Math.round(displayAvg) ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200"}`}
                        />
                      ))}
                    </div>
                    {displayAvg > 0 && <span className="text-sm font-semibold text-gray-700">{displayAvg}</span>}
                    {fbSettings.showFeedbackCount && (
                      <span className="text-xs text-gray-400">({displayCount})</span>
                    )}
                  </button>
                );
              })()}
            </div>

            {/* Price — shows bundle price when a bundle is selected */}
            <div className="bg-gray-50 rounded-lg p-4">
              {!selectedBundle && (discountRule || (data.salePrice && discount > 0)) && (
                <div className="mb-2">
                  <span className="bg-red-500 text-white px-2 py-1 rounded text-xs font-medium">
                    {discountRule ? discountRule.percentage : discount}% {t("product_off_percent")}
                  </span>
                </div>
              )}
              {selectedBundle ? (
                /* Bundle-specific pricing */
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-3xl font-bold text-gray-900">
                    {formatPrice(selectedBundle.price)}
                  </span>
                  {selectedBundle.originalPrice && (
                    <span className="text-sm text-gray-500 line-through">
                      {formatPrice(selectedBundle.originalPrice)}
                    </span>
                  )}
                  {selectedBundle.originalPrice && (
                    <span className="bg-red-500 text-white px-2 py-1 rounded text-xs font-medium">
                      {Math.round(((selectedBundle.originalPrice - selectedBundle.price) / selectedBundle.originalPrice) * 100)}% {t("product_off_percent")}
                    </span>
                  )}
                </div>
              ) : (
                /* Normal single-unit pricing */
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-3xl font-bold text-gray-900">
                    {formatPrice(discountRule ? discountRule.effectivePrice : (data.salePrice || data.regularPrice))}
                  </span>
                  {(discountRule || (data.salePrice && data.regularPrice)) && (
                    <span className="text-sm text-gray-500 line-through">
                      {formatPrice(discountRule ? discountRule.originalPrice : data.regularPrice)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ── Bundle & Save ── rendered only when the product has bundles ── */}
            {bundles.length > 0 && (
              <div className="space-y-2.5">
                {/* Section header */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[11px] font-black text-gray-700 tracking-widest px-1">
                    BUNDLE &amp; SAVE
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* Bundle options */}
                <div className="space-y-2">
                  {bundles.map((bundle) => {
                    const isSelected = selectedBundle?.id === bundle.id;
                    return (
                      <button
                        key={bundle.id}
                        type="button"
                        onClick={() => setSelectedBundle(bundle)}
                        className={`relative w-full flex items-center gap-3 px-3 py-3 rounded-xl border-2 text-left transition-all duration-150 ${
                          isSelected
                            ? "border-teal-600 bg-teal-50/50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        {/* Radio circle */}
                        <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected ? "border-teal-600" : "border-gray-300"
                        }`}>
                          {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-teal-600" />}
                        </div>

                        {/* Label */}
                        <div className="flex-1 text-sm font-semibold text-gray-900 flex items-center gap-2 flex-wrap min-w-0">
                          <span className="truncate">{bundle.label}</span>
                          {bundle.badge === "free_shipping" && (
                            <span className="shrink-0 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                              {t("bundle_free_shipping") || "Free Shipping"}
                            </span>
                          )}
                        </div>

                        {/* Price block */}
                        <div className="shrink-0 text-right ml-1">
                          <p className="text-sm font-bold text-gray-900">{formatPrice(bundle.price)}</p>
                          {bundle.originalPrice && (
                            <p className="text-xs text-gray-400 line-through leading-tight">
                              {formatPrice(bundle.originalPrice)}
                            </p>
                          )}
                        </div>

                        {/* Most-popular badge — overhangs the card top edge */}
                        {bundle.badge === "most_popular" && (
                          <span className="absolute -top-3 right-3 text-[10px] font-black text-white bg-teal-600 px-3 py-0.5 rounded-full shadow-sm">
                            {t("bundle_most_popular") || "Most popular"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Stock Progress Bar — controlled by /admin/conversion-optimization ── */}
            {scarcity && randomBarEnabled && (() => {
              const { sold, total, pct } = scarcity;
              const barColor = pct >= 80
                ? "bg-red-500"
                : pct >= 50
                ? "bg-orange-400"
                : "bg-green-500";
              const labelColor = pct >= 80
                ? "text-red-600"
                : pct >= 50
                ? "text-orange-600"
                : "text-green-700";
              const bgColor = pct >= 80
                ? "bg-red-50 border-red-100"
                : pct >= 50
                ? "bg-orange-50 border-orange-100"
                : "bg-green-50 border-green-100";
              return (
                <div className={`border rounded-xl px-4 py-3 space-y-2 ${bgColor}`}>
                  {/* Row 1 — units sold */}
                  <p className={`text-sm font-semibold ${labelColor}`}>
                    {t("cv_sold_of_total")
                      .replace("{sold}",  sold)
                      .replace("{total}", total)}
                  </p>
                  {/* Row 2 — progress bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-700 ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {/* Row 3 — percentage + urgency text */}
                  <p className={`text-xs font-medium ${labelColor}`}>
                    {t("cv_sold_pct_hurry").replace("{pct}", pct)}
                  </p>
                </div>
              );
            })()}

            {/* Conversion Badges — urgency / scarcity / social proof */}
            <Suspense fallback={null}>
              <ConversionBadges />
            </Suspense>

            {/* Special Offer */}
            {ui.showSpecialOffer && (
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <div className="flex items-start gap-3">
                  <Tag className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-blue-900 mb-1">{t("product_special_offer_title")}</h3>
                    <p className="text-xs text-blue-700">{t("product_special_offer_desc")}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Size Selector */}
            {data.sizes && data.sizes.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-gray-900">{t("product_size")}:</h3>
                <div className="flex flex-wrap gap-2">
                  {data.sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`px-3 py-2 border rounded text-xs font-medium transition-all ${
                        selectedSize === size
                          ? "border-orange-500 bg-orange-50 text-orange-600"
                          : "border-gray-300 hover:border-gray-400 text-gray-700"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Color Selector */}
            {data.colors && data.colors.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-gray-900">{t("product_color")}:</h3>
                <div className="flex flex-wrap gap-2">
                  {data.colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${selectedColor === color ? "border-orange-500 scale-110" : "border-gray-300"}`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="space-y-2">
              <span className="text-sm font-medium text-gray-900">{t("product_quantity")}:</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleQuantityChange("decrement")}
                  disabled={quantity <= 1}
                  className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  −
                </button>
                <span className="text-sm font-medium text-gray-900 min-w-[2rem] text-center">{quantity}</span>
                <button
                  onClick={() => handleQuantityChange("increment")}
                  className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-all"
                >
                  +
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div ref={actionsRef} className="flex flex-col sm:flex-row gap-2 pt-2">
              {data.stockStatus === "Out of Stock" ? (
                <Button size="sm" disabled className="w-full bg-gray-300 text-gray-500 font-medium cursor-not-allowed h-10 text-xs rounded-lg">
                  {t("product_out_of_stock")}
                </Button>
              ) : (
                <>
                  {ui.showAddToCartButton && (
                    <Button
                      size="sm"
                      isLoading={isAddingToCart(data._id)}
                      onPress={handleAddToCart}
                      className="w-full bg-black text-white flex items-center justify-center gap-1 h-10 text-sm rounded-lg font-normal"
                    >
                      <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" className="inline-block" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                        <path d="M454.65 169.4A31.82 31.82 0 0 0 432 160h-64v-16a112 112 0 0 0-224 0v16H80a32 32 0 0 0-32 32v216c0 39 33 72 72 72h272a72.22 72.22 0 0 0 50.48-20.55 69.48 69.48 0 0 0 21.52-50.2V192a31.75 31.75 0 0 0-9.35-22.6zM176 144a80 80 0 0 1 160 0v16H176zm192 96a112 112 0 0 1-224 0v-16a16 16 0 0 1 32 0v16a80 80 0 0 0 160 0v-16a16 16 0 0 1 32 0z"/>
                      </svg>
                      {isAddingToCart(data._id) ? t("product_adding") : t("product_add_to_cart")}
                    </Button>
                  )}
                  {ui.showBuyNowButton && (
                    <Button
                      size="sm"
                      onPress={handleBuyNow}
                      className="w-full bg-yellow-300 text-black flex items-center justify-center gap-1 h-10 text-sm rounded-lg font-normal hover:bg-yellow-400"
                    >
                      <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" className="inline-block" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                        <path d="M432 208H288l32-192L80 304h144l-32 192z"/>
                      </svg>
                      {t("product_buy_now")}
                    </Button>
                  )}
                </>
              )}
            </div>


            {/* Description / Sections */}
            {(data.sections?.length > 0 || data.description) && (
              <div className="pt-3 border-t border-gray-200">
                <h3 className="text-xs font-medium text-gray-900 mb-3">{t("product_details_section")}</h3>
                <SectionRenderer sections={data.sections} description={data.description} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Related Products */}
      {ui.showRelatedProducts !== false && (
        <div className="py-6 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900 px-4 md:px-20 container mx-auto mb-2">
            {t("product_related")}
          </h2>
          <Suspense fallback={null}>
            <ProductGrid />
          </Suspense>
        </div>
      )}

      {/* Customer Feedback */}
      {fbSettings.enableProductFeedback && (
        <div ref={feedbackRef} id="feedback-section" className="container mx-auto px-4 max-w-6xl">
          <Suspense fallback={null}>
            <FeedbackSection
              productId={data._id || data.id}
              productName={data.title}
              showForm
              formDisplay={fbSettings.formDisplay}
              onStatsLoaded={handleFbStats}
            />
          </Suspense>
        </div>
      )}

      {/* Support Benefits */}
      <div className="bg-gray-50">
        <Suspense fallback={null}>
          <SupportBenefits />
        </Suspense>
      </div>

      <StickyAddToCart
        product={data}
        quantity={quantity}
        onQuantityChange={handleQuantityChange}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
        isLoading={isAddingToCart(data._id)}
        actionsRef={actionsRef}
      />

      <div className="h-20" />
    </div>
  );
}
