"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Star, BadgeCheck, Play, Pause, ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import formatDate from "@/utils/formatDate";
import { useLanguage } from "@/context/LanguageContext";
import { useSetting } from "@/context/SettingsContext";
import { fetchCached } from "@/lib/dataCache";

// ── VoicePlayerMini ───────────────────────────────────────────────────────────

function VoicePlayerMini({ src }) {
  const audioRef = useRef(null);
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current,  setCurrent]  = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else         { audioRef.current.play();  setPlaying(true);  }
  };
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1.5 max-w-[160px]">
      <button type="button" onClick={toggle}
        className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white flex-shrink-0">
        {playing ? <Pause size={10} /> : <Play size={10} />}
      </button>
      <div className="flex-1 h-1 bg-gray-300 rounded-full cursor-pointer"
        onClick={(e) => {
          if (!audioRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
        }}>
        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${progress}%` }} />
      </div>
      <span className="text-xs text-gray-400 font-mono flex-shrink-0">{fmt(playing ? current : duration)}</span>
      <audio ref={audioRef} src={src}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onTimeUpdate={() => {
          if (!audioRef.current) return;
          setCurrent(audioRef.current.currentTime);
          setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100 || 0);
        }}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrent(0); }}
      />
    </div>
  );
}

// ── ImageViewer ───────────────────────────────────────────────────────────────

function ImageViewer({ images, startIndex = 0, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const touchStartX   = useRef(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handler = (e) => {
      if (e.key === "Escape")     onClose();
      if (e.key === "ArrowLeft")  setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx((i) => Math.min(images.length - 1, i + 1));
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handler);
    };
  }, [onClose, images.length]);

  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const next = () => setIdx((i) => Math.min(images.length - 1, i + 1));
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd   = (e) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 50) { diff < 0 ? next() : prev(); }
    touchStartX.current = null;
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/92"
      onClick={onClose} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      style={{ animation: "hfFadeIn 0.15s ease" }}>
      <button onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors">
        <X size={20} />
      </button>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-white text-sm bg-black/50 px-3 py-1 rounded-full select-none">
        {idx + 1} / {images.length}
      </div>
      <img src={images[idx]} alt="" loading="lazy" draggable={false}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl select-none"
        style={{ animation: "hfScaleIn 0.2s ease" }} />
      {idx > 0 && (
        <button onClick={(e) => { e.stopPropagation(); prev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors">
          <ChevronLeft size={22} />
        </button>
      )}
      {idx < images.length - 1 && (
        <button onClick={(e) => { e.stopPropagation(); next(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors">
          <ChevronRight size={22} />
        </button>
      )}
      {images.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, i) => (
            <button key={i} onClick={(e) => { e.stopPropagation(); setIdx(i); }}
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? "bg-white w-4" : "bg-white/40"}`} />
          ))}
        </div>
      )}
      <style>{`
        @keyframes hfFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes hfScaleIn { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
      `}</style>
    </div>
  );
}

// ── MiniCard ──────────────────────────────────────────────────────────────────

