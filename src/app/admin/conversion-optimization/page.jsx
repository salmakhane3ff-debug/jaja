"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp, Save, Check, RotateCcw, Eye, EyeOff, AlertTriangle,
  Flame, Users, Package, BarChart2, ShoppingBag, ChevronDown, ChevronUp,
  Shuffle,
} from "lucide-react";

// ── Defaults ───────────────────────────────────────────────────────────────────
const DEFAULTS = {
  soldCounter:    { enabled: true,  count: 7,  hours: 6 },
  liveViewers:    { enabled: true,  min: 6,    max: 15 },
  lowStock:       { enabled: true,  remaining: 5 },
  stockProgress:  { enabled: true,  sold: 18,  total: 30 },
  purchasePopup:  { enabled: false, interval: 20 },
  randomStockBar: { enabled: true },   // ← controls the always-on random bar on every product page
};

// ── Toggle ─────────────────────────────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex-shrink-0 w-12 h-6 rounded-full transition-colors relative focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        value ? "bg-blue-600" : "bg-gray-200"
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          value ? "translate-x-6" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ── NumberInput ────────────────────────────────────────────────────────────────
function NumberInput({ label, value, onChange, min = 0, max, hint }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.max(min, parseInt(e.target.value) || min))}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// ── SectionCard ────────────────────────────────────────────────────────────────
function SectionCard({ icon, title, subtitle, color, enabled, onToggle, children, preview }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`bg-white rounded-2xl border-2 transition-colors ${enabled ? "border-blue-200" : "border-gray-200"}`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-400 truncate">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <Toggle value={enabled} onChange={onToggle} />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Body */}
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
          <div className={`transition-opacity ${enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
            {children}
          </div>

          {/* Live Preview */}
          {preview && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 mb-2">Preview</p>
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                {preview}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Progress bar preview ───────────────────────────────────────────────────────
function ProgressBarPreview({ sold, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((sold / total) * 100)) : 0;
  const color = pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-orange-400" : "bg-green-500";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>🔥 {sold} من {total} قطعة بيعت</span>
        <span className="font-semibold">{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
        <div className={`h-2.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-red-600 font-medium">سارع قبل نفاذ الكمية!</p>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ConversionOptimizationPage() {
  const [form,   setForm]   = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState("");

  // Load saved settings
  useEffect(() => {
    fetch("/api/setting?type=conversion-settings")
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          setForm((prev) => ({
            soldCounter:    { ...prev.soldCounter,    ...(data.soldCounter    || {}) },
            liveViewers:    { ...prev.liveViewers,    ...(data.liveViewers    || {}) },
            lowStock:       { ...prev.lowStock,       ...(data.lowStock       || {}) },
            stockProgress:  { ...prev.stockProgress,  ...(data.stockProgress  || {}) },
            purchasePopup:  { ...prev.purchasePopup,  ...(data.purchasePopup  || {}) },
            randomStockBar: { ...prev.randomStockBar, ...(data.randomStockBar || {}) },
          }));
        }
      })
      .catch(() => {});
  }, []);

  // ── Nested setter helper ───────────────────────────────────────────────────
  const set = (section, key, value) =>
    setForm((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/setting?type=conversion-settings", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const { soldCounter, liveViewers, lowStock, stockProgress, purchasePopup, randomStockBar } = form;
  const previewViewers = Math.floor((liveViewers.min + liveViewers.max) / 2);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center flex-shrink-0">
            <TrendingUp size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Conversion Optimization</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Control urgency, scarcity &amp; social proof elements shown to visitors
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">

        {/* ── Info banner ── */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex gap-3 items-start">
          <TrendingUp size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-700 leading-relaxed">
            All numbers are <strong>simulated</strong> — they're admin-controlled values designed to create urgency and
            boost conversions. No real inventory data is used.
          </p>
        </div>

        {/* ── SECTION 1 — Sold Counter ── */}
        <SectionCard
          icon={<Flame size={18} className="text-white" />}
          color="bg-orange-500"
          title="Sold Recently Counter"
          subtitle="Show how many units sold in a recent time window"
          enabled={soldCounter.enabled}
          onToggle={(v) => set("soldCounter", "enabled", v)}
          preview={
            <p className="text-sm font-medium text-orange-700">
              🔥 تم بيع {soldCounter.count} خلال آخر {soldCounter.hours} ساعات
            </p>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label="Units sold"
              value={soldCounter.count}
              onChange={(v) => set("soldCounter", "count", v)}
              min={1}
              hint="e.g. 7"
            />
            <NumberInput
              label="Time window (hours)"
              value={soldCounter.hours}
              onChange={(v) => set("soldCounter", "hours", v)}
              min={1}
              hint="e.g. 6"
            />
          </div>
        </SectionCard>

        {/* ── SECTION 2 — Live Viewers ── */}
        <SectionCard
          icon={<Users size={18} className="text-white" />}
          color="bg-blue-500"
          title="Live Viewers"
          subtitle="Show a random viewer count between min and max"
          enabled={liveViewers.enabled}
          onToggle={(v) => set("liveViewers", "enabled", v)}
          preview={
            <p className="text-sm font-medium text-blue-700">
              👀 {previewViewers} شخص يشاهد هذا المنتج الآن
            </p>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label="Minimum viewers"
              value={liveViewers.min}
              onChange={(v) => set("liveViewers", "min", Math.min(v, liveViewers.max - 1))}
              min={1}
              hint="e.g. 6"
            />
            <NumberInput
              label="Maximum viewers"
              value={liveViewers.max}
              onChange={(v) => set("liveViewers", "max", Math.max(v, liveViewers.min + 1))}
              min={2}
              hint="e.g. 15"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            A random number between {liveViewers.min} and {liveViewers.max} is displayed and refreshed every ~30 seconds.
          </p>
        </SectionCard>

        {/* ── SECTION 3 — Low Stock Warning ── */}
        <SectionCard
          icon={<Package size={18} className="text-white" />}
          color="bg-red-500"
          title="Low Stock Warning"
          subtitle="Alert shoppers when stock is running out"
          enabled={lowStock.enabled}
          onToggle={(v) => set("lowStock", "enabled", v)}
          preview={
            <p className="text-sm font-medium text-red-700">
              ⚠️ بقي {lowStock.remaining} قطع فقط!
            </p>
          }
        >
          <NumberInput
            label="Remaining items"
            value={lowStock.remaining}
            onChange={(v) => set("lowStock", "remaining", v)}
            min={1}
            hint="Shown as: ⚠️ بقي X قطع فقط"
          />
        </SectionCard>

        {/* ── SECTION 4 — Stock Progress Bar ── */}
        <SectionCard
          icon={<BarChart2 size={18} className="text-white" />}
          color="bg-green-600"
          title="Stock Progress Bar"
          subtitle="Visual sold/total bar to create scarcity"
          enabled={stockProgress.enabled}
          onToggle={(v) => set("stockProgress", "enabled", v)}
          preview={<ProgressBarPreview sold={stockProgress.sold} total={stockProgress.total} />}
        >
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label="Units sold"
              value={stockProgress.sold}
              onChange={(v) => set("stockProgress", "sold", Math.min(v, stockProgress.total))}
              min={0}
              hint="e.g. 18"
            />
            <NumberInput
              label="Total stock"
              value={stockProgress.total}
              onChange={(v) => set("stockProgress", "total", Math.max(v, stockProgress.sold))}
              min={1}
              hint="e.g. 30"
            />
          </div>
          <p className="text-xs text-gray-400">
            Progress: {stockProgress.total > 0 ? Math.round((stockProgress.sold / stockProgress.total) * 100) : 0}% sold —
            bar turns red above 80%, orange above 50%.
          </p>
        </SectionCard>

        {/* ── SECTION 5 — Purchase Popup ── */}
        <SectionCard
          icon={<ShoppingBag size={18} className="text-white" />}
          color="bg-purple-600"
          title="Recent Purchase Popup"
          subtitle="Show floating 'someone just bought this' notifications"
          enabled={purchasePopup.enabled}
          onToggle={(v) => set("purchasePopup", "enabled", v)}
          preview={
            <div className="flex items-center gap-3 bg-white rounded-xl shadow-sm border border-gray-100 p-3">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <ShoppingBag size={14} className="text-green-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">Ahmed من Casablanca</p>
                <p className="text-xs text-gray-500">اشترى هذا المنتج قبل 5 دقائق</p>
              </div>
            </div>
          }
        >
          <NumberInput
            label="Popup interval (seconds)"
            value={purchasePopup.interval}
            onChange={(v) => set("purchasePopup", "interval", v)}
            min={5}
            max={120}
            hint="How often a new popup appears. Min 5s, Max 120s."
          />
        </SectionCard>

        {/* ── SECTION 6 — Random Stock Bar (all products) ── */}
        <SectionCard
          icon={<Shuffle size={18} className="text-white" />}
          color="bg-orange-500"
          title="Random Stock Progress Bar"
          subtitle="Shows on every product page — realistic simulated scarcity"
          enabled={randomStockBar.enabled}
          onToggle={(v) => set("randomStockBar", "enabled", v)}
          preview={
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-orange-600">🔥 24 من 34 وحدة تم بيعها</p>
              <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div className="h-2.5 rounded-full bg-orange-400 transition-all" style={{ width: "71%" }} />
              </div>
              <p className="text-xs font-medium text-orange-600">تم بيع 71% — سارع قبل النفاذ!</p>
            </div>
          }
        >
          <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
            <p>
              When <strong>enabled</strong>, every product page displays a progress bar
              with <strong>realistic random values</strong> — e.g. "24 of 34 units sold" —
              generated once per product and cached in the visitor's browser so the numbers
              stay consistent across page refreshes.
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs text-gray-500">
              <li>Total stock: randomly 20 – 60 units</li>
              <li>% sold: biased toward 50 – 85 % for maximum urgency</li>
              <li>Color: <span className="text-green-600 font-semibold">green</span> below 50 %, <span className="text-orange-500 font-semibold">orange</span> 50–79 %, <span className="text-red-600 font-semibold">red</span> ≥ 80 %</li>
              <li>Products with admin-set values (per-product editor) override these randoms</li>
            </ul>
            <p className="text-xs text-gray-400">
              Disable to hide the bar from all product pages instantly.
            </p>
          </div>
        </SectionCard>

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
            <AlertTriangle size={15} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex items-center justify-between pt-2 pb-8">
          <button
            type="button"
            onClick={() => { setForm(DEFAULTS); setError(""); }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <RotateCcw size={14} />
            Reset to defaults
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl transition-all shadow-sm ${
              saved
                ? "bg-green-600 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
            }`}
          >
            {saved ? (
              <><Check size={16} /> Saved!</>
            ) : saving ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
            ) : (
              <><Save size={16} /> Save Settings</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
