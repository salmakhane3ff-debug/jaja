"use client";

import { useState, useEffect, useRef } from "react";
import {
  Settings, Plus, Trash2, Save, BarChart2, Eye, MousePointer,
  Gift, Tag, Truck, X, ChevronDown, ChevronUp, Loader2, RefreshCw,
  Upload, Search, ImageIcon,
} from "lucide-react";

// ── Colour palette for segments ───────────────────────────────────────────────
const COLORS = [
  "#ef4444","#f97316","#f59e0b","#84cc16","#10b981",
  "#06b6d4","#6366f1","#8b5cf6","#ec4899","#94a3b8",
];

const REWARD_LABELS = {
  none:         "No Reward",
  coupon:       "Coupon Code",
  free_shipping:"Free Shipping",
  product:      "Free Product",
};

const DEFAULT_SEGMENT = {
  label: "", color: "#6366f1", image: "", rewardType: "none",
  probability: 10, couponCode: "", productId: "", minCartValue: 0,
};

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color = "blue" }) {
  const cls = {
    blue:   "bg-blue-50 text-blue-600",
    green:  "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
    red:    "bg-red-50 text-red-600",
    teal:   "bg-teal-50 text-teal-600",
    indigo: "bg-indigo-50 text-indigo-600",
    gray:   "bg-gray-50 text-gray-600",
  }[color] || "bg-blue-50 text-blue-600";

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cls}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value ?? "—"}</p>
      </div>
    </div>
  );
}

// ── Image uploader for segments ────────────────────────────────────────────────
function SegmentImageUploader({ value, onChange }) {
  const fileRef   = useRef(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch("/api/image", { method: "POST", body: fd });
      const data = await res.json();
      if (data.url) onChange(data.url);
    } catch {
      alert("Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-gray-600 block">Segment Image</label>
      <div className="flex gap-2 items-start">
        {/* Preview */}
        <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 overflow-hidden flex items-center justify-center bg-gray-50 shrink-0">
          {value ? (
            <img src={value} alt="seg" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-5 h-5 text-gray-300" />
          )}
        </div>

        <div className="flex-1 space-y-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-600 text-xs
              font-medium rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-60 w-full justify-center"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {busy ? "Uploading…" : "Upload Image"}
          </button>
          <input
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg
              focus:outline-none focus:border-indigo-400"
            placeholder="or paste URL…"
          />
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => upload(e.target.files?.[0])}
      />
    </div>
  );
}

