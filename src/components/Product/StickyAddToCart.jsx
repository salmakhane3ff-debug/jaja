"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { ShoppingCart, Zap, Flame, Tag, Eye } from "lucide-react";
import { useUIControl } from "@/hooks/useUIControl";
import { useCartDrawer } from "@/hooks/useCart";
import { useLanguage } from "@/context/LanguageContext";

// ── Constants ──────────────────────────────────────────────────────────────────
const SHOW_DELAY_MS      = 300;
const DEPTH_THRESHOLD    = 0.60;
const VELOCITY_THRESHOLD = 800;
const VELOCITY_RESET_MS  = 2500;

// ── Pure helpers (no hooks) ───────────────────────────────────────────────────
function fireEvent(productId, event) {
  if (!productId) return;
  const send = () =>
    fetch("/api/products/track-event", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, event }), keepalive: true,
    }).catch(() => {});
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(send, { timeout: 2000 });
  } else {
    setTimeout(send, 0);
  }
}

function getCartItem(productId) {
  if (!productId) return null;
  try {
    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    return cart.find((i) => i.productId === productId) ?? null;
  } catch { return null; }
}

function getCachedHints(productId) {
  try {
    const raw = sessionStorage.getItem(`satc_hints_${productId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function setCachedHints(productId, hints) {
  try { sessionStorage.setItem(`satc_hints_${productId}`, JSON.stringify(hints)); } catch {}
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function StickyAddToCart({
  product,
  quantity,
  onQuantityChange,
  onAddToCart,
  onBuyNow,
  isLoading = false,
  actionsRef,
}) {
  // ═══════════════════════════════════════════════════════════════════════════
  // ALL HOOKS — unconditional, no early returns above any of these
  // ═══════════════════════════════════════════════════════════════════════════

  // UI Control settings (live from DB)
  const ui = useUIControl();
  const { t, formatPrice } = useLanguage();

  // State
  const [visible,   setVisible]  = useState(false);
  const [totalPrice, setTotalPrice] = useState(0);
  const [mounted,  setMounted]  = useState(false);
  const [isInCart, setIsInCart] = useState(false);
  const [hints,    setHints]    = useState({});

  // Refs
  const showTimer       = useRef(null);
  const velocityTimer   = useRef(null);
  const impressionFired = useRef(false);
  const lastScrollY     = useRef(0);
  const lastScrollTime  = useRef(Date.now());
  const sigPast         = useRef(false);
  const sigDepth        = useRef(false);
  const sigVelocity     = useRef(false);

  // Context
  const { setCartDrawerOpen } = useCartDrawer();

  // Mount
  useEffect(() => { setMounted(true); }, []);

  // Power Mode hints
  useEffect(() => {
    const pid = product?._id;
    if (!pid || !ui.showStickyAddToCart) return;
    const cached = getCachedHints(pid);
    if (cached) { setHints(cached); return; }
    const load = () =>
      fetch(`/api/products/ui-hints?productId=${pid}`)
        .then((r) => r.ok ? r.json() : {})
        .then((data) => { setCachedHints(pid, data); setHints(data); })
        .catch(() => {});
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(load, { timeout: 3000 });
    } else {
      setTimeout(load, 500);
    }
  }, [product?._id]); // eslint-disable-line

  // Merged config — reads live DB values via useUIControl
  const cfg = useMemo(() => ({
    variant:  hints.stickyVariant ?? ui.stickyVariant  ?? "A",
    quickBuy: hints.quickBuy      ?? (ui.stickyShowBuyNow !== false),
  }), [hints, ui.stickyVariant, ui.stickyShowBuyNow]);

  // Cart sync
  const syncCart = useCallback(() => {
    setIsInCart(!!getCartItem(product?._id));
  }, [product?._id]);

  useEffect(() => {
    if (!product?._id) return;
    syncCart();
    window.addEventListener("cartUpdated", syncCart);
    window.addEventListener("storage",     syncCart);
    return () => {
      window.removeEventListener("cartUpdated", syncCart);
      window.removeEventListener("storage",     syncCart);
    };
  }, [syncCart]);

  // ── Price × Quantity (CRITICAL FIX) ──────────────────────────────────────
  useEffect(() => {
    const unitPrice = parseFloat(product?.salePrice || product?.regularPrice || 0);
    setTotalPrice(unitPrice * (quantity || 1));
  }, [quantity, product?.salePrice, product?.regularPrice]);

  // Visibility helpers
  const triggerShow = useCallback(() => {
    if (showTimer.current) return;
    showTimer.current = setTimeout(() => {
      showTimer.current = null;
      setVisible(true);
      if (!impressionFired.current) {
        impressionFired.current = true;
        fireEvent(product?._id, "sticky_impression");
      }
    }, SHOW_DELAY_MS);
  }, [product?._id]);

  const triggerHide = useCallback(() => {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
    setVisible(false);
  }, []);

  const evaluateSignals = useCallback(() => {
    const should = sigPast.current || sigDepth.current || sigVelocity.current;
    if (should) triggerShow(); else triggerHide();
  }, [triggerShow, triggerHide]);

  // Signal 1 — IntersectionObserver
  useEffect(() => {
    const el = actionsRef?.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { sigPast.current = !entry.isIntersecting; evaluateSignals(); },
      { threshold: 0, rootMargin: "-64px 0px 0px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [actionsRef, evaluateSignals]);

  // Signals 2 & 3 — Scroll depth + velocity
  useEffect(() => {
    const onScroll = () => {
      const now     = Date.now();
      const scrollY = window.scrollY;
      const dt      = now - lastScrollTime.current;

      sigDepth.current = (scrollY + window.innerHeight) /
        Math.max(document.body.scrollHeight, 1) >= DEPTH_THRESHOLD;

      if (dt > 0) {
        const v = Math.abs(scrollY - lastScrollY.current) / dt * 1000;
        if (v > VELOCITY_THRESHOLD && scrollY > 100) {
          sigVelocity.current = true;
          clearTimeout(velocityTimer.current);
          velocityTimer.current = setTimeout(() => {
            sigVelocity.current = false;
            evaluateSignals();
          }, VELOCITY_RESET_MS);
        }
      }
      lastScrollY.current    = scrollY;
      lastScrollTime.current = now;
      evaluateSignals();
    };

    let ticking = false;
    const throttled = () => {
      if (!ticking) {
        requestAnimationFrame(() => { onScroll(); ticking = false; });
        ticking = true;
      }
    };
    window.addEventListener("scroll", throttled, { passive: true });
    return () => {
      window.removeEventListener("scroll", throttled);
      clearTimeout(velocityTimer.current);
    };
  }, [evaluateSignals]);

  // Derived values (plain variables — safe above guards)
  const stock    = typeof product?.stock === "number" ? product.stock : null;
  const lowStock = stock !== null && stock > 0 && stock < 5;

  // Remaining hooks — still unconditional
  const addCtaLabel = useMemo(() => {
    if (isInCart) return t("sticky_view_cart");
    if (lowStock)  return t("sticky_only_left").replace("{stock}", stock);
    return t("product_add_to_cart");
  }, [isInCart, lowStock, stock, t]);

  const handleAddClick = useCallback(() => {
    if (isInCart) { setCartDrawerOpen?.(true); return; }
    fireEvent(product?._id, "sticky_click_add");
    onAddToCart?.();
  }, [isInCart, setCartDrawerOpen, product?._id, onAddToCart]);

  const handleBuyClick = useCallback(() => {
    fireEvent(product?._id, "sticky_click_buy_now");
    onBuyNow?.();
  }, [product?._id, onBuyNow]);

  // ═══════════════════════════════════════════════════════════════════════════
  // GUARDS — only after every hook above has been called
  // ═══════════════════════════════════════════════════════════════════════════
  if (!ui.showStickyAddToCart || !mounted) return null;

  // ── Render-only derived values ────────────────────────────────────────────
  const isB        = cfg.variant === "B";
  const showBuyNow = cfg.quickBuy && ui.stickyShowBuyNow;

  const unitPrice = parseFloat(product?.salePrice || product?.regularPrice || 0);
  const price     = totalPrice > 0 ? totalPrice : unitPrice;
  const origPrice = product?.salePrice && product?.regularPrice
    ? parseFloat(product.regularPrice) * (quantity || 1)
    : null;
  const isOOS     = product?.stockStatus === "Out of Stock";
  const rawImage  = product?.images?.[0];
  const imageUrl  = typeof rawImage === "string" ? rawImage : rawImage?.url || "";

  const onSale  = !!(product?.salePrice && product?.regularPrice &&
                     +product.regularPrice > +product.salePrice);
  const savePct = onSale
    ? Math.round(((+product.regularPrice - +product.salePrice) / +product.regularPrice) * 100)
    : 0;

  const btnH      = isB ? "h-12" : "h-10";
  const addBtnCls = isB
    ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
    : "bg-black hover:bg-gray-900 text-white";
  const buyBtnCls = isB
    ? "bg-gray-700 hover:bg-gray-600 text-white"
    : "bg-yellow-300 hover:bg-yellow-400 text-black";
  const badgePulse = isB ? "animate-pulse" : "";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      role="complementary"
      aria-label="Quick add to cart"
      className={`
        fixed bottom-0 left-0 right-0 z-50
        transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
        will-change-transform
        ${visible ? "translate-y-0" : "translate-y-full"}
      `}
    >
      {/* Urgency strip */}
      {(lowStock || onSale) && visible && (
        <div className={`flex items-center justify-center gap-4 px-4 py-1.5 text-xs font-bold
          ${isB ? "bg-red-600 text-white" : "bg-gray-900 text-white"}`}>
          {lowStock && (
            <span className={`flex items-center gap-1 ${badgePulse}`}>
              <Flame className="w-3 h-3 text-orange-300" />
              {t("sticky_only_left").replace("{stock}", stock)}
            </span>
          )}
          {onSale && (
            <span className="flex items-center gap-1 text-green-300">
              <Tag className="w-3 h-3" />
              {t("sticky_save_pct").replace("{pct}", savePct)}
            </span>
          )}
        </div>
      )}

      {/* Bar */}
      <div className={`border-t shadow-[0_-4px_28px_rgba(0,0,0,0.13)]
        ${isB ? "bg-white border-gray-200" : "bg-white/96 backdrop-blur-md border-gray-200"}`}>
        <div className="container mx-auto max-w-3xl px-3 py-2.5">
          <div className="flex items-center gap-1.5 sm:gap-3">

            {/* Thumbnail */}
            {imageUrl && (
              <img src={imageUrl} alt={product?.title}
                className={`w-10 rounded-lg object-cover border border-gray-100 shrink-0 ${isB ? "h-12" : "h-10"}`}
                loading="lazy" />
            )}

            {/* Title + price */}
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className={`font-bold text-gray-900 ${isB ? "text-base" : "text-sm"}`}>
                  {formatPrice(price.toFixed(0))}
                </span>
                {origPrice && (
                  <span className="text-xs text-gray-400 line-through">{formatPrice(origPrice.toFixed(0))}</span>
                )}
                {onSale && <span className="text-xs font-bold text-green-600">−{savePct}%</span>}
              </div>
            </div>

            {/* CTAs */}
            {isOOS ? (
              <button disabled
                className={`shrink-0 ${btnH} px-4 rounded-xl bg-gray-200 text-gray-400 text-xs font-semibold cursor-not-allowed`}>
                {t("sticky_out_of_stock")}
              </button>
            ) : isInCart ? (
              <button onClick={handleAddClick}
                className={`shrink-0 ${btnH} px-3 sm:px-6 rounded-xl ${addBtnCls} active:scale-95 font-bold text-xs flex items-center gap-1.5 transition-all duration-150 shadow-sm`}>
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span>{t("sticky_view_cart")}</span>
              </button>
            ) : (
              <>
                <button onClick={handleAddClick} disabled={isLoading}
                  className={`shrink-0 ${btnH} px-3 sm:px-5 rounded-xl ${addBtnCls} active:scale-95 text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm`}>
                  <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                  <span>{isLoading ? t("sticky_adding") : addCtaLabel}</span>
                </button>
                {showBuyNow && (
                  <button onClick={handleBuyClick}
                    className={`shrink-0 ${btnH} px-3 sm:px-5 rounded-xl ${buyBtnCls} active:scale-95 text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-150 shadow-sm`}>
                    <Zap className="w-3.5 h-3.5 shrink-0" />
                    <span>{t("sticky_buy_now")}</span>
                  </button>
                )}
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
