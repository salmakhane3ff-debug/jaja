"use client";

/**
 * /admin/ui-control — UI Control System Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * Toggle any product page element, navbar item, or color on the fly.
 * Changes are persisted to the database and applied site-wide instantly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ToggleLeft, ToggleRight, RefreshCw, Save, Check, AlertTriangle,
  ShoppingCart, Heart, Share2, Tag, Layers, Palette, Layout,
  Eye, EyeOff, Zap, Star, LayoutDashboard, ChevronRight,
} from "lucide-react";

// ── Default values (must match API defaults) ──────────────────────────────────
const DEFAULTS = {
  showSpecialOffer:    true,
  specialOfferSlug:    "",
  showWishlistButton:  true,
  showShareButton:     true,
  showAddToCartButton: true,
  showBuyNowButton:    true,
  showStickyAddToCart: true,
  stickyShowBuyNow:    true,
  stickyVariant:       "A",
  showCartIcon:        true,
  showWishlistIcon:    true,
  showFeedbackBarIcon: true,
  primaryColor:        "#111827",
  secondaryColor:      "#ffffff",
  showRelatedProducts: true,
  enableImageZoom:     true,
  enableVideo:         true,
};

// ── Control Groups ────────────────────────────────────────────────────────────
const GROUPS = [
  {
    id:    "product",
    label: "Product Page",
    icon:  ShoppingCart,
    color: "indigo",
    controls: [
      { key: "showSpecialOffer",    label: "Special Offer Banner",   type: "toggle", desc: 'Shows "Buy 2 Get 1 Free" banner on product page' },
      { key: "specialOfferSlug",   label: "Cadeau Offert — Slug",   type: "text",   desc: "Slug du produit à afficher dans la bannière 2+1 gratuit (ex: creme-hydratante)" },
      { key: "showWishlistButton",  label: "Wishlist Button",        type: "toggle", desc: "Heart button to save product to wishlist" },
      { key: "showShareButton",     label: "Share Button",           type: "toggle", desc: "Share product link via native share or clipboard" },
      { key: "showAddToCartButton", label: "Add to Cart Button",     type: "toggle", desc: "Main add-to-cart CTA button on product page" },
      { key: "showBuyNowButton",    label: "Buy Now Button",         type: "toggle", desc: "Direct checkout button below Add to Cart" },
      { key: "showRelatedProducts", label: "Related Products",       type: "toggle", desc: "Show related products grid below the product" },
      { key: "enableImageZoom",     label: "Image Zoom Modal",       type: "toggle", desc: "Tap/click image to open full-screen zoom with swipe & arrows" },
      { key: "enableVideo",         label: "Video Media",            type: "toggle", desc: "Show video slides in product gallery (MP4, YouTube, Vimeo)" },
    ],
  },
  {
    id:    "sticky",
    label: "Sticky Bar",
    icon:  Layers,
    color: "purple",
    controls: [
      { key: "showStickyAddToCart", label: "Sticky Bar (Master)",    type: "toggle", desc: "The fixed bottom bar that appears when user scrolls past buttons" },
      { key: "stickyShowBuyNow",    label: "Buy Now in Sticky Bar",  type: "toggle", desc: "Show quick Buy Now button inside the sticky bar" },
      {
        key:     "stickyVariant",
        label:   "Sticky Bar Variant",
        type:    "select",
        options: [{ value: "A", label: "Variant A — Clean (gray/black)" }, { value: "B", label: "Variant B — Aggressive (red, pulsing)" }],
        desc:    "A/B design test for the sticky bar UI",
      },
    ],
  },
  {
    id:    "header",
    label: "Header / Navbar",
    icon:  Layout,
    color: "blue",
    controls: [
      { key: "showCartIcon",        label: "Cart Icon",              type: "toggle", desc: "Shopping cart icon in the top navigation bar" },
      { key: "showWishlistIcon",    label: "Wishlist Icon",          type: "toggle", desc: "Heart icon in the navigation bar" },
      { key: "showFeedbackBarIcon", label: "Reviews Icon",           type: "toggle", desc: "Star icon that links to reviews/feedback page" },
    ],
  },
  {
    id:    "colors",
    label: "UI Colors",
    icon:  Palette,
    color: "amber",
    controls: [
      { key: "primaryColor",   label: "Primary Color",   type: "color", desc: "Main brand color (buttons, accents)" },
      { key: "secondaryColor", label: "Secondary Color", type: "color", desc: "Secondary / background color" },
    ],
  },
];

// ── Color map for group icons ─────────────────────────────────────────────────
const GROUP_COLORS = {
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600", border: "border-indigo-100",  ring: "ring-indigo-200" },
  purple: { bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-100",  ring: "ring-purple-200" },
  blue:   { bg: "bg-blue-50",   text: "text-blue-600",   border: "border-blue-100",    ring: "ring-blue-200" },
  amber:  { bg: "bg-amber-50",  text: "text-amber-600",  border: "border-amber-100",   ring: "ring-amber-200" },
};

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500
        ${checked ? "bg-gray-900" : "bg-gray-200"}
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out
        ${checked ? "translate-x-5" : "translate-x-0"}
      `} />
    </button>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ value }) {
  const isOn = value === true || value === "true";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full
      ${isOn ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
      {isOn ? <Eye size={9} /> : <EyeOff size={9} />}
      {isOn ? "ON" : "OFF"}
    </span>
  );
}

// ── Save indicator ────────────────────────────────────────────────────────────
function SaveIndicator({ state }) {
  if (state === "idle")   return null;
  if (state === "saving") return <span className="text-xs text-gray-400 flex items-center gap-1"><RefreshCw size={11} className="animate-spin" />Saving…</span>;
  if (state === "saved")  return <span className="text-xs text-green-600 flex items-center gap-1"><Check size={11} />Saved</span>;
  if (state === "error")  return <span className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={11} />Error</span>;
  return null;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UIControlPage() {
  const [settings,  setSettings]  = useState(DEFAULTS);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [loading,   setLoading]   = useState(true);
  const saveTimer = useRef(null);

  // ── Load current settings ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/ui-control", { cache: "no-store" });
      const j = await r.json();
      setSettings({ ...DEFAULTS, ...j });
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Save a single key ──────────────────────────────────────────────────────
  const save = useCallback(async (key, value) => {
    clearTimeout(saveTimer.current);
    setSaveState("saving");
    try {
      const r = await fetch("/api/ui-control", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ key, value }),
      });
      if (!r.ok) throw new Error();
      setSaveState("saved");
      saveTimer.current = setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      saveTimer.current = setTimeout(() => setSaveState("idle"), 3000);
    }
  }, []);

  // ── Handle change ──────────────────────────────────────────────────────────
  const handleChange = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    save(key, value);
  }, [save]);

  // ── Bulk reset to defaults ─────────────────────────────────────────────────
  const handleResetAll = async () => {
    if (!confirm("Reset ALL settings to defaults?")) return;
    setSaveState("saving");
    const pairs = Object.entries(DEFAULTS).map(([key, value]) => ({ key, value }));
    try {
      await fetch("/api/ui-control", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(pairs),
      });
      setSettings({ ...DEFAULTS });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  };

  // ── Count active controls ──────────────────────────────────────────────────
  const toggleCount  = Object.entries(settings).filter(([k, v]) => typeof DEFAULTS[k] === "boolean" && v === true).length;
  const totalToggles = Object.entries(DEFAULTS).filter(([, v]) => typeof v === "boolean").length;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl mx-auto" dir="ltr">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <LayoutDashboard size={20} className="text-indigo-500" />
            UI Control
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Show or hide any element site-wide — changes apply instantly
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator state={saveState} />
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={handleResetAll}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-all">
            Reset Defaults
          </button>
        </div>
      </div>

      {/* ── Summary Strip ── */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl px-5 py-4 flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-indigo-100 flex items-center justify-center">
            <Eye size={18} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Active Features</p>
            <p className="text-xl font-bold text-gray-900">{toggleCount} <span className="text-sm font-normal text-gray-400">/ {totalToggles}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="w-full h-full" style={{ backgroundColor: settings.primaryColor }} />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Primary Color</p>
            <code className="text-sm font-mono font-bold text-gray-900">{settings.primaryColor}</code>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="w-full h-full" style={{ backgroundColor: settings.secondaryColor }} />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Secondary Color</p>
            <code className="text-sm font-mono font-bold text-gray-900">{settings.secondaryColor}</code>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Zap size={14} className="text-indigo-400" />
          <span className="text-xs text-indigo-600 font-medium">Auto-saves on change</span>
        </div>
      </div>

      {/* ── Control Groups ── */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          {GROUPS.map((g) => (
            <div key={g.id} className="bg-white rounded-2xl border border-gray-100 h-48" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {GROUPS.map((group) => {
            const gc     = GROUP_COLORS[group.color];
            const Icon   = group.icon;
            const active = group.controls.filter((c) => c.type === "toggle" && settings[c.key] === true).length;
            const total  = group.controls.filter((c) => c.type === "toggle").length;

            return (
              <div key={group.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Group header */}
                <div className={`flex items-center justify-between px-5 py-4 border-b ${gc.border} bg-gradient-to-r from-white to-gray-50`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${gc.bg}`}>
                      <Icon size={18} className={gc.text} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-gray-900">{group.label}</h2>
                      {total > 0 && (
                        <p className="text-xs text-gray-400">{active}/{total} features active</p>
                      )}
                    </div>
                  </div>
                  {total > 0 && (
                    <div className="flex items-center gap-2">
                      {/* Turn all ON */}
                      <button
                        onClick={() => group.controls.filter((c) => c.type === "toggle").forEach((c) => handleChange(c.key, true))}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-50">
                        All ON
                      </button>
                      {/* Turn all OFF */}
                      <button
                        onClick={() => group.controls.filter((c) => c.type === "toggle").forEach((c) => handleChange(c.key, false))}
                        className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100">
                        All OFF
                      </button>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="divide-y divide-gray-50">
                  {group.controls.map((ctrl) => (
                    <div key={ctrl.key}
                      className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors group">
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-gray-800">{ctrl.label}</span>
                          {ctrl.type === "toggle" && <StatusBadge value={settings[ctrl.key]} />}
                          {ctrl.type === "select" && (
                            <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                              {settings[ctrl.key]}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{ctrl.desc}</p>
                        <code className="text-[10px] text-gray-300 font-mono mt-0.5 block">{ctrl.key}</code>
                      </div>

                      {/* Text */}
                      {ctrl.type === "text" && (
                        <input
                          type="text"
                          value={settings[ctrl.key] || ""}
                          onChange={(e) => handleChange(ctrl.key, e.target.value)}
                          placeholder="slug-du-produit"
                          className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-mono text-gray-700 bg-white focus:outline-none focus:border-indigo-300 w-44"
                        />
                      )}

                      {/* Toggle */}
                      {ctrl.type === "toggle" && (
                        <Toggle
                          checked={settings[ctrl.key] === true}
                          onChange={(v) => handleChange(ctrl.key, v)}
                        />
                      )}

                      {/* Select */}
                      {ctrl.type === "select" && (
                        <select
                          value={settings[ctrl.key] || ""}
                          onChange={(e) => handleChange(ctrl.key, e.target.value)}
                          className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-medium text-gray-700 bg-white focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100"
                        >
                          {ctrl.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      )}

                      {/* Color */}
                      {ctrl.type === "color" && (
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-gray-500 hidden sm:block">{settings[ctrl.key]}</code>
                          <label className="relative cursor-pointer">
                            <div className="w-10 h-10 rounded-xl border-2 border-gray-200 overflow-hidden shadow-sm hover:border-gray-300 transition-colors">
                              <div className="w-full h-full" style={{ backgroundColor: settings[ctrl.key] }} />
                            </div>
                            <input
                              type="color"
                              value={settings[ctrl.key] || "#000000"}
                              onChange={(e) => handleChange(ctrl.key, e.target.value)}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Quick Reference ── */}
      <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <ChevronRight size={14} className="text-gray-400" /> How to use in code
        </h3>
        <pre className="text-xs text-gray-600 font-mono bg-white rounded-xl border border-gray-200 p-4 overflow-auto leading-relaxed">{`import { useUIControl } from "@/hooks/useUIControl";

function MyComponent() {
  const ui = useUIControl();

  if (!ui.showWishlistButton) return null;
  if (!ui.showStickyAddToCart) return null;

  return <button>Add to Wishlist</button>;
}`}</pre>
      </div>
    </div>
  );
}