// ── Product picker for segments ────────────────────────────────────────────────
function ProductPicker({ value, onChange }) {
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState(null);
  const [open,     setOpen]     = useState(false);
  const timerRef = useRef(null);

  // Load selected product name on mount / value change
  useEffect(() => {
    if (!value) { setSelected(null); return; }
    fetch(`/api/products/${value}`)
      .then((r) => r.json())
      .then((d) => { if (d?._id) setSelected(d); })
      .catch(() => {});
  }, [value]);

  const search = (q) => {
    setQuery(q);
    clearTimeout(timerRef.current);
    if (!q.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=8`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : data.products || []);
      } catch { setResults([]); }
      finally   { setLoading(false); }
    }, 350);
  };

  const pick = (prod) => {
    setSelected(prod);
    onChange(prod._id);
    setOpen(false);
    setQuery("");
    setResults([]);
  };

  return (
    <div className="space-y-1 relative">
      <label className="text-xs font-medium text-gray-600 block">Product</label>

      {/* Selected display */}
      {selected && (
        <div className="flex items-center gap-2 p-2 bg-indigo-50 rounded-lg border border-indigo-200 mb-1">
          {(selected.images?.[0]?.url || selected.images?.[0]) && (
            <img
              src={selected.images[0]?.url || selected.images[0]}
              alt=""
              className="w-8 h-8 object-cover rounded"
            />
          )}
          <span className="text-xs font-medium text-indigo-800 flex-1 truncate">{selected.title}</span>
          <button
            type="button"
            onClick={() => { setSelected(null); onChange(""); }}
            className="text-indigo-400 hover:text-red-500 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          value={query}
          onChange={(e) => { search(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg
            focus:outline-none focus:border-indigo-400"
          placeholder="Search products…"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-gray-400" />
        )}
      </div>

      {/* Dropdown results */}
      {open && results.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200
          rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {results.map((prod) => {
            const img = prod.images?.[0]?.url || prod.images?.[0] || null;
            return (
              <button
                key={prod._id}
                type="button"
                onClick={() => pick(prod)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-indigo-50 transition-colors text-left"
              >
                {img && <img src={img} alt="" className="w-8 h-8 object-cover rounded shrink-0" />}
                <span className="text-sm text-gray-800 truncate">{prod.title}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Fallback: manual ID entry */}
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg
          focus:outline-none focus:border-indigo-400 text-gray-500"
        placeholder="or paste Product ID directly"
      />
    </div>
  );
}

// ── Segment row ───────────────────────────────────────────────────────────────
function SegmentRow({ seg, idx, onChange, onRemove, totalPct }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl overflow-visible">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-gray-50 cursor-pointer rounded-xl"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Color swatch + image preview */}
        <div className="w-8 h-8 rounded-lg shrink-0 overflow-hidden border-2 border-white shadow-sm"
          style={{ background: seg.color }}>
          {seg.image && (
            <img src={seg.image} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <span className="flex-1 font-medium text-sm text-gray-800 truncate">
          {seg.label || `Segment ${idx + 1}`}
        </span>
        <span className="text-xs text-gray-400">{seg.probability}%</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600">
          {REWARD_LABELS[seg.rewardType] || seg.rewardType}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-red-400 hover:text-red-600 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-400" />
          : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>

      {/* Expanded fields */}
      {open && (
        <div className="p-4 grid grid-cols-2 gap-4 border-t border-gray-100">

          {/* Label + Color */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Label</label>
            <input
              value={seg.label}
              onChange={(e) => onChange("label", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
              placeholder="e.g. 10% OFF"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Color</label>
            <div className="flex gap-1.5 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange("color", c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform
                    ${seg.color === c ? "border-gray-800 scale-110" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          {/* Reward type + Probability */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Reward Type</label>
            <select
              value={seg.rewardType}
              onChange={(e) => onChange("rewardType", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
            >
              {Object.entries(REWARD_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Probability %</label>
            <input
              type="number" min="0" max="100"
              value={seg.probability}
              onChange={(e) => onChange("probability", Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
            />
          </div>

          {/* Coupon code */}
          {seg.rewardType === "coupon" && (
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Coupon Code</label>
              <input
                value={seg.couponCode ?? ""}
                onChange={(e) => onChange("couponCode", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                placeholder="e.g. SPIN10"
              />
            </div>
          )}

          {/* Product picker */}
          {seg.rewardType === "product" && (
            <>
              <div className="col-span-2">
                <ProductPicker
                  value={seg.productId ?? ""}
                  onChange={(v) => onChange("productId", v)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Min Cart Value (MAD)</label>
                <input
                  type="number" min="0"
                  value={seg.minCartValue}
                  onChange={(e) => onChange("minCartValue", Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  0 = unlock immediately; &gt;0 = requires cart threshold
                </p>
              </div>
            </>
          )}

          {/* Image uploader */}
          <div className="col-span-2">
            <SegmentImageUploader
              value={seg.image || ""}
              onChange={(v) => onChange("image", v)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SpinWheelAdminPage() {
  const [config,   setConfig]   = useState(null);
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState(null);
  const [tab,      setTab]      = useState("config"); // config | analytics

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [cfgRes, statsRes] = await Promise.all([
        fetch("/api/spin-wheel-config?admin=true"),
        fetch("/api/spin-wheel-spin?admin=true"),
      ]);
      setConfig(await cfgRes.json());
      setStats(await statsRes.json());
    } catch {
      showToast("Failed to load", "err");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateField = (key, val) => setConfig((c) => ({ ...c, [key]: val }));

  const updateSegment = (idx, key, val) =>
    setConfig((c) => {
      const segs = [...c.segments];
      segs[idx] = { ...segs[idx], [key]: val };
      return { ...c, segments: segs };
    });

  const addSegment = () =>
    setConfig((c) => ({
      ...c,
      segments: [...c.segments, { ...DEFAULT_SEGMENT, color: COLORS[c.segments.length % COLORS.length] }],
    }));

  const removeSegment = (idx) =>
    setConfig((c) => ({ ...c, segments: c.segments.filter((_, i) => i !== idx) }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/spin-wheel-config", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(config),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setConfig(updated);
      showToast("Saved successfully");
    } catch {
      showToast("Save failed", "err");
    } finally {
      setSaving(false);
    }
  };

  const totalPct = config?.segments?.reduce((s, seg) => s + Number(seg.probability || 0), 0) || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="py-6 space-y-5 max-w-5xl">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
          ${toast.type === "ok" ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Gift className="w-6 h-6 text-indigo-500" /> Spin Wheel
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Gamified conversion tool — reward users to boost sales</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[["config", "Configuration", Settings], ["analytics", "Analytics", BarChart2]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === id ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ── ANALYTICS TAB ── */}
      {tab === "analytics" && stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Wheel Views"       value={stats.views}       icon={Eye}          color="blue"   />
            <StatCard label="Spins"             value={stats.clicks}      icon={MousePointer} color="purple" />
            <StatCard label="Wins"              value={stats.wins}        icon={Gift}         color="orange" />
            <StatCard label="Rewards Unlocked"  value={stats.unlocks}     icon={Gift}         color="green"  />
            <StatCard label="Coupons Used"      value={stats.coupons}     icon={Tag}          color="teal"   />
            <StatCard label="Orders Generated"  value={stats.orders}      icon={Truck}        color="indigo" />
            <StatCard label="Revenue (MAD)"     value={stats.revenue?.toFixed(0)} icon={BarChart2} color="green" />
            <StatCard label="Conversions"       value={stats.conversions} icon={BarChart2}    color="red"    />
          </div>
        </div>
      )}

      {/* ── CONFIG TAB ── */}
      {tab === "config" && config && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: General Settings */}
          <div className="lg:col-span-1 space-y-4">

            {/* Enable toggle */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">Enable Spin Wheel</p>
                  <p className="text-xs text-gray-400 mt-0.5">Show wheel to visitors</p>
                </div>
                <button type="button" onClick={() => updateField("isEnabled", !config.isEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${config.isEnabled ? "bg-indigo-500" : "bg-gray-200"}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${config.isEnabled ? "left-6" : "left-0.5"}`} />
                </button>
              </div>
            </div>

            {/* Display text */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <h3 className="font-semibold text-gray-900 text-sm">Display Text</h3>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Title</label>
                <input value={config.title} onChange={(e) => updateField("title", e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Subtitle</label>
                <input value={config.subtitle} onChange={(e) => updateField("subtitle", e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
              </div>
            </div>

            {/* Targeting */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <h3 className="font-semibold text-gray-900 text-sm">Targeting</h3>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Device</label>
                <select value={config.deviceTarget} onChange={(e) => updateField("deviceTarget", e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400">
                  <option value="both">Both (Desktop + Mobile)</option>
                  <option value="desktop">Desktop only</option>
                  <option value="mobile">Mobile only</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Page</label>
                <select value={config.pageTarget} onChange={(e) => updateField("pageTarget", e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400">
                  <option value="all">All Pages</option>
                  <option value="homepage">Homepage only</option>
                  <option value="product">Product Pages</option>
                  <option value="cart">Cart</option>
                  <option value="checkout">Checkout</option>
                </select>
              </div>
            </div>

            {/* Trigger */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <h3 className="font-semibold text-gray-900 text-sm">Trigger</h3>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Trigger Type</label>
                <select value={config.triggerType} onChange={(e) => updateField("triggerType", e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400">
                  <option value="seconds">After X seconds</option>
                  <option value="exit_intent">Exit Intent</option>
                  <option value="add_to_cart">After Add to Cart</option>
                  <option value="scroll">After Scroll %</option>
                </select>
              </div>
              {(config.triggerType === "seconds" || config.triggerType === "scroll") && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    {config.triggerType === "seconds" ? "Seconds" : "Scroll %"}
                  </label>
                  <input type="number" min="1" max="100" value={config.triggerValue}
                    onChange={(e) => updateField("triggerValue", Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
                </div>
              )}
            </div>
          </div>

          {/* Right: Segments */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-900">Wheel Segments</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Total probability:{" "}
                    <span className={totalPct === 100 ? "text-green-600 font-bold" : "text-orange-500 font-bold"}>
                      {totalPct}%
                    </span>
                    {totalPct !== 100 && " (should equal 100%)"}
                  </p>
                </div>
                <button onClick={addSegment}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-600 text-sm font-medium rounded-xl hover:bg-indigo-100 transition-colors">
                  <Plus className="w-4 h-4" /> Add Segment
                </button>
              </div>

              <div className="space-y-2">
                {config.segments?.map((seg, idx) => (
                  <SegmentRow
                    key={idx}
                    seg={seg}
                    idx={idx}
                    totalPct={totalPct}
                    onChange={(key, val) => updateSegment(idx, key, val)}
                    onRemove={() => removeSegment(idx)}
                  />
                ))}
                {!config.segments?.length && (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    No segments yet — click "Add Segment" to start.
                  </div>
                )}
              </div>
            </div>

            {/* Mini wheel preview */}
            {config.segments?.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 text-sm mb-3">Wheel Preview</h3>
                <div className="flex justify-center">
                  <WheelPreview segments={config.segments} size={220} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Static SVG preview ─────────────────────────────────────────────────────────
function WheelPreview({ segments, size = 200 }) {
  const cx = size / 2;
  const cy = size / 2;
  const r  = size / 2 - 4;
  const total = segments.reduce((s, seg) => s + (Number(seg.probability) || 0), 0) || 1;

  let paths = [];
  let angle = -Math.PI / 2; // start at top

  segments.forEach((seg, i) => {
    const slice = (Number(seg.probability) / total) * 2 * Math.PI;
    const endAngle = angle + slice;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const large = slice > Math.PI ? 1 : 0;

    const midAngle = angle + slice / 2;
    const lx = cx + (r * 0.62) * Math.cos(midAngle);
    const ly = cy + (r * 0.62) * Math.sin(midAngle);

    paths.push(
      <g key={i}>
        <path
          d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
          fill={seg.color}
          stroke="white"
          strokeWidth="1.5"
        />
        <text
          x={lx} y={ly}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={size < 180 ? 7 : 9}
          fontWeight="600"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {seg.label?.slice(0, 12)}
        </text>
      </g>
    );
    angle = endAngle;
  });

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r + 4} fill="#e2e8f0" />
        {paths}
        <circle cx={cx} cy={cy} r={size * 0.08} fill="white" stroke="#e2e8f0" strokeWidth="2" />
      </svg>
      {/* Arrow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1"
        style={{ width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "16px solid #1e293b" }} />
    </div>
  );
}
