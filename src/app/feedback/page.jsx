"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Star, BadgeCheck, Play, Pause, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, PenLine, X, CheckCircle2 } from "lucide-react";
import { Spinner, Pagination } from "@heroui/react";
import formatDate from "@/utils/formatDate";
import FeedbackForm from "@/components/FeedbackForm";
import { useLanguage } from "@/context/LanguageContext";
import { fetchCached, invalidateCache } from "@/lib/dataCache";

// ── VoicePlayer ────────────────────────────────────────────────────────────────

function VoicePlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  const formatTime = (s) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-2 max-w-[200px]">
      <button
        onClick={toggle}
        className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-white flex-shrink-0"
      >
        {playing ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <div
        className="flex-1 h-1.5 bg-gray-300 rounded-full cursor-pointer relative"
        onClick={(e) => {
          if (!audioRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          audioRef.current.currentTime = ratio * duration;
        }}
      >
        <div
          className="h-full bg-blue-400 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 flex-shrink-0 font-mono">
        {formatTime(playing ? current : duration)}
      </span>
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onTimeUpdate={() => {
          if (!audioRef.current) return;
          setCurrent(audioRef.current.currentTime);
          setProgress(
            (audioRef.current.currentTime / audioRef.current.duration) * 100 || 0
          );
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setCurrent(0);
        }}
      />
    </div>
  );
}

// ── StarDisplay ───────────────────────────────────────────────────────────────

