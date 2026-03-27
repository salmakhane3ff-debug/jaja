"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";

// ── Shoppable Reels — Alya-Skin-style horizontal strip ────────────────────
// Strip: horizontal scroll of portrait cards, muted auto-play on hover
// Click → fullscreen modal: full video + product card + up/down nav + mute
// Auto-advances to next reel when the video ends
// ─────────────────────────────────────────────────────────────────────────

export default function ShoppableReels({ title = "In Action" }) {
  const [reels, setReels]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [open, setOpen]         = useState(false);   // modal open
  const [current, setCurrent]   = useState(0);       // index in modal

  useEffect(() => {
    fetch("/api/data?collection=shoppable-reels", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d))
          setReels(d.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openModal = (idx) => { setCurrent(idx); setOpen(true); };
  const closeModal = () => setOpen(false);

  const goNext = useCallback(() => {
    setCurrent(c => (c + 1) % reels.length);
  }, [reels.length]);

  const goPrev = useCallback(() => {
    setCurrent(c => (c - 1 + reels.length) % reels.length);
  }, [reels.length]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") closeModal(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Prevent body scroll when modal open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (loading || reels.length === 0) return null;

  return (
    <section className="w-full py-6">
      {/* Section title — pink/red bold like reference */}
      <div className="max-w-7xl mx-auto px-4 mb-3">
        <h2 className="text-2xl md:text-3xl font-extrabold text-center text-gray-900">
          {title}
        </h2>
      </div>

      {/* 2-up grid slider — edge to edge, no scale effect */}
      <div className="w-full overflow-hidden">
        <Swiper
          modules={[Navigation]}
          slidesPerView={1.85}
          spaceBetween={4}
          centeredSlides={false}
          rewind={true}
          onSlideChange={(swiper) => setCurrent(swiper.realIndex)}
          className="shoppable-strip"
          breakpoints={{
            640:  { slidesPerView: 3.1, spaceBetween: 6 },
            1024: { slidesPerView: 4.1, spaceBetween: 8 },
          }}
        >
          {reels.map((reel, idx) => (
            <SwiperSlide key={reel._id || idx}>
              <StripCard reel={reel} onClick={() => openModal(idx)} />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {/* Fullscreen modal — rendered in <body> via portal to escape parent transforms */}
      {open && typeof document !== "undefined" && createPortal(
        <ReelModal
          reels={reels}
          current={current}
          onClose={closeModal}
          onNext={goNext}
          onPrev={goPrev}
          onEnded={goNext}
        />,
        document.body
      )}

      <style jsx global>{`
        .shoppable-strip { overflow: visible; }
        .shoppable-strip .swiper-wrapper { align-items: stretch; }
      `}</style>
    </section>
  );
}

// ── Strip card (thumbnail) ────────────────────────────────────────────────

function StripCard({ reel, onClick }) {
  const videoRef = useRef(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (hovered) {
      vid.currentTime = 0;
      vid.play().catch(() => {});
    } else {
      vid.pause();
      vid.currentTime = 0;
    }
  }, [hovered]);

  return (
    <div
      className="relative cursor-pointer rounded-2xl overflow-hidden w-full select-none"
      style={{ aspectRatio: "9/16" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <video
        ref={videoRef}
        src={reel.videoUrl}
        className="absolute inset-0 w-full h-full object-cover"
        muted playsInline preload="metadata"
      />

      {/* Gradient + play icon */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
      {!hovered && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-900 ml-0.5">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Full-screen modal ─────────────────────────────────────────────────────

function ReelModal({ reels, current, onClose, onNext, onPrev, onEnded }) {
  const reel    = reels[current];
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);

  // Play / reset when current changes
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = 0;
    vid.muted = muted;
    vid.play().catch(() => {});
  }, [current]);

  // Sync mute state
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const handleEnded = () => {
    onEnded?.();
  };

  const product = reel?.product;

  return (
    <>
      {/* Backdrop — full screen flex container that centers the card */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0, left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 9999,
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
      {/* Modal card */}
      <div
        className="relative flex flex-col"
        style={{
          width: "min(400px, 96vw)",
          height: "min(710px, 96vh)",
          borderRadius: 20,
          overflow: "hidden",
          background: "#000",
          flexShrink: 0,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Video */}
        <video
          ref={videoRef}
          src={reel.videoUrl}
          className="absolute inset-0 w-full h-full object-cover"
          muted={muted}
          playsInline
          autoPlay
          onEnded={handleEnded}
        />

        {/* Dark overlay at bottom for product card */}
        <div className="absolute bottom-0 left-0 right-0 h-[140px] bg-gradient-to-t from-black/80 to-transparent" />

        {/* ── Close (×) top-left ── */}
        <button
          onClick={onClose}
          className="absolute top-3 left-3 z-20 w-8 h-8 flex items-center justify-center rounded-full"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
            <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.9a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"/>
          </svg>
        </button>

        {/* ── Counter top-right ── */}
        <div className="absolute top-3 right-3 z-20 px-2.5 py-1 rounded-full text-white text-xs font-medium"
          style={{ background: "rgba(0,0,0,0.5)" }}>
          {current + 1} / {reels.length}
        </div>

        {/* ── Up / Down nav (right side center) ── */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
          <button onClick={onPrev}
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
              <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
            </svg>
          </button>
          <button onClick={onNext}
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
              <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
            </svg>
          </button>
        </div>

        {/* ── Mute toggle (bottom-right above product) ── */}
        <button onClick={() => setMuted(m => !m)}
          className="absolute bottom-[148px] right-3 z-20 w-8 h-8 flex items-center justify-center rounded-full"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
          {muted ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
              <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0017.73 18L19 19.27 20.27 18 5.27 3 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          )}
        </button>

        {/* ── Product card (bottom) ── */}
        {product && (
          <div className="absolute bottom-0 left-0 right-0 z-20 px-3 pb-4">
            <a
              href={`/products/${product.id}`}
              className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 shadow-lg active:scale-98 transition-transform"
            >
              {product.image && (
                <img src={product.image} alt={product.title}
                  className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{product.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{product.price} DH</p>
              </div>
              <span className="flex-shrink-0 bg-gray-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                Shop
              </span>
            </a>
          </div>
        )}
      </div>
      </div>
    </>
  );
}
