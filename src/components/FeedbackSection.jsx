"use client";

import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  Star, BadgeCheck, Play, Pause, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, MessageSquare, X, PenLine, CheckCircle2,
} from "lucide-react";
import { Spinner } from "@heroui/react";
import formatDate from "@/utils/formatDate";
import FeedbackForm from "@/components/FeedbackForm";
import { useLanguage } from "@/context/LanguageContext";

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
    <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1.5 max-w-[180px]">
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
      <span className="text-xs text-gray-400 font-mono flex-shrink-0">
        {fmt(playing ? current : duration)}
      </span>
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

// ── StarDisplay ───────────────────────────────────────────────────────────────

function StarDisplay({ value }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} size={13}
          className={value >= s ? "text-yellow-400 fill-yellow-400" : "text-gray-200"} />
      ))}
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name }) {
  const colors = [
    "from-blue-400 to-blue-600", "from-purple-400 to-purple-600",
    "from-green-400 to-green-600", "from-orange-400 to-orange-600",
    "from-pink-400 to-pink-600",  "from-teal-400 to-teal-600",
  ];
  const idx     = (name?.charCodeAt(0) || 0) % colors.length;
  const initial = (name || "?")[0].toUpperCase();
  return (
    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${colors[idx]} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
      {initial}
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
      if (e.key === "Escape")      onClose();
      if (e.key === "ArrowLeft")   setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight")  setIdx((i) => Math.min(images.length - 1, i + 1));
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
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/92"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{ animation: "fadeIn 0.15s ease" }}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors"
      >
        <X size={20} />
      </button>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-white text-sm font-medium bg-black/50 px-3 py-1 rounded-full select-none">
        {idx + 1} / {images.length}
      </div>
      <img
        src={images[idx]}
        alt={`image-${idx + 1}`}
        loading="lazy"
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl select-none shadow-2xl"
        style={{ animation: "scaleIn 0.2s ease" }}
      />
      {idx > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors"
        >
          <ChevronLeft size={22} />
        </button>
      )}
      {idx < images.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors"
        >
          <ChevronRight size={22} />
        </button>
      )}
      {images.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setIdx(i); }}
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? "bg-white w-4" : "bg-white/40"}`}
            />
          ))}
        </div>
      )}
      <style>{`
        @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes scaleIn { from { opacity:0; transform:scale(0.92) } to { opacity:1; transform:scale(1) } }
      `}</style>
    </div>
  );
}

// ── ImageStrip ────────────────────────────────────────────────────────────────

function ImageStrip({ images }) {
  const [viewerIdx, setViewerIdx] = useState(null);
  if (!images || images.length === 0) return null;

  const SHOW = 2;
  const overflow = images.length - SHOW;

  return (
    <>
      <div className="flex gap-1.5">
        {images.slice(0, SHOW).map((img, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setViewerIdx(i)}
            className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-100 hover:opacity-90 hover:scale-105 transition-transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <img src={img} alt="" loading="lazy" className="w-full h-full object-cover" />
          </button>
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => setViewerIdx(SHOW)}
            className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-100 bg-gray-900/80 relative hover:opacity-90 transition-opacity focus:outline-none"
          >
            <img src={images[SHOW]} alt="" loading="lazy" className="w-full h-full object-cover opacity-40" />
            <span className="absolute inset-0 flex items-center justify-center text-white text-sm font-bold">
              +{overflow}
            </span>
          </button>
        )}
      </div>
      {viewerIdx !== null && (
        <ImageViewer
          images={images}
          startIndex={viewerIdx}
          onClose={() => setViewerIdx(null)}
        />
      )}
    </>
  );
}

// ── FeedbackCard ──────────────────────────────────────────────────────────────

function FeedbackCard({ item }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const images      = Array.isArray(item.images) ? item.images : [];
  const longComment = item.textContent && item.textContent.length > 160;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar name={item.authorName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">
              {item.authorName || t("feedback_anonymous")}
            </span>
            {item.isVerified && (
              <BadgeCheck size={14} className="text-blue-500 flex-shrink-0" />
            )}
          </div>
          {item.productName && (
            <p className="text-xs text-gray-400 truncate">{item.productName}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <StarDisplay value={item.rating} />
          <span className="text-xs text-gray-400">{formatDate(item.createdAt)}</span>
        </div>
      </div>

      {/* Comment */}
      {item.textContent && (
        <div>
          <p className={`text-sm text-gray-700 leading-relaxed text-right ${!expanded && longComment ? "line-clamp-3" : ""}`} dir="rtl">
            {item.textContent}
          </p>
          {longComment && (
            <button onClick={() => setExpanded((v) => !v)}
              className="text-xs text-blue-500 hover:text-blue-700 mt-1 flex items-center gap-1">
              {expanded
                ? <><ChevronUp size={11} /> {t("feedback_show_less")}</>
                : <><ChevronDown size={11} /> {t("feedback_show_more")}</>}
            </button>
          )}
        </div>
      )}

      {/* Voice */}
      {item.voiceUrl && <VoicePlayerMini src={item.voiceUrl} />}

      {/* Images */}
      <ImageStrip images={images} />
    </div>
  );
}

// ── SuccessToast ──────────────────────────────────────────────────────────────

function SuccessToast({ visible }) {
  const { t } = useLanguage();
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-green-600 text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg transition-all duration-300 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
      <CheckCircle2 size={16} />
      {t("feedback_success_toast")}
    </div>
  );
}

// ── FeedbackModal ─────────────────────────────────────────────────────────────

function FeedbackModal({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ animation: "fadeIn2 0.18s ease" }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
        style={{ animation: "slideUp2 0.22s ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose}
          className="absolute top-3 left-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors">
          <X size={16} />
        </button>
        <div className="p-5 pt-4">{children}</div>
      </div>
      <style>{`
        @keyframes fadeIn2  { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp2 { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  );
}

