"use client";

/**
 * ConversionBadges
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders urgency / scarcity / social-proof elements on the product page,
 * driven entirely by admin settings fetched from /api/setting?type=conversion-settings.
 *
 * Props: none (self-contained, fetches its own settings)
 *
 * Elements rendered (each conditional on its enabled flag):
 *   • Sold Counter  — "🔥 تم بيع N خلال آخر H ساعات"
 *   • Live Viewers  — "👀 N شخص يشاهد هذا المنتج الآن"  (refreshed every ~30s)
 *   • Low Stock     — "⚠️ بقي N قطع فقط!"
 *   • Stock Bar     — animated progress bar (sold / total)
 *   • Purchase Popup — floating bottom-left toast (interval driven)
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useSetting } from "@/context/SettingsContext";
import { fetchCached } from "@/lib/dataCache";

// ── Simulated buyer data ───────────────────────────────────────────────────────
const AR_NAMES  = ["أحمد", "محمد", "فاطمة", "خديجة", "يوسف", "آية", "ريم", "سارة", "هشام", "نور", "عمر", "لمياء"];
const AR_CITIES = ["الدار البيضاء", "الرباط", "مراكش", "فاس", "طنجة", "أكادير", "مكناس", "وجدة", "القنيطرة", "سطات"];
const FR_NAMES  = ["Ahmed", "Mohammed", "Fatima", "Sara", "Youssef", "Aya", "Hisham", "Rim", "Nour", "Omar"];
const FR_CITIES = ["Casablanca", "Rabat", "Marrakech", "Fès", "Tanger", "Agadir", "Meknès", "Oujda", "Kénitra", "Settat"];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// Extract the first usable image URL from a product record
function extractProductImage(product) {
  const imgs = product?.images;
  if (!imgs) return null;
  if (typeof imgs === "string") return imgs;
  if (Array.isArray(imgs) && imgs.length > 0) {
    const first = imgs[0];
    return first?.url || first?.src || (typeof first === "string" ? first : null);
  }
  return null;
}

// ── Default fallback (nothing enabled) ────────────────────────────────────────
const DEFAULTS = {
  soldCounter:   { enabled: false, count: 7,  hours: 6 },
  liveViewers:   { enabled: false, min: 6,    max: 15 },
  lowStock:      { enabled: false, remaining: 5 },
  stockProgress: { enabled: false, sold: 18,  total: 30 },
  purchasePopup: { enabled: false, interval: 20 },
};

// ── Progress bar sub-component ────────────────────────────────────────────────
function StockBar({ sold, total, t }) {
  const pct   = total > 0 ? Math.min(100, Math.round((sold / total) * 100)) : 0;
  const color = pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-orange-400" : "bg-green-500";
  return (
    <div className="space-y-1.5 py-1">
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span className="font-medium">
          {t("cv_stock_progress_label")
            .replace("{sold}", sold)
            .replace("{total}", total)}
        </span>
        <span className="text-gray-400">{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-2.5 rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-red-600 font-medium">{t("cv_stock_progress_caption")}</p>
    </div>
  );
}

// ── Purchase popup sub-component ──────────────────────────────────────────────
/**
 * Positioning logic (avoids the nav sidebar):
 *
 *   RTL (Arabic)  → sidebar slides from the RIGHT  → popup anchors BOTTOM-LEFT
 *   LTR (French)  → sidebar slides from the LEFT   → popup anchors BOTTOM-RIGHT
 *
 * Z-index is z-[9999] — above the sidebar (z-50), HeroUI drawer, and every
 * other overlay so the notification is always fully readable.
 */
