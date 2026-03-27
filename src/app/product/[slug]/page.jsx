"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { ShoppingCart, Zap, Star, ChevronLeft, ChevronRight, Home, PenLine } from "lucide-react";
import Link from "next/link";
import AffiliateRefCapture from "@/components/AffiliateRefCapture";
import FeedbackSection from "@/components/FeedbackSection";
import StickyAddToCart from "@/components/product/StickyAddToCart";

// ── Helpers ───────────────────────────────────────────────────────────────────

function imgSrc(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v.url || v.src || "";
}

// ── Default feedback settings ─────────────────────────────────────────────────

const DEFAULT_FB_SETTINGS = {
  enableProductFeedback: true,
  showStarsUnderTitle: true,
  showFeedbackCount: true,
  starClickAction: "scrollToFeedback", // "scrollToFeedback" | "goToFeedbackPage" | "disabled"
  formDisplay: "modal",                // "modal" | "inline"
};

// ── Product Gallery ───────────────────────────────────────────────────────────

function ProductGallery({ images, title }) {
  const [active, setActive] = useState(0);
  const srcs = (images || []).map(imgSrc).filter(Boolean);

  const prev = () => setActive((i) => (i === 0 ? srcs.length - 1 : i - 1));
  const next = () => setActive((i) => (i === srcs.length - 1 ? 0 : i + 1));

  if (!srcs.length) {
    return (
      <div className="w-full aspect-square rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
        لا توجد صورة
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 group">
        <img
          src={srcs[active]}
          alt={title}
          className="w-full h-full object-contain transition-opacity duration-200"
        />
        {srcs.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ChevronLeft className="w-4 h-4 text-gray-700" />
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ChevronRight className="w-4 h-4 text-gray-700" />
            </button>
          </>
        )}
        {srcs.length > 1 && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
            {srcs.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === active ? "bg-amber-500 w-3" : "bg-gray-300"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {srcs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {srcs.map((src, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                i === active
                  ? "border-amber-400 shadow-sm"
                  : "border-gray-100 hover:border-gray-300"
              }`}
            >
              <img src={src} alt={`${title} ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Variant Selector ──────────────────────────────────────────────────────────

function VariantSelector({ variants, selected, onChange }) {
  if (!variants || !variants.length) return null;
  return (
    <div className="space-y-3">
      {variants.map((v) => (
        <div key={v.name}>
          <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
            {v.name}
            {selected[v.name] && (
              <span className="ml-2 text-amber-600 normal-case font-normal">
                : {selected[v.name]}
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {(v.options || []).map((opt) => (
              <button
                key={opt}
                onClick={() => onChange(v.name, opt)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  selected[v.name] === opt
                    ? "border-amber-400 bg-amber-50 text-amber-700 shadow-sm"
                    : "border-gray-200 text-gray-700 hover:border-gray-300 bg-white"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Cart helpers ──────────────────────────────────────────────────────────────

function addItemToCart(product, selectedVariants, qty = 1) {
  const existing = JSON.parse(localStorage.getItem("cart") || "[]");
  const variantKey = JSON.stringify(selectedVariants);
  const idx = existing.findIndex(
    (i) => i.productId === product._id && JSON.stringify(i.variants || {}) === variantKey
  );

  if (idx !== -1) {
    existing[idx].quantity += qty;
  } else {
    existing.push({
      productId:    product._id,
      title:        product.title,
      price:        product.salePrice || product.regularPrice,
      quantity:     qty,
      image:        imgSrc((product.images || [])[0]),
      allowDeposit: product.allowDeposit ?? true,
      variants:     selectedVariants,
    });
  }

  localStorage.setItem("cart", JSON.stringify(existing));
  window.dispatchEvent(new Event("cartUpdated"));
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-pulse">
          <div className="aspect-square rounded-2xl bg-gray-200" />
          <div className="space-y-4">
            <div className="h-6 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-100 rounded w-1/3" />
            <div className="h-10 bg-gray-200 rounded w-1/2" />
            <div className="h-12 bg-gray-200 rounded-2xl" />
            <div className="h-12 bg-gray-200 rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProductPage() {
  const { slug }  = useParams();
  const router    = useRouter();
  const feedbackRef = useRef(null);
  const actionsRef  = useRef(null);  // watched by StickyAddToCart

  const [product,          setProduct]          = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [notFound,         setNotFound]         = useState(false);
  const [selected,         setSelected]         = useState({});
  const [quantity,         setQuantity]         = useState(1);
  const [cartMsg,          setCartMsg]          = useState(false);
  const [fbSettings,       setFbSettings]       = useState(DEFAULT_FB_SETTINGS);
  const [feedbackStats,    setFeedbackStats]    = useState({ avg: 0, count: 0 });

  // ── Fetch product ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/product?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        const list  = Array.isArray(data) ? data : [];
        const match = list.find((p) => p.slug === slug);
        if (match) {
          setProduct(match);
          if (Array.isArray(match.variants)) {
            const defaults = {};
            match.variants.forEach((v) => {
              if (v.options?.length) defaults[v.name] = v.options[0];
            });
            setSelected(defaults);
          }
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  // ── Track page VIEW (1 per product per 24 h — localStorage dedup) ────────
  useEffect(() => {
    if (!product?._id) return;

    const VIEW_KEY = `pc_${product._id}`;
    const TTL_24H  = 86_400_000;

    try {
      const last = localStorage.getItem(VIEW_KEY);
      if (last && Date.now() - parseInt(last, 10) < TTL_24H) return;
      localStorage.setItem(VIEW_KEY, String(Date.now()));
    } catch { /* private mode — fire anyway */ }

    fetch('/api/products/track-click', {          // endpoint unchanged (backward compat)
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ productId: product._id }),
    }).catch(() => {});
  }, [product?._id]);

  // ── trackCTA: fires on Buy Now / Add to Cart (10 s spam guard) ────────────
  const trackCTA = useCallback((productId) => {
    if (!productId) return;

    const CTA_KEY  = `cta_${productId}`;
    const SPAM_MS  = 10_000; // 10 seconds

    try {
      const last = localStorage.getItem(CTA_KEY);
      if (last && Date.now() - parseInt(last, 10) < SPAM_MS) return; // too fast — skip
      localStorage.setItem(CTA_KEY, String(Date.now()));
    } catch { /* private mode — fire anyway */ }

    fetch('/api/products/track-cta-click', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ productId }),
    }).catch(() => {});
  }, []);

  // ── Fetch feedback settings ───────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/setting?type=feedback-settings")
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          setFbSettings((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {});
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleVariantChange = useCallback((name, value) => {
    setSelected((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleQuantityChange = useCallback((type) => {
    setQuantity((q) => type === "increment" ? q + 1 : Math.max(1, q - 1));
  }, []);

  const handleAddToCart = () => {
    if (!product) return;
    trackCTA(product._id);
    addItemToCart(product, selected, quantity);
    setCartMsg(true);
    setTimeout(() => setCartMsg(false), 1800);
  };

  const handleBuyNow = () => {
    if (!product) return;
    trackCTA(product._id);
    try { localStorage.setItem("orderSource", "product"); } catch {}

    const buyNow = [{
      productId:    product._id,
      title:        product.title,
      price:        product.salePrice || product.regularPrice,
      quantity,
      image:        imgSrc((product.images || [])[0]),
      allowDeposit: product.allowDeposit ?? true,
      variants:     selected,
    }];
    localStorage.setItem("buyNow", JSON.stringify(buyNow));
    router.push("/checkout/address");
  };

  const handleStarClick = () => {
    if (fbSettings.starClickAction === "scrollToFeedback") {
      feedbackRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (fbSettings.starClickAction === "goToFeedbackPage") {
      router.push("/feedback");
    }
  };

  const handleFbStats = useCallback((avg, count) => {
    setFeedbackStats({ avg, count });
  }, []);

  // ── States ────────────────────────────────────────────────────────────────
  if (loading)  return <PageSkeleton />;

  if (notFound || !product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-4xl mb-4">🔍</p>
          <h1 className="text-xl font-bold text-gray-900 mb-2">المنتج غير موجود</h1>
          <p className="text-gray-500 text-sm mb-6">هذا المنتج غير متاح أو تم حذفه.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-400 text-white rounded-2xl font-semibold text-sm hover:bg-amber-500 transition-colors"
          >
            <Home className="w-4 h-4" />
            العودة للرئيسية
          </Link>
        </div>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const price         = product.salePrice || product.regularPrice;
  const originalPrice = product.salePrice && product.regularPrice > product.salePrice
    ? product.regularPrice : null;
  const discountPct   = originalPrice
    ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;
  const images   = Array.isArray(product.images)  ? product.images  : [];
  const variants = Array.isArray(product.variants) ? product.variants : [];

  const displayAvg   = feedbackStats.avg   || product.rating        || 0;
  const displayCount = feedbackStats.count || product.reviewsCount  || 0;
  const showStars    = fbSettings.enableProductFeedback && fbSettings.showStarsUnderTitle
    && (displayCount > 0 || displayAvg > 0);
  const isClickable  = fbSettings.starClickAction !== "disabled";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      <Suspense fallback={null}>
        <AffiliateRefCapture />
      </Suspense>

      {/* Breadcrumb */}
      <div className="max-w-5xl mx-auto px-4 pt-4 pb-0">
        <nav className="flex items-center gap-1.5 text-xs text-gray-400">
          <Link href="/" className="hover:text-gray-700 transition-colors">الرئيسية</Link>
          <span>/</span>
          <Link href="/products" className="hover:text-gray-700 transition-colors">المنتجات</Link>
          <span>/</span>
          <span className="text-gray-700 font-medium line-clamp-1">{product.title}</span>
        </nav>
      </div>

      {/* Main grid */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Gallery */}
          <ProductGallery images={images} title={product.title} />

          {/* Info */}
          <div className="space-y-5">

            {/* Title + stars */}
            <div>
              <h1 className="text-xl font-black text-gray-900 leading-snug mb-2">
                {product.title}
              </h1>

              {/* Stars row under title */}
              {showStars && (
                <div className="flex flex-col items-center gap-2 mt-3 mb-1">
                  <button
                    onClick={isClickable ? handleStarClick : undefined}
                    className={`inline-flex items-center gap-2 ${isClickable ? "cursor-pointer hover:opacity-75 active:scale-95 transition-all" : "cursor-default"}`}
                    aria-label="تقييمات المنتج"
                  >
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-5 h-5 ${
                            s <= Math.round(displayAvg)
                              ? "fill-amber-400 text-amber-400"
                              : "fill-gray-200 text-gray-200"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-semibold text-gray-700">
                      {displayAvg}
                    </span>
                    {fbSettings.showFeedbackCount && displayCount > 0 && (
                      <span className="text-xs text-gray-400">
                        — {displayCount} {displayCount === 1 ? "تقييم" : "تقييم"}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Price block */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-black text-gray-900">
                  {price?.toFixed(0)} MAD
                </span>
                {originalPrice && (
                  <span className="text-base text-gray-400 line-through font-medium">
                    {originalPrice.toFixed(0)} MAD
                  </span>
                )}
                {discountPct > 0 && (
                  <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                    −{discountPct}%
                  </span>
                )}
              </div>
              {discountPct > 0 && (
                <p className="text-xs text-green-600 mt-1 font-medium">
                  وفّر {(originalPrice - price).toFixed(0)} MAD
                </p>
              )}
            </div>

            {/* Variants */}
            {variants.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <VariantSelector
                  variants={variants}
                  selected={selected}
                  onChange={handleVariantChange}
                />
              </div>
            )}

            {/* Action buttons — ref watched by StickyAddToCart */}
            <div ref={actionsRef} className="space-y-2.5">
              <button
                onClick={handleAddToCart}
                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] ${
                  cartMsg ? "bg-green-500 text-white" : "bg-gray-900 text-white hover:bg-gray-800"
                }`}
              >
                <ShoppingCart className="w-5 h-5" />
                {cartMsg ? "✓ تمت الإضافة!" : "أضف إلى السلة"}
              </button>

              <button
                onClick={handleBuyNow}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-amber-400 hover:bg-amber-500 active:scale-[0.98] text-white rounded-2xl font-bold text-sm transition-all shadow-md shadow-amber-100"
              >
                <Zap className="w-5 h-5" />
                اشتري الآن
              </button>
            </div>

            {/* Short description */}
            {(product.shortDescription || product.description) && (
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  وصف المنتج
                </p>
                {product.shortDescription ? (
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {product.shortDescription}
                  </p>
                ) : (
                  <div
                    className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: product.description }}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Full description */}
        {product.shortDescription && product.description && (
          <div className="mt-8 bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">تفاصيل المنتج</h2>
            <div
              className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          </div>
        )}

        {/* Feedback section */}
        {fbSettings.enableProductFeedback && (
          <div ref={feedbackRef} id="feedback-section">
            <FeedbackSection
              productId={product._id}
              productName={product.title}
              showForm
              formDisplay={fbSettings.formDisplay}
              onStatsLoaded={handleFbStats}
            />
          </div>
        )}
      </div>

      {/* Bottom spacer so content isn't hidden behind sticky bar */}
      <div className="h-20" />

      {/* ── Sticky Add-to-Cart bar ── */}
      <StickyAddToCart
        product={product}
        quantity={quantity}
        onQuantityChange={handleQuantityChange}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
        isLoading={cartMsg}
        actionsRef={actionsRef}
      />
    </div>
  );
}