function StarDisplay({ value, className = "" }) {
  return (
    <div className={`flex gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={18}
          className={
            value >= s ? "text-yellow-400 fill-yellow-400" : "text-gray-200"
          }
        />
      ))}
    </div>
  );
}

// ── Gradient Avatar ───────────────────────────────────────────────────────────

function Avatar({ name }) {
  const colors = [
    "from-blue-400 to-blue-600",
    "from-purple-400 to-purple-600",
    "from-green-400 to-green-600",
    "from-orange-400 to-orange-600",
    "from-pink-400 to-pink-600",
    "from-teal-400 to-teal-600",
  ];
  const idx = (name?.charCodeAt(0) || 0) % colors.length;
  const initial = (name || "?")[0].toUpperCase();
  return (
    <div
      className={`w-11 h-11 rounded-full bg-gradient-to-br ${colors[idx]} flex items-center justify-center text-white font-bold text-base flex-shrink-0`}
    >
      {initial}
    </div>
  );
}

// ── Feedback Card ─────────────────────────────────────────────────────────────

// ── ImageViewer ───────────────────────────────────────────────────────────────

function ImageViewer({ images, startIndex = 0, onClose }) {
  const [idx, setIdx]  = useState(startIndex);
  const touchStartX    = useRef(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handler = (e) => {
      if (e.key === "Escape")     onClose();
      if (e.key === "ArrowLeft")  setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx((i) => Math.min(images.length - 1, i + 1));
    };
    document.addEventListener("keydown", handler);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", handler); };
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
      style={{ animation: "fbFadeIn 0.15s ease" }}>
      <button onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors">
        <X size={20} />
      </button>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-white text-sm font-medium bg-black/50 px-3 py-1 rounded-full select-none">
        {idx + 1} / {images.length}
      </div>
      <img src={images[idx]} alt="" loading="lazy" draggable={false}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl select-none"
        style={{ animation: "fbScaleIn 0.2s ease" }} />
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
        @keyframes fbFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes fbScaleIn { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FeedbackCard({ item }) {
  const [expanded,  setExpanded]  = useState(false);
  const [viewerIdx, setViewerIdx] = useState(null);
  const { t } = useLanguage();
  const images = Array.isArray(item.images) ? item.images : [];
  const longComment = item.textContent && item.textContent.length > 180;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Avatar name={item.authorName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">
              {item.authorName || t("feedback_anonymous")}
            </span>
            {item.isVerified && (
              <BadgeCheck size={15} className="text-blue-500 flex-shrink-0" />
            )}
            <StarDisplay value={item.rating} className="ms-auto" />
          </div>
          {item.productName && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {item.productName}
            </p>
          )}
        </div>
      </div>

      {/* Comment */}
      {item.textContent && (
        <div>
          <p
            className={`text-sm text-gray-700 leading-relaxed ${
              !expanded && longComment ? "line-clamp-4" : ""
            }`}
          >
            {item.textContent}
          </p>
          {longComment && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-blue-500 hover:text-blue-700 mt-1 flex items-center gap-1"
            >
              {expanded ? (
                <>
                  <ChevronUp size={12} /> {t("feedback_show_less")}
                </>
              ) : (
                <>
                  <ChevronDown size={12} /> {t("feedback_show_more")}
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Voice player */}
      {item.voiceUrl && (
        <div>
          <VoicePlayer src={item.voiceUrl} />
        </div>
      )}

      {/* Images — [img1] [img2] [+N] */}
      {images.length > 0 && (
        <>
          <div className="flex gap-1.5">
            {images.slice(0, 2).map((img, i) => (
              <button key={i} type="button" onClick={() => setViewerIdx(i)}
                className="flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-gray-100 hover:opacity-90 hover:scale-105 transition-transform active:scale-95 focus:outline-none">
                <img src={img} alt="" loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
            {images.length > 2 && (
              <button type="button" onClick={() => setViewerIdx(2)}
                className="flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-gray-100 relative focus:outline-none hover:opacity-90">
                <img src={images[2]} alt="" loading="lazy" className="w-full h-full object-cover opacity-40" />
                <span className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-sm font-bold">
                  +{images.length - 2}
                </span>
              </button>
            )}
          </div>
          {viewerIdx !== null && (
            <ImageViewer images={images} startIndex={viewerIdx} onClose={() => setViewerIdx(null)} />
          )}
        </>
      )}

      {/* Date */}
      <p className="text-xs text-gray-400">{formatDate(item.createdAt)}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

// ── Form Modal ────────────────────────────────────────────────────────────────

function FormModal({ open, onClose, onSuccess }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: "fadeIn 0.18s ease" }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
        style={{ animation: "slideUp 0.22s ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 left-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors"
        >
          <X size={16} />
        </button>
        <div className="p-5 pt-4">
          <FeedbackForm onSuccess={onSuccess} />
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  );
}

// ── Success Toast ─────────────────────────────────────────────────────────────

function SuccessToast({ visible }) {
  const { t } = useLanguage();
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-green-600 text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg transition-all duration-300 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
      <CheckCircle2 size={16} />
      {t("feedback_success_toast")}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 12;
const STAR_FILTERS = [0, 5, 4, 3, 2, 1];

export default function FeedbackPage() {
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starFilter, setStarFilter] = useState(0);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCached("/api/feedback");
      setItems(Array.isArray(data) ? data : []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFormSuccess = useCallback(() => {
    setFormOpen(false);
    invalidateCache("/api/feedback");
    fetchData();
    setSuccessVisible(true);
    setTimeout(() => setSuccessVisible(false), 3500);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [starFilter]);

  const filtered =
    starFilter === 0
      ? items
      : items.filter((i) => i.rating === starFilter);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  const avgRating =
    items.length > 0
      ? (items.reduce((a, b) => a + (b.rating || 0), 0) / items.length).toFixed(1)
      : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white py-14 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {t("feedback_page_title")}
          </h1>
          <p className="text-blue-100 text-lg mb-6">
            {t("feedback_page_subtitle")}
          </p>
          {avgRating && (
            <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur rounded-2xl px-6 py-3 mb-4">
              <span className="text-4xl font-bold">{avgRating}</span>
              <div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={20}
                      className={
                        parseFloat(avgRating) >= s
                          ? "text-yellow-300 fill-yellow-300"
                          : "text-white/30"
                      }
                    />
                  ))}
                </div>
                <p className="text-blue-100 text-sm mt-0.5">
                  {t("feedback_count").replace("{count}", items.length)}
                </p>
              </div>
            </div>
          )}

          {/* Add review button */}
          <div>
            <button
              onClick={() => setFormOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-700 font-semibold rounded-full shadow-sm hover:bg-blue-50 active:scale-95 transition-all text-sm"
            >
              <PenLine size={16} />
              {t("feedback_add_btn")}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {STAR_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStarFilter(s)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                starFilter === s
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:border-blue-300"
              }`}
            >
              {s === 0 ? (
                t("feedback_filter_all")
              ) : (
                <>
                  {s}{" "}
                  <Star
                    size={13}
                    className={
                      starFilter === s
                        ? "text-yellow-300 fill-yellow-300"
                        : "text-yellow-400 fill-yellow-400"
                    }
                  />
                </>
              )}
              <span
                className={`text-xs ${
                  starFilter === s ? "text-blue-100" : "text-gray-400"
                }`}
              >
                (
                {s === 0
                  ? items.length
                  : items.filter((i) => i.rating === s).length}
                )
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-6xl mx-auto px-4 pb-12">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="lg" color="primary" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Star size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">{t("feedback_empty_title")}</p>
            <p className="text-sm mt-1">{t("feedback_empty_sub")}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginated.map((item) => (
                <FeedbackCard key={item._id || item.id} item={item} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center mt-8">
                <Pagination
                  total={totalPages}
                  page={page}
                  onChange={setPage}
                  color="primary"
                />
              </div>
            )}
          </>
        )}
      </div>

      <FormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={handleFormSuccess}
      />
      <SuccessToast visible={successVisible} />
    </div>
  );
}