// ── FeedbackSection ───────────────────────────────────────────────────────────

function FeedbackSection({
  productId = null,
  productName: productNameProp = null,
  title = null,
  maxItems = 6,
  showForm = false,
  formDisplay = "inline",
  onStatsLoaded = null,
}) {
  const { t } = useLanguage();
  const sectionRef = useRef(null);
  const [items,          setItems]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [showAll,        setShowAll]        = useState(false);
  const [formOpen,       setFormOpen]       = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  // Stable ref so onStatsLoaded doesn't cause fetchData to re-create & re-fire
  const onStatsLoadedRef = useRef(onStatsLoaded);
  useEffect(() => { onStatsLoadedRef.current = onStatsLoaded; }, [onStatsLoaded]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const url = productId ? `/api/feedback?productId=${productId}` : "/api/feedback";
      const res  = await fetch(url);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setItems(list);
      if (onStatsLoadedRef.current && list.length > 0) {
        const avg = list.reduce((a, b) => a + (b.rating || 0), 0) / list.length;
        onStatsLoadedRef.current(parseFloat(avg.toFixed(1)), list.length);
      }
    } catch { /* silently fail */ }
    finally  { setLoading(false); }
  }, [productId]); // removed onStatsLoaded from deps — using ref instead

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSuccess = useCallback(() => {
    setFormOpen(false);
    fetchData();
    setSuccessVisible(true);
    setTimeout(() => setSuccessVisible(false), 3500);
  }, [fetchData]);

  const displayed = showAll ? items : items.slice(0, maxItems);
  const avgRating = items.length > 0
    ? (items.reduce((a, b) => a + (b.rating || 0), 0) / items.length).toFixed(1)
    : null;

  const sectionTitle = title || t("feedback_section_title");

  const formNode = (
    <FeedbackForm productId={productId} productName={productNameProp} onSuccess={handleSuccess} />
  );

  return (
    <section ref={sectionRef} className="py-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <MessageSquare size={20} className="text-blue-600" aria-hidden="true" />
          <h2 className="text-xl font-bold text-gray-900">{sectionTitle}</h2>
          {items.length > 0 && (
            <span className="text-sm text-gray-400">({items.length})</span>
          )}
        </div>
        {avgRating && (
          <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-full px-3 py-1">
            <Star size={14} className="text-yellow-400 fill-yellow-400" />
            <span className="text-sm font-semibold text-yellow-700">{avgRating}</span>
          </div>
        )}
      </div>

      {/* Add review button */}
      {showForm && (
        <div className="mb-6 flex justify-center">
          <button
            onClick={() => setFormOpen((v) => !v)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-full shadow-sm transition-colors"
          >
            <PenLine size={15} aria-hidden="true" />
            {t("feedback_add_btn")}
          </button>
        </div>
      )}

      {/* Inline form */}
      {showForm && formDisplay === "inline" && (
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${formOpen ? "max-h-[1200px] opacity-100 mb-8" : "max-h-0 opacity-0"}`}>
          <div className="pt-1">{formNode}</div>
        </div>
      )}

      {/* Modal form */}
      {showForm && formDisplay === "modal" && (
        <FeedbackModal open={formOpen} onClose={() => setFormOpen(false)}>
          {formNode}
        </FeedbackModal>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner size="md" color="primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <MessageSquare size={40} className="mx-auto mb-3 opacity-20" aria-hidden="true" />
          <p className="text-sm">{t("feedback_empty_title")}</p>
          {showForm && <p className="text-xs mt-1 text-gray-400">{t("feedback_empty_sub")}</p>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {displayed.map((item) => (
              <FeedbackCard key={item._id || item.id} item={item} />
            ))}
          </div>

          {items.length > maxItems && (
            <div className="text-center mt-6">
              <button
                onClick={() => setShowAll((v) => !v)}
                className="inline-flex items-center gap-2 px-6 py-2.5 border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {showAll
                  ? <><ChevronUp size={16} /> {t("feedback_show_less")}</>
                  : <><ChevronDown size={16} /> {t("feedback_show_more_count").replace("{count}", items.length - maxItems)}</>}
              </button>
            </div>
          )}
        </>
      )}

      <SuccessToast visible={successVisible} />
    </section>
  );
}

export default memo(FeedbackSection);