function MiniCard({ item }) {
  const { t } = useLanguage();
  const [viewerIdx, setViewerIdx] = useState(null);
  const images  = Array.isArray(item.images) ? item.images : [];
  const SHOW    = 2;
  const overflow = images.length - SHOW;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-2.5 h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            {(item.authorName || "?")[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-gray-900 truncate">{item.authorName || t("feedback_anonymous")}</span>
              {item.isVerified && <BadgeCheck size={13} className="text-blue-500 flex-shrink-0" />}
            </div>
            {item.productName && <p className="text-xs text-gray-400 truncate">{item.productName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {[1,2,3,4,5].map((s) => (
            <Star key={s} size={11} className={item.rating >= s ? "text-yellow-400 fill-yellow-400" : "text-gray-200"} />
          ))}
        </div>
      </div>

      {/* Comment */}
      {item.textContent && (
        <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">{item.textContent}</p>
      )}

      {/* Voice */}
      {item.voiceUrl && <VoicePlayerMini src={item.voiceUrl} />}

      {/* Images — [img1] [img2] [+N] */}
      {images.length > 0 && (
        <>
          <div className="flex gap-1.5">
            {images.slice(0, SHOW).map((img, i) => (
              <button key={i} type="button" onClick={() => setViewerIdx(i)}
                className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-gray-100 hover:opacity-90 hover:scale-105 transition-transform active:scale-95 focus:outline-none">
                <img src={img} alt="" loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
            {overflow > 0 && (
              <button type="button" onClick={() => setViewerIdx(SHOW)}
                className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-gray-100 relative focus:outline-none">
                <img src={images[SHOW]} alt="" loading="lazy" className="w-full h-full object-cover opacity-40" />
                <span className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs font-bold">+{overflow}</span>
              </button>
            )}
          </div>
          {viewerIdx !== null && (
            <ImageViewer images={images} startIndex={viewerIdx} onClose={() => setViewerIdx(null)} />
          )}
        </>
      )}

      <p className="text-xs text-gray-400 mt-auto">{formatDate(item.createdAt)}</p>
    </div>
  );
}

// ── Slider layout ─────────────────────────────────────────────────────────────

function SliderLayout({ items }) {
  const trackRef = useRef(null);
  const scroll = (dir) => {
    if (!trackRef.current) return;
    trackRef.current.scrollBy({ left: dir * 310, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <button onClick={() => scroll(-1)}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-8 h-8 bg-white border border-gray-200 rounded-full shadow flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors">
        <ChevronLeft size={16} />
      </button>
      <div ref={trackRef} className="flex gap-4 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory"
        style={{ scrollbarWidth: "none" }}>
        {items.map((item) => (
          <div key={item._id || item.id} className="flex-shrink-0 w-72 snap-start">
            <MiniCard item={item} />
          </div>
        ))}
      </div>
      <button onClick={() => scroll(1)}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-8 h-8 bg-white border border-gray-200 rounded-full shadow flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ── HomeFeedbackSection ───────────────────────────────────────────────────────
// slot: "afterHero" | "afterProducts" | "bottom"

export default function HomeFeedbackSection({ slot = "bottom", forceShow = false }) {
  const { t } = useLanguage();
  const { data: fbRaw, loaded: fbLoaded } = useSetting("feedback-settings");
  const settings = fbLoaded ? (fbRaw && !fbRaw.error ? fbRaw : {}) : null;
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!settings) return; // wait for context to load
    const show = forceShow || (settings.showFeedbackSlider ?? settings.showOnHomepage ?? false);
    if (!show) { setReady(true); return; }

    const max = settings.maxFeedbackItems || settings.maxItems || 6;
    // PERF: fetchCached dedups the request — RatingBadge and HomeFeedbackSection
    // now share a single /api/feedback round-trip instead of doubling the payload.
    fetchCached("/api/feedback")
      .then((fData) => {
        const list = Array.isArray(fData) ? fData : [];
        setItems(list.slice(0, max));
      })
      .catch(() => {})
      .finally(() => setReady(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbLoaded]);

  if (!ready || !settings) return null;

  // Resolve settings with backward-compat fallbacks
  const show     = forceShow || (settings.showFeedbackSlider ?? settings.showOnHomepage ?? false);
  const position = settings.feedbackSliderPosition || settings.position || "bottom";
  const layout   = settings.feedbackSliderType    || settings.layout    || "grid";

  if (!show || (!forceShow && position !== slot) || items.length === 0) return null;

  const avgRating = items.length > 0
    ? (items.reduce((a, b) => a + (b.rating || 0), 0) / items.length).toFixed(1)
    : null;

  return (
    <section className="py-10 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t("feedback_home_title")}</h2>
            {avgRating && (
              <div className="flex items-center gap-1.5 mt-1">
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map((s) => (
                    <Star key={s} size={13}
                      className={parseFloat(avgRating) >= s ? "text-yellow-400 fill-yellow-400" : "text-gray-200"} />
                  ))}
                </div>
                <span className="text-sm font-semibold text-gray-700">{avgRating}</span>
                <span className="text-xs text-gray-400">({t("feedback_count").replace("{count}", items.length)})</span>
              </div>
            )}
          </div>
          <Link href="/feedback"
            className="text-sm text-blue-600 font-medium hover:text-blue-800 transition-colors">
            {t("feedback_home_view_all")}
          </Link>
        </div>

        {/* Layout */}
        {layout === "slider" ? (
          <SliderLayout items={items} />
        ) : layout === "stacked" ? (
          <div className="flex flex-col gap-4 max-w-2xl mx-auto">
            {items.map((item) => <MiniCard key={item._id || item.id} item={item} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => <MiniCard key={item._id || item.id} item={item} />)}
          </div>
        )}
      </div>
    </section>
  );
}
