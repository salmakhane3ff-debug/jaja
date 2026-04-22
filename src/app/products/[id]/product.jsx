"use client";

// PERF: prose.css scoped to this route — not loaded on the homepage or checkout.
import "@/app/prose.css";
import React, { useState, useEffect, useRef, useCallback, lazy, Suspense, useMemo } from "react";
import StickyAddToCart from "@/components/Product/StickyAddToCart";
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
import { fetchCached } from "@/lib/dataCache";

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

  const [quantity, setQuantity] = useState(1);
  // Generic variant selections: { [variantName]: selectedOption }
  // e.g. { "Couleur": "Noir", "Taille": "M" }
  const [selectedVariants, setSelectedVariants] = useState({});
  // null = 1 Pack, "2+1" = Buy 2 Get 1 Free bundle
  const [selectedBundle, setSelectedBundle] = useState(null);
  // Gift product fetched from specialOfferSlug (ui-control setting)
  const [giftProduct, setGiftProduct] = useState(null);
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

  // Track product page view — deduplicated per product per 24 h via localStorage
  useEffect(() => {
    if (!data._id) return;
    try {
      const key = `pc_${data._id}`;
      const last = localStorage.getItem(key);
      const now = Date.now();
      if (last && now - Number(last) < 86_400_000) return; // already tracked today
      localStorage.setItem(key, String(now));
    } catch {}
    fetch("/api/products/track-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: data._id }),
      keepalive: true,
    }).catch(() => {});
  }, [data._id]);

  useEffect(() => {
    const savedWishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
    setWishlist(savedWishlist);

    // PERF: fetch only avg+count from the lightweight stats endpoint (~20 bytes)
    // instead of the full /api/feedback payload (6+ MB with base64 images).
    if (fbSettings.starClickAction === "goToFeedbackPage") {
      fetchCached("/api/feedback/stats")
        .then(({ avg, count }) => {
          if (!count) return;
          setGlobalStats({ avg, count });
        })
        .catch(() => {});
    }
  }, [fbSettings.starClickAction]);

  // Fetch a random gift product from the comma-separated IDs in ui-control
  useEffect(() => {
    const raw = ui.specialOfferSlug;
    if (!raw) { setGiftProduct(null); return; }
    const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!ids.length) { setGiftProduct(null); return; }
    const randomId = ids[Math.floor(Math.random() * ids.length)];
    fetch(`/api/products/${encodeURIComponent(randomId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((p) => {
        if (!p || p.error) return;
        setGiftProduct({
          _id:   p._id,
          image: p.images?.[0]?.url || p.images?.[0] || "",
          title: p.title || "",
        });
      })
      .catch(() => {});
  }, [ui.specialOfferSlug]);

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

  // Auto-sync quantity when bundle option changes
  useEffect(() => {
    setQuantity(selectedBundle === "2+1" ? 2 : 1);
  }, [selectedBundle]);

  const handleQuantityChange = (type) => {
    if (selectedBundle === "2+1") return; // locked when bundle active
    if (type === "increment") setQuantity(quantity + 1);
    else if (type === "decrement" && quantity > 1) setQuantity(quantity - 1);
  };

  // Base unit price (single item)
  const unitPrice = parseFloat(discountRule ? discountRule.effectivePrice : (data.salePrice || data.regularPrice));

  // Effective price sent to cart:
  //   bundle "2+1" → pay for 2 units total (unit price adjusted so 3×unitInCart = 2×unitPrice)
  //   single       → normal unit price
  const bundleUnitPrice = selectedBundle === "2+1"
    ? parseFloat(((unitPrice * 2) / 3).toFixed(2))
    : unitPrice;

  const effectivePrice = bundleUnitPrice;

  // Convert selectedVariants map to structured array for cart/order storage
  const variantsList = Object.entries(selectedVariants)
    .filter(([, v]) => v)
    .map(([name, value]) => ({ name, value }));

  const handleAddToCart = async () => {
    if (selectedBundle === "2+1") {
      // Line 1 — Pack de 2 at full unit price
      await addToCart({ ...data, salePrice: unitPrice, regularPrice: data.regularPrice }, 2, { variants: variantsList });

      // Line 2 — 1 article GRATUIT at 0 DH
      const freeItemBase = giftProduct?._id
        ? {
            _id:    giftProduct._id,
            title:  giftProduct.title,
            images: [{ url: giftProduct.image }],
            salePrice: "0",
            regularPrice: null,
            _isGift: true,
          }
        : {
            // fallback: same product but with a cadeau suffix key
            ...data,
            _id:     data._id + "::cadeau",
            title:   data.title + " (CADEAU GRATUIT)",
            salePrice: "0",
            regularPrice: null,
            _isGift: true,
          };
      await addToCart(freeItemBase, 1);
    } else {
      await addToCart(data, quantity, { variants: variantsList });
    }
  };

  const handleBuyNow = async () => {
    let baseItems;
    if (selectedBundle === "2+1") {
      const freeTitle = giftProduct?.title
        ? giftProduct.title + " (CADEAU GRATUIT)"
        : data.title + " (CADEAU GRATUIT)";
      const freeImage = giftProduct?.image || data.images?.[0] || "";
      const freeProdId = giftProduct?._id || (data._id + "::cadeau");
      baseItems = [
        {
          productId: data._id,
          title: data.title,
          quantity: 2,
          variants: variantsList,
          image: data.images?.[0] || "",
          price: unitPrice,
          currency: "MAD",
        },
        {
          productId: freeProdId,
          title: freeTitle,
          quantity: 1,
          color: null,
          size: null,
          image: freeImage,
          price: 0,
          currency: "MAD",
          _isGift: true,
          isFreeGift: true,
        },
      ];
    } else {
      baseItems = [
        {
          productId: data._id,
          title: data.title,
          quantity,
          variants: variantsList,
          image: data.images?.[0] || "",
          price: effectivePrice,
          currency: "MAD",
        },
      ];
    }
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

            {/* Price */}
            <div className="bg-gray-50 rounded-lg p-4">
              {(discountRule || (data.salePrice && discount > 0)) && (
                <div className="mb-2">
                  <span className="bg-red-500 text-white px-2 py-1 rounded text-xs font-medium">
                    {discountRule ? discountRule.percentage : discount}% {t("product_off_percent")}
                  </span>
                </div>
              )}
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
            </div>

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

            {/* ── Bundle Selector ── */}
            {ui.showSpecialOffer && (() => {
              const thumbSrc = data.images?.[0]?.url || data.images?.[0] || "";
              // Gift item: fetched from specialOfferSlug, or fallback to product image
              const giftImage = giftProduct?.image || thumbSrc;
              const singleSave = data.regularPrice ? Math.round(data.regularPrice - unitPrice) : 0;
              const bundleSave = Math.round(unitPrice); // 1 free unit = unitPrice saved

              return (
                <div className="space-y-2">
                  {/* ── 1 Pack ── */}
                  <button
                    type="button"
                    onClick={() => setSelectedBundle(null)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl border-2 text-start transition-all duration-150 ${
                      selectedBundle === null
                        ? "border-gray-300 bg-white"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    {/* Radio */}
                    <div className={`shrink-0 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-colors ${
                      selectedBundle === null ? "border-gray-800" : "border-gray-300"
                    }`}>
                      {selectedBundle === null && <div className="w-2 h-2 rounded-full bg-gray-800" />}
                    </div>

                    {/* Thumb — 1 image */}
                    {thumbSrc && (
                      <div className="shrink-0 w-9 h-9 rounded-xl overflow-hidden bg-gray-100">
                        <img src={thumbSrc} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}

                    {/* Label */}
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <span className="text-sm font-bold text-gray-900">1 Pack</span>
                      {singleSave > 0 && (
                        <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {t("bundle_save")} {formatPrice(singleSave)}
                        </span>
                      )}
                    </div>

                    {/* Price */}
                    <div className="shrink-0 text-end">
                      <p className="text-base font-bold text-gray-900 leading-tight">{formatPrice(unitPrice)}</p>
                      {data.regularPrice && data.regularPrice > unitPrice && (
                        <p className="text-xs text-gray-400 line-through leading-tight">{formatPrice(data.regularPrice)}</p>
                      )}
                    </div>
                  </button>

                  {/* ── 3 Packs — 2+1 Gratuit ── */}
                  <div className={`rounded-2xl border-2 overflow-hidden transition-all duration-150 ${
                    selectedBundle === "2+1"
                      ? "border-[#6e57b2]"
                      : "border-gray-200 hover:border-[#b8a9e8]"
                  }`}>
                    <button
                      type="button"
                      onClick={() => setSelectedBundle("2+1")}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-start transition-colors ${
                        selectedBundle === "2+1" ? "bg-[#f0ecff]" : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      {/* Radio */}
                      <div className={`shrink-0 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-colors ${
                        selectedBundle === "2+1" ? "border-[#6e57b2]" : "border-gray-300"
                      }`}>
                        {selectedBundle === "2+1" && <div className="w-2 h-2 rounded-full bg-[#6e57b2]" />}
                      </div>

                      {/* Thumbs — 2 overlapping images */}
                      {thumbSrc && (
                        <div className="shrink-0 relative w-12 h-9">
                          <div className="absolute left-0 top-0 w-9 h-9 rounded-xl overflow-hidden bg-gray-100 border-2 border-white">
                            <img src={thumbSrc} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="absolute left-3 top-0 w-9 h-9 rounded-xl overflow-hidden bg-gray-100 border-2 border-white">
                            <img src={thumbSrc} alt="" className="w-full h-full object-cover" />
                          </div>
                        </div>
                      )}

                      {/* Label */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-gray-900">2 Packs</span>
                          <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                            {t("bundle_save")} {formatPrice(bundleSave)}
                          </span>
                        </div>
                      </div>

                      {/* Price */}
                      <div className="shrink-0 text-end">
                        <p className="text-base font-bold text-gray-900 leading-tight">{formatPrice(unitPrice * 2)}</p>
                        <p className="text-xs text-gray-400 line-through leading-tight">{formatPrice(unitPrice * 3)}</p>
                      </div>
                    </button>

                    {/* Free bonus banner */}
                    <div className="flex items-center gap-3 px-3 py-2.5 bg-[#6e57b2]">
                      {giftImage && (
                        <a
                          href={giftProduct?._id ? `/products/${giftProduct._id}` : undefined}
                          onClick={(e) => !giftProduct?._id && e.preventDefault()}
                          className="shrink-0 w-12 h-12 rounded-xl overflow-hidden bg-[#8b76c9] border-2 border-white/30 block hover:opacity-80 transition-opacity"
                        >
                          <img src={giftImage} alt="" className="w-full h-full object-cover" />
                        </a>
                      )}
                      <p className="text-sm font-bold text-white">+ {t("bundle_free_item_banner")}</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Product Variants — generic loop over data.variants */}
            {Array.isArray(data.variants) && data.variants.map(variant => (
              variant?.name && Array.isArray(variant.options) && variant.options.length > 0 ? (
                <div key={variant.name} className="space-y-2">
                  <h3 className="text-xs font-medium text-gray-900">{variant.name}:</h3>
                  <div className="flex flex-wrap gap-2">
                    {variant.options.map(option => (
                      <button
                        key={option}
                        onClick={() => setSelectedVariants(prev => ({ ...prev, [variant.name]: option }))}
                        className={`px-3 py-2 border rounded text-xs font-medium transition-all ${
                          selectedVariants[variant.name] === option
                            ? "border-orange-500 bg-orange-50 text-orange-600"
                            : "border-gray-300 hover:border-gray-400 text-gray-700"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null
            ))}

            {/* Quantity — locked to 3 when bundle "2+1" is active */}
            <div className={`space-y-2 transition-opacity ${selectedBundle === "2+1" ? "opacity-50" : ""}`}>
              <span className="text-sm font-medium text-gray-900">{t("product_quantity")}:</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleQuantityChange("decrement")}
                  disabled={quantity <= 1 || selectedBundle === "2+1"}
                  className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  −
                </button>
                <span className="text-sm font-medium text-gray-900 min-w-[2rem] text-center">{quantity}</span>
                <button
                  onClick={() => handleQuantityChange("increment")}
                  disabled={selectedBundle === "2+1"}
                  className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
          <h2 className="text-lg font-semibold text-gray-900 px-4 md:px-20 container mx-auto mb-2 text-start">
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
