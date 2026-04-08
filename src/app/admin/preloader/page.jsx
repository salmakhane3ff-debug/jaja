"use client";

import { useEffect, useState } from "react";
import { toast, Toaster } from "react-hot-toast";
import ImageSelector from "@/components/block/ImageSelector";
import { PRELOADER_DEFAULTS } from "@/lib/preloaderDefaults";

const ANIMATIONS = [
  { value: "bounce", label: "Bounce",  desc: "Saute de haut en bas" },
  { value: "pulse",  label: "Pulse",   desc: "Pulsation douce" },
  { value: "fade",   label: "Fade",    desc: "Fondu entrant/sortant" },
  { value: "scale",  label: "Scale",   desc: "Zoom avant/arrière" },
];

const DEFAULT_SETTINGS = {
  images:      PRELOADER_DEFAULTS.images,
  animation:   PRELOADER_DEFAULTS.animation,
  minDuration: PRELOADER_DEFAULTS.minDuration,
  text:        PRELOADER_DEFAULTS.text,
  showText:    PRELOADER_DEFAULTS.showText,
};

export default function PreloaderSettingsPage() {
  const [settings,  setSettings]  = useState(DEFAULT_SETTINGS);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [imgOpen,   setImgOpen]   = useState(false);

  // Load saved settings
  useEffect(() => {
    fetch("/api/setting?type=preloader")
      .then(r => r.json())
      .then(data => {
        if (data && Object.keys(data).length > 0) {
          setSettings(prev => ({ ...prev, ...data }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/setting?type=preloader", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      toast.success("Paramètres sauvegardés ! Rechargez la page pour voir les changements.");
    } catch {
      toast.error("Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentImage = settings.images?.[0] || "/logonc.svg";

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6" dir="ltr">
      <Toaster position="top-right" />

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Paramètres du Preloader</h1>
        <p className="text-sm text-gray-500 mt-1">
          Personnalisez l'écran de chargement affiché à l'ouverture du site.
        </p>
      </div>

      {/* ── Image ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Image / Logo</h2>

        <div className="flex items-center gap-4">
          {/* Preview */}
          <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
            <img
              src={currentImage}
              alt="Preloader"
              className="w-full h-full object-contain p-1"
              onError={e => { e.target.style.display = "none"; }}
            />
          </div>

          {/* Actions */}
          <div className="flex-1 space-y-2">
            <p className="text-xs text-gray-500 truncate">{currentImage}</p>
            <button
              onClick={() => setImgOpen(true)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
            >
              Changer l'image
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-400">
          Formats supportés : SVG, PNG, JPG, GIF, WebP. Taille recommandée : 200×200 px.
        </p>
      </div>

      {/* ── Text ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Texte</h2>
          {/* Show/hide toggle */}
          <button
            onClick={() => set("showText", !settings.showText)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.showText ? "bg-purple-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                settings.showText ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <input
          type="text"
          value={settings.text}
          onChange={e => set("text", e.target.value)}
          disabled={!settings.showText}
          placeholder="Chargement…"
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400
                     disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        />
        <p className="text-xs text-gray-400">
          Laissez vide ou désactivez pour masquer le texte.
        </p>
      </div>

      {/* ── Animation ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Animation</h2>
        <div className="grid grid-cols-2 gap-3">
          {ANIMATIONS.map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => set("animation", value)}
              className={`flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all ${
                settings.animation === value
                  ? "border-purple-500 bg-purple-50"
                  : "border-gray-100 bg-gray-50 hover:border-gray-200"
              }`}
            >
              <span className={`text-sm font-semibold ${settings.animation === value ? "text-purple-700" : "text-gray-700"}`}>
                {label}
              </span>
              <span className="text-xs text-gray-400 mt-0.5">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Duration ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Durée minimum</h2>
          <span className="text-sm font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-lg">
            {(settings.minDuration / 1000).toFixed(1)}s
          </span>
        </div>
        <input
          type="range"
          min={500}
          max={5000}
          step={100}
          value={settings.minDuration}
          onChange={e => set("minDuration", Number(e.target.value))}
          className="w-full accent-purple-600"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>0.5s</span>
          <span>5s</span>
        </div>
        <p className="text-xs text-gray-400">
          Durée minimale d'affichage du preloader, même si la page charge plus vite.
        </p>
      </div>

      {/* ── Live preview ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Aperçu</h2>
        <div className="relative h-48 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 flex flex-col items-center justify-center">
          <div className="absolute inset-0 bg-white/95" />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(167,139,250,0.18) 0%, transparent 100%)",
            }}
          />
          <div className={`relative z-10 w-16 h-16 ${
            settings.animation === "bounce" ? "animate-bounce" :
            settings.animation === "pulse"  ? "animate-pulse"  : ""
          }`}>
            <img
              src={currentImage}
              alt="Preview"
              className="w-full h-full object-contain"
              onError={e => { e.target.style.display = "none"; }}
            />
          </div>
          {settings.showText && settings.text && (
            <p className="relative z-10 mt-3 text-xs font-medium text-gray-500 tracking-wide">
              {settings.text}
            </p>
          )}
          <div className="relative z-10 flex gap-1.5 mt-3">
            {[0, 1, 2].map(i => (
              <span key={i} className="pl-dot block w-2 h-2 rounded-full bg-purple-400"
                style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-xl font-semibold text-sm text-white
                   bg-gradient-to-r from-purple-600 to-indigo-600
                   hover:from-purple-700 hover:to-indigo-700
                   disabled:opacity-60 disabled:cursor-not-allowed
                   active:scale-[0.99] transition-all shadow-sm flex items-center justify-center gap-2"
      >
        {saving ? (
          <>
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Sauvegarde…
          </>
        ) : "Sauvegarder les modifications"}
      </button>

      {/* Image selector modal */}
      <ImageSelector
        isOpen={imgOpen}
        onClose={() => setImgOpen(false)}
        selectType="single"
        onSelectImages={(url) => {
          set("images", [url]);
          setImgOpen(false);
        }}
      />
    </div>
  );
}