function PurchasePopup({ settings, lang, dir, t }) {
  const [visible,    setVisible]    = useState(false);
  const [buyer,      setBuyer]      = useState({ name: "", city: "", mins: 5 });
  const [popupImage, setPopupImage] = useState(null);   // current random product image
  const timerRef   = useRef(null);
  const hideRef    = useRef(null);
  const imgPoolRef = useRef([]);   // pre-loaded image URLs — fetched once, never re-fetched

  const isRtl  = dir === "rtl";
  const names  = lang === "ar" ? AR_NAMES  : FR_NAMES;
  const cities = lang === "ar" ? AR_CITIES : FR_CITIES;

  // Corner that is AWAY from the sliding sidebar
  // RTL → sidebar on right → popup on left   (bottom-6 left-4)
  // LTR → sidebar on left  → popup on right  (bottom-6 right-4)
  const cornerClass = isRtl ? "bottom-6 left-4" : "bottom-6 right-4";

  // Fetch product images ONCE on mount — store URLs in a ref so it never
  // triggers a re-render and is never re-fetched on interval ticks.
  useEffect(() => {
    if (!settings.enabled) return;
    fetchCached("/api/products")
      .then((products) => {
        if (!Array.isArray(products)) return;
        const urls = products
          .map(extractProductImage)
          .filter(Boolean);           // drop nulls
        imgPoolRef.current = urls;
      })
      .catch(() => {});               // silently ignore — falls back to emoji
  }, [settings.enabled]);

  const showNext = () => {
    // Clear any pending hide timer before showing the next one
    clearTimeout(hideRef.current);
    setBuyer({ name: rand(names), city: rand(cities), mins: randInt(2, 30) });
    // Pick a different random image from the pool on every popup show
    if (imgPoolRef.current.length > 0) {
      setPopupImage(rand(imgPoolRef.current));
    }
    setVisible(true);
    // Auto-hide after 5 s
    hideRef.current = setTimeout(() => setVisible(false), 5000);
  };

  useEffect(() => {
    if (!settings.enabled) return;
    const intervalMs = Math.max(5, settings.interval || 20) * 1000;

    // First popup fires after a 3 s page-load grace period
    const first = setTimeout(showNext, 3000);
    // Subsequent popups: interval + 5 s hide gap so they never overlap
    timerRef.current = setInterval(showNext, intervalMs + 5000);

    return () => {
      clearTimeout(first);
      clearTimeout(hideRef.current);
      clearInterval(timerRef.current);
    };
  }, [settings.enabled, settings.interval]);

  if (!visible) return null;

  return (
    <div
      className={`fixed ${cornerClass} z-[9999] max-w-[calc(100vw-2rem)] w-72`}
      style={{ animation: "cvPopupSlideUp 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}
    >
      {/* Keyframe injected once — harmless duplicate declarations are ignored */}
      <style>{`
        @keyframes cvPopupSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>

      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 flex items-center gap-3 pointer-events-auto">
        {/* Product image — falls back to cart emoji if pool is empty */}
        <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-gray-100">
          {popupImage ? (
            <img
              src={popupImage}
              alt=""
              className="w-full h-full object-cover"
              loading="eager"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-green-100 flex items-center justify-center text-xl select-none">
              🛒
            </div>
          )}
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-800 truncate">
            {buyer.name} {t("cv_popup_from")} {buyer.city}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {t("cv_popup_bought_ago").replace("{n}", buyer.mins)}
          </p>
        </div>

        {/* Dismiss */}
        <button
          type="button"
          onClick={() => { clearTimeout(hideRef.current); setVisible(false); }}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors text-base leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ── Standalone popup — drop this anywhere outside the product page ─────────────
/**
 * PurchasePopupStandalone
 * Self-contained: fetches its own conversion-settings and language.
 * Use it on the home page, landing page, or any route that does not already
 * render <ConversionBadges /> (which includes the popup internally).
 */
export function PurchasePopupStandalone() {
  const { t, lang, dir }          = useLanguage();
  const { data: rawCfg, loaded }  = useSetting("conversion-settings");

  const settings = useMemo(() => {
    if (!loaded) return null;
    const src = (!rawCfg || rawCfg.error) ? {} : (rawCfg.purchasePopup || {});
    return { ...DEFAULTS.purchasePopup, ...src };
  }, [rawCfg, loaded]);

  if (!settings) return null;
  return <PurchasePopup settings={settings} lang={lang} dir={dir} t={t} />;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ConversionBadges() {
  const { t, lang, dir } = useLanguage();
  const { data: rawCfg, loaded } = useSetting("conversion-settings");
  const [viewers, setViewers] = useState(0);

  // Derive merged config from context data — no fetch needed
  const cfg = useMemo(() => {
    if (!loaded) return null;
    if (!rawCfg || rawCfg.error) return DEFAULTS;
    return {
      soldCounter:   { ...DEFAULTS.soldCounter,   ...(rawCfg.soldCounter   || {}) },
      liveViewers:   { ...DEFAULTS.liveViewers,   ...(rawCfg.liveViewers   || {}) },
      lowStock:      { ...DEFAULTS.lowStock,      ...(rawCfg.lowStock      || {}) },
      stockProgress: { ...DEFAULTS.stockProgress, ...(rawCfg.stockProgress || {}) },
      purchasePopup: { ...DEFAULTS.purchasePopup, ...(rawCfg.purchasePopup || {}) },
    };
  }, [rawCfg, loaded]);

  // Live viewers: set initial random value and refresh every 30s
  useEffect(() => {
    if (!cfg?.liveViewers?.enabled) return;
    const { min, max } = cfg.liveViewers;
    setViewers(randInt(min, max));
    const id = setInterval(() => setViewers(randInt(min, max)), 30_000);
    return () => clearInterval(id);
  }, [cfg?.liveViewers?.enabled, cfg?.liveViewers?.min, cfg?.liveViewers?.max]);

  // Nothing to render while loading or if all off
  if (!cfg) return null;
  const { soldCounter, liveViewers, lowStock, stockProgress, purchasePopup } = cfg;
  const anyBadge = soldCounter.enabled || liveViewers.enabled || lowStock.enabled || stockProgress.enabled;

  return (
    <>
      {/* ── Inline badges block ── */}
      {anyBadge && (
        <div className="space-y-2.5 py-1">

          {/* Sold counter */}
          {soldCounter.enabled && (
            <div className="flex items-center gap-2 text-sm text-orange-700 bg-orange-50 rounded-xl px-3 py-2 border border-orange-100">
              <span className="text-base">🔥</span>
              <span className="font-medium">
                {t("cv_sold_counter")
                  .replace("{count}", soldCounter.count)
                  .replace("{hours}", soldCounter.hours)}
              </span>
            </div>
          )}

          {/* Live viewers */}
          {liveViewers.enabled && (
            <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 rounded-xl px-3 py-2 border border-blue-100">
              <span className="text-base">👀</span>
              <span className="font-medium">
                {t("cv_live_viewers").replace("{count}", viewers)}
              </span>
            </div>
          )}

          {/* Low stock */}
          {lowStock.enabled && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2 border border-red-100">
              <span className="text-base">⚠️</span>
              <span className="font-medium">
                {t("cv_low_stock").replace("{count}", lowStock.remaining)}
              </span>
            </div>
          )}

          {/* Stock progress bar */}
          {stockProgress.enabled && (
            <div className="bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
              <StockBar sold={stockProgress.sold} total={stockProgress.total} t={t} />
            </div>
          )}
        </div>
      )}

      {/* ── Purchase popup (portal-style, fixed position) ── */}
      {purchasePopup.enabled && (
        <PurchasePopup settings={purchasePopup} lang={lang} dir={dir} t={t} />
      )}
    </>
  );
}
