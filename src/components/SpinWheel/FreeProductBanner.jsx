"use client";

import { useState, useEffect } from "react";
import { Gift, X, CheckCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

/**
 * FreeProductBanner
 * Reads the pending free-product reward from localStorage.
 * Monitors cartUpdated events to recalculate progress.
 * Auto-adds the free product when cart value >= minCartValue.
 *
 * Positioned on the LEFT on desktop so it never overlaps
 * the right-side cart drawer.
 * z-[10005] — above sidebar/drawer, below spin modal (z-[10010]).
 */
export default function FreeProductBanner() {
  const { t, formatPrice }             = useLanguage();
  const [reward,   setReward]          = useState(null);
  const [cartVal,  setCartVal]         = useState(0);
  const [unlocked, setUnlocked]        = useState(false);
  const [adding,   setAdding]          = useState(false);
  const [dismissed,setDismissed]       = useState(false);

  const readCart = () => {
    try {
      const cart  = JSON.parse(localStorage.getItem("cart") || "[]");
      const total = cart.reduce((s, i) => s + (Number(i.price) * Number(i.quantity)), 0);
      setCartVal(total);
      return total;
    } catch { return 0; }
  };

  const readReward = () => {
    try {
      const raw = localStorage.getItem("spinFreeProduct");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const dismiss = () => {
    localStorage.removeItem("spinFreeProduct");
    setReward(null);
    setDismissed(false);
  };

  const addFreeProduct = async (r) => {
    if (adding) return;
    setAdding(true);
    try {
      const res  = await fetch(`/api/product/${r.productId}`);
      const prod = await res.json();
      if (!prod?._id) throw new Error("not found");

      const cart   = JSON.parse(localStorage.getItem("cart") || "[]");
      const exists = cart.find((i) => i.productId === prod._id && i.free);
      if (exists) return;

      cart.push({
        productId: prod._id,
        title:     prod.title,
        quantity:  1,
        price:     0,
        free:      true,
        image:     prod.images?.[0]?.url || prod.images?.[0] || "",
      });
      localStorage.setItem("cart", JSON.stringify(cart));
      window.dispatchEvent(new Event("cartUpdated"));

      const sessionId = sessionStorage.getItem("spinSessionId") || "";
      fetch("/api/spin-wheel-spin", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sessionId, eventType: "reward_unlock", productId: prod._id }),
      }).catch(() => {});

      setUnlocked(true);
      localStorage.removeItem("spinFreeProduct");
      setTimeout(() => setUnlocked(false), 4000);
    } catch (err) {
      console.error("Failed to add free product:", err);
    } finally {
      setAdding(false);
    }
  };

  useEffect(() => {
    const check = () => {
      const r = readReward();
      setReward(r);
      if (!r) return;
      const val = readCart();
      if (val >= (r.minCartValue || 0)) addFreeProduct(r);
    };
    check();
    window.addEventListener("cartUpdated",  check);
    window.addEventListener("spinRewardSet", check);
    return () => {
      window.removeEventListener("cartUpdated",  check);
      window.removeEventListener("spinRewardSet", check);
    };
  }, []); // eslint-disable-line

  // ── Unlock toast ──
  if (unlocked) {
    return (
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10005]
          flex items-center gap-2 bg-green-500 text-white px-5 py-3
          rounded-2xl shadow-xl"
        style={{ animation: "bannerSlideUp 0.4s ease" }}
      >
        <CheckCircle className="w-5 h-5 shrink-0" />
        <span className="font-semibold text-sm">{t("spin_banner_added")}</span>
        <style>{`
          @keyframes bannerSlideUp {
            from { opacity:0; transform: translateX(-50%) translateY(20px); }
            to   { opacity:1; transform: translateX(-50%) translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  if (!reward || dismissed) return null;

  const minVal    = Number(reward.minCartValue) || 0;
  const pct       = minVal ? Math.min(100, Math.round((cartVal / minVal) * 100)) : 100;
  const remaining = Math.max(0, minVal - cartVal).toFixed(0);

  return (
    /* LEFT side on md+ to avoid overlapping the right-side cart drawer */
    <div
      className="fixed bottom-4 left-4 right-4 md:left-4 md:right-auto md:w-80 z-[10005]
        bg-white rounded-2xl shadow-2xl border border-amber-200 overflow-hidden"
      style={{ animation: "bannerSlideUp2 0.4s ease" }}
    >
      {/* Header */}
      <div className="bg-amber-500 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Gift className="w-4 h-4 shrink-0" />
          <span className="text-sm font-bold">{t("spin_banner_title")}</span>
        </div>
        <button onClick={dismiss} className="text-amber-100 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        <p className="text-sm text-gray-700 font-medium">{reward.label}</p>
        <p className="text-xs text-gray-500">
          {pct < 100
            ? t("spin_banner_add_more").replace("{remaining}", formatPrice(remaining))
            : t("spin_banner_unlocking")}
        </p>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{formatPrice(cartVal.toFixed(0))}</span>
          <span>{formatPrice(minVal)}</span>
        </div>
      </div>

      <style>{`
        @keyframes bannerSlideUp2 {
          from { opacity:0; transform: translateY(20px); }
          to   { opacity:1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
