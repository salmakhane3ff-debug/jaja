"use client";

import { useState, useEffect, useRef } from "react";
import {
  Shield, Type, Image as ImageIcon, Save, Eye, RefreshCw,
  Loader2, Check, AlertTriangle, Sliders, Grid, Layers,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const FONTS = ["sans-serif", "serif", "monospace", "Arial", "Georgia", "Verdana", "Tahoma", "Courier New"];

const PLACEMENTS = [
  { value: "top-left",     label: "Top Left" },
  { value: "top-right",    label: "Top Right" },
  { value: "center",       label: "Center" },
  { value: "bottom-left",  label: "Bottom Left" },
  { value: "bottom-right", label: "Bottom Right (recommended)" },
  { value: "repeat-5",     label: "Repeat × 5 (all corners)" },
  { value: "repeat-6",     label: "Repeat × 6 (corners + top center + bottom center)" },
  { value: "grid",         label: "Grid (3×3 tiled)" },
];

const DEFAULT = {
  isEnabled: false, type: "text",
  text: "© My Store", fontFamily: "sans-serif", fontSize: 28,
  fontColor: "#ffffff", textRotation: -30,
  logoUrl: "", logoSize: 20, logoMargin: 20,
  opacity: 0.5, placement: "bottom-right",
};

// ── Slider input ──────────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step = 1, onChange, unit = "" }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-gray-600">{label}</label>
        <span className="text-xs font-bold text-gray-800">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10))}
        className="w-full h-2 rounded-full accent-indigo-600 cursor-pointer"
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WatermarkPage() {
  const [settings,    setSettings]    = useState(DEFAULT);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [toast,       setToast]       = useState(null);
  const [previewSrc,  setPreviewSrc]  = useState(null);
  const [previewing,  setPreviewing]  = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);
  const [applyResult, setApplyResult] = useState(null);
  const previewInput = useRef(null);
  const logoInput    = useRef(null);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const set = (key, val) => setSettings((s) => ({ ...s, [key]: val }));

  useEffect(() => {
    fetch("/api/admin/watermark")
      .then((r) => r.json())
      .then((d) => setSettings({ ...DEFAULT, ...d }))
      .catch(() => showToast("Failed to load settings", "err"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/watermark", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setSettings((s) => ({ ...s, ...updated }));
      showToast("Settings saved");
    } catch {
      showToast("Save failed", "err");
    } finally {
      setSaving(false);
    }
  };

  // ── Preview watermark on test image ────────────────────────────────────────
  const handlePreviewFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewing(true);
    setPreviewSrc(null);
    try {
      // Save settings first so server uses latest
      await fetch("/api/admin/watermark", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/watermark?action=preview", { method: "POST", body: fd });
      const { dataUrl } = await res.json();
      setPreviewSrc(dataUrl);
    } catch {
      showToast("Preview failed", "err");
    } finally {
      setPreviewing(false);
      e.target.value = "";
    }
  };

  // ── Upload logo ─────────────────────────────────────────────────────────────
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res  = await fetch("/api/image", { method: "POST", body: fd });
      const data = await res.json();
      set("logoUrl", data.url);
      showToast("Logo uploaded");
    } catch {
      showToast("Logo upload failed", "err");
    }
    e.target.value = "";
  };

  // ── Apply watermark to all existing images ──────────────────────────────────
  const applyAll = async () => {
    if (!confirm("This will permanently overwrite all existing images in /uploads/ with watermarked versions. Continue?")) return;
    setApplyingAll(true);
    setApplyResult(null);
    try {
      await fetch("/api/admin/watermark", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const res  = await fetch("/api/admin/watermark?action=apply-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setApplyResult(data);
      showToast(`Done — ${data.processed} images processed`);
    } catch (err) {
      showToast(err.message || "Apply failed", "err");
    } finally {
      setApplyingAll(false);
    }
  };

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
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
          ${toast.type === "ok" ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
          {toast.type === "ok" ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-500" /> Media Watermark
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Auto-protect all uploaded images from content theft</p>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl
            hover:bg-indigo-700 disabled:opacity-60 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT COLUMN ── */}
        <div className="lg:col-span-1 space-y-4">

          {/* Enable */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">Enable Watermark</p>
                <p className="text-xs text-gray-400 mt-0.5">Applied to every new upload</p>
              </div>
              <button onClick={() => set("isEnabled", !settings.isEnabled)}
                className={`w-12 h-6 rounded-full transition-colors relative ${settings.isEnabled ? "bg-indigo-500" : "bg-gray-200"}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${settings.isEnabled ? "left-6" : "left-0.5"}`} />
              </button>
            </div>
            {settings.isEnabled && (
              <p className="mt-2 text-xs text-green-600 flex items-center gap-1">
                <Check className="w-3 h-3" /> Active — new uploads will be watermarked
              </p>
            )}
          </div>

          {/* Type selector */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm">Watermark Type</h3>
            <div className="grid grid-cols-2 gap-2">
              {[["text", "Text", Type], ["logo", "Logo Image", ImageIcon]].map(([val, label, Icon]) => (
                <button key={val} onClick={() => set("type", val)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-sm font-medium transition-all
                    ${settings.type === val ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                  <Icon className="w-5 h-5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Placement */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <Grid className="w-4 h-4 text-gray-400" /> Placement
            </h3>
            <div className="space-y-1">
              {PLACEMENTS.map(({ value, label }) => (
                <button key={value} onClick={() => set("placement", value)}
                  className={`w-full text-left text-xs px-3 py-2 rounded-lg transition-colors
                    ${settings.placement === value ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-600 hover:bg-gray-50"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Opacity */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 text-sm mb-3 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-gray-400" /> Transparency
            </h3>
            <Slider label="Opacity" value={settings.opacity} min={0.1} max={1.0} step={0.05}
              onChange={(v) => set("opacity", v)} unit="" />
            <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
              <span>More transparent</span><span>More visible</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Text settings */}
          {settings.type === "text" && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Type className="w-4 h-4 text-gray-400" /> Text Settings
              </h3>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Watermark Text</label>
                <input value={settings.text ?? ""}
                  onChange={(e) => set("text", e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-400"
                  placeholder="© Your Brand Name" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Font Family</label>
                  <select value={settings.fontFamily} onChange={(e) => set("fontFamily", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-400">
                    {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Font Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={settings.fontColor}
                      onChange={(e) => set("fontColor", e.target.value)}
                      className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
                    <input value={settings.fontColor}
                      onChange={(e) => set("fontColor", e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-400"
                      placeholder="#ffffff" />
                  </div>
                </div>
              </div>

              <Slider label="Font Size (px)" value={settings.fontSize} min={10} max={120}
                onChange={(v) => set("fontSize", v)} unit="px" />
              <Slider label="Text Rotation" value={settings.textRotation} min={-180} max={180}
                onChange={(v) => set("textRotation", v)} unit="°" />

              {/* Live text preview */}
              <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-800 flex items-center justify-center"
                style={{ height: 100 }}>
                <span style={{
                  fontFamily: settings.fontFamily,
                  fontSize:   settings.fontSize * 0.6,
                  color:      settings.fontColor,
                  opacity:    settings.opacity,
                  transform:  `rotate(${settings.textRotation}deg)`,
                  display:    "inline-block",
                  whiteSpace: "nowrap",
                }}>
                  {settings.text || "Watermark Preview"}
                </span>
              </div>
            </div>
          )}

          {/* Logo settings */}
          {settings.type === "logo" && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-gray-400" /> Logo Settings
              </h3>

              {/* Logo upload */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-2">Logo Image</label>
                {settings.logoUrl ? (
                  <div className="flex items-center gap-3">
                    <img src={settings.logoUrl} alt="Logo"
                      className="w-16 h-16 object-contain rounded-xl border border-gray-200 bg-gray-50" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 truncate">{settings.logoUrl}</p>
                      <button onClick={() => set("logoUrl", "")}
                        className="text-xs text-red-500 hover:text-red-700 mt-1">Remove logo</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => logoInput.current?.click()}
                    className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                    Click to upload logo PNG (transparent background recommended)
                  </button>
                )}
                <input ref={logoInput} type="file" accept="image/png,image/webp,image/svg+xml" hidden onChange={handleLogoUpload} />
              </div>

              <Slider label="Logo Size" value={settings.logoSize} min={5} max={50}
                onChange={(v) => set("logoSize", v)} unit="%" />
              <Slider label="Logo Margin" value={settings.logoMargin} min={0} max={100}
                onChange={(v) => set("logoMargin", v)} unit="px" />
            </div>
          )}

          {/* Preview */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Eye className="w-4 h-4 text-gray-400" /> Preview Watermark
            </h3>
            <p className="text-xs text-gray-500">Upload a test image to see exactly how your watermark will look.</p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => previewInput.current?.click()}
                disabled={previewing}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl
                  hover:bg-gray-700 disabled:opacity-60 transition-colors">
                {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                {previewing ? "Processing…" : "Choose Test Image"}
              </button>
              {previewSrc && (
                <button onClick={() => setPreviewSrc(null)}
                  className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
              )}
            </div>
            <input ref={previewInput} type="file" accept="image/*" hidden onChange={handlePreviewFile} />

            {previewSrc && (
              <div className="rounded-xl overflow-hidden border border-gray-200">
                <img src={previewSrc} alt="Watermark preview" className="w-full object-contain max-h-80" />
              </div>
            )}
          </div>

          {/* Apply to existing */}
          <div className="bg-white rounded-2xl border border-amber-200 p-5 space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-500" /> Apply to Existing Media
            </h3>
            <div className="bg-amber-50 rounded-xl px-3 py-2 text-xs text-amber-700">
              <strong>Warning:</strong> This will overwrite all existing images in /uploads/ with watermarked versions.
              This action cannot be undone. Make sure to save settings first.
            </div>
            <button
              onClick={applyAll}
              disabled={applyingAll || !settings.isEnabled}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-semibold rounded-xl
                hover:bg-amber-600 disabled:opacity-60 transition-colors">
              {applyingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {applyingAll ? "Processing…" : "Apply Watermark to All Images"}
            </button>
            {!settings.isEnabled && (
              <p className="text-xs text-gray-400">Enable watermark first to use this feature.</p>
            )}
            {applyResult && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Processed {applyResult.processed} of {applyResult.total} images successfully.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
