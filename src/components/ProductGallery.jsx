"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Play, Volume2, VolumeX, X, ZoomIn } from "lucide-react";
import { useUIControl } from "@/hooks/useUIControl";
import { thumbUrl } from "@/lib/thumbnailUrl";

// ── Media type detector ───────────────────────────────────────────────────────
function getMediaType(src) {
  if (!src) return "image";
  const raw = typeof src === "string" ? src : src?.url || src?.src || "";
  const url = raw.toLowerCase().split("?")[0];

  // Data URLs
  if (raw.startsWith("data:video/"))  return "video";
  if (raw.startsWith("data:image/gif")) return "gif";

  // Extension-based
  if (url.endsWith(".gif"))                        return "gif";
  if (/\.(mp4|webm|ogg|mov|m4v|avi|mkv)$/.test(url)) return "video";

  // Embedded platforms
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("vimeo.com"))                               return "vimeo";

  // Cloud storage video path hints (Cloudinary, Uploadcare, S3 with /video/)
  if (url.includes("/video/upload/") || url.includes("/videos/")) return "video";

  return "image";
}

function getSrc(item) {
  return typeof item === "string" ? item : item?.url || item?.src || "";
}

function getYouTubeId(url) {
  const m =
    url.match(/youtube\.com\/watch\?v=([^&]+)/) ||
    url.match(/youtu\.be\/([^?]+)/) ||
    url.match(/youtube\.com\/embed\/([^?]+)/);
  return m ? m[1] : null;
}

function getVimeoId(url) {
  const m = url.match(/vimeo\.com\/(\d+)/);
  return m ? m[1] : null;
}

// ── Protected video element ───────────────────────────────────────────────────
function ProtectedVideo({ url, autoPlay, controls, className, style }) {
  const ref = useRef(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (!ref.current) return;
    if (autoPlay) ref.current.play().catch(() => {});
    else { ref.current.pause(); ref.current.currentTime = 0; }
  }, [autoPlay]);

  return (
    <div className={`relative group ${className ?? ""}`} style={style}
      onContextMenu={(e) => e.preventDefault()}>
      <video
        ref={ref}
        src={url}
        muted={muted}
        loop
        playsInline
        disablePictureInPicture
        controlsList="nodownload nofullscreen"
        controls={controls}
        className="w-full h-full"
        style={{ objectFit: "contain", background: "#111" }}
      />
      {/* Custom mute toggle replaces native controls partially */}
      <button
        onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
        className="absolute bottom-3 right-3 w-8 h-8 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100 z-10"
      >
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
    </div>
  );
}

// ── Media item renderer ───────────────────────────────────────────────────────
function MediaItem({ src, title, className = "", style, autoPlay = false, controls = true, onImageClick }) {
  const type = getMediaType(src);
  const url  = getSrc(src);

  if (type === "video") {
    return (
      <ProtectedVideo url={url} autoPlay={autoPlay} controls={controls}
        className={className} style={style} />
    );
  }

  if (type === "youtube") {
    const vid = getYouTubeId(url);
    return (
      <div className={`relative ${className}`} style={style}
        onContextMenu={(e) => e.preventDefault()}>
        <iframe
          src={`https://www.youtube.com/embed/${vid}?autoplay=${autoPlay ? 1 : 0}&mute=1&loop=1&rel=0&modestbranding=1&playlist=${vid}`}
          className="w-full h-full rounded-xl bg-gray-900"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ border: "none" }}
        />
      </div>
    );
  }

  if (type === "vimeo") {
    const vid = getVimeoId(url);
    return (
      <div className={`relative ${className}`} style={style}
        onContextMenu={(e) => e.preventDefault()}>
        <iframe
          src={`https://player.vimeo.com/video/${vid}?autoplay=${autoPlay ? 1 : 0}&muted=1&loop=1&byline=0&portrait=0&title=0`}
          className="w-full h-full rounded-xl bg-gray-900"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          style={{ border: "none" }}
        />
      </div>
    );
  }

  // image or gif — object-contain so nothing is cropped
  return (
    <div
      className={`relative flex items-center justify-center w-full h-full ${className}`}
      style={style}
      onClick={onImageClick}
    >
      <img
        src={url}
        alt={title}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        className="max-w-full max-h-full object-contain select-none"
        style={{ display: "block" }}
      />
      {onImageClick && (
        <div className="absolute inset-0 flex items-end justify-end p-2 pointer-events-none">
          <span className="w-7 h-7 bg-black/40 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
            <ZoomIn size={14} />
          </span>
        </div>
      )}
    </div>
  );
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────
function Thumb({ src, title, active, onClick, index }) {
  const type = getMediaType(src);
  const url  = getSrc(src);

  return (
    <button
      onClick={onClick}
      className={`relative w-20 h-20 flex-shrink-0 rounded-lg border-2 overflow-hidden transition-all bg-gray-100 hover:border-gray-400
        ${active ? "border-gray-900 ring-2 ring-gray-900/20" : "border-gray-200"}`}
    >
      {type === "video" ? (
        <>
          <video src={url} className="w-full h-full object-cover" muted playsInline preload="metadata"
            onContextMenu={(e) => e.preventDefault()} />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <div className="w-6 h-6 bg-white/90 rounded-full flex items-center justify-center">
              <Play size={10} className="text-gray-900 ml-0.5" />
            </div>
          </div>
          <span className="absolute bottom-1 left-1 text-[8px] font-bold bg-black/60 text-white px-1 rounded">MP4</span>
        </>
      ) : type === "youtube" ? (
        <>
          <img src={`https://img.youtube.com/vi/${getYouTubeId(url)}/mqdefault.jpg`}
            alt="YouTube" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center">
              <Play size={10} className="text-white ml-0.5" />
            </div>
          </div>
        </>
      ) : type === "vimeo" ? (
        <>
          <div className="w-full h-full bg-blue-900 flex items-center justify-center">
            <Play size={16} className="text-white" />
          </div>
          <span className="absolute bottom-1 left-1 text-[8px] font-bold bg-black/60 text-white px-1 rounded">Vimeo</span>
        </>
      ) : type === "gif" ? (
        <>
          <img src={url} alt={title} className="w-full h-full object-contain bg-white" />
          <span className="absolute bottom-1 left-1 text-[8px] font-bold bg-black/60 text-white px-1 rounded">GIF</span>
        </>
      ) : (
        <img src={thumbUrl(url, 'sm') || url} alt={`${title} ${index + 1}`} className="w-full h-full object-contain bg-white" loading="lazy" />
      )}
    </button>
  );
}

// ── Zoom Modal ────────────────────────────────────────────────────────────────
function ZoomModal({ images, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const touchStartX  = useRef(null);

  const go = useCallback((dir) => {
    setIdx((prev) => Math.max(0, Math.min(images.length - 1, prev + dir)));
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape")      onClose();
      if (e.key === "ArrowLeft")   go(-1);
      if (e.key === "ArrowRight")  go(1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [go, onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd   = (e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) go(diff > 0 ? 1 : -1);
    touchStartX.current = null;
  };

  const url  = getSrc(images[idx]);
  const type = getMediaType(images[idx]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/95 flex flex-col"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="text-white/60 text-sm">
          {idx + 1} / {images.length}
        </span>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Main image — full remaining height, arrows float over */}
      <div className="flex-1 flex items-center justify-center min-h-0 relative px-2 py-2" onClick={(e) => e.stopPropagation()}>
        {/* Prev arrow */}
        <button
          onClick={() => go(-1)}
          disabled={idx === 0}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 backdrop-blur-sm flex items-center justify-center text-white transition-colors disabled:opacity-20 z-10 shadow-lg"
        >
          <ChevronLeft size={24} />
        </button>

        <div className="flex items-center justify-center" onContextMenu={(e) => e.preventDefault()}>
          {(type === "image" || type === "gif") ? (
            <img
              src={url}
              alt="zoom"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              className="object-contain select-none rounded-lg"
              style={{ maxWidth: "90vw", maxHeight: "80vh", width: "auto", height: "auto" }}
            />
          ) : (
            <div style={{ width: "90vw", maxHeight: "80vh" }} className="flex items-center justify-center">
              <MediaItem src={images[idx]} title="" autoPlay className="w-full h-full" />
            </div>
          )}
        </div>

        {/* Next arrow */}
        <button
          onClick={() => go(1)}
          disabled={idx === images.length - 1}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 backdrop-blur-sm flex items-center justify-center text-white transition-colors disabled:opacity-20 z-10 shadow-lg"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Dot strip */}
      {images.length > 1 && (
        <div className="flex justify-center gap-2 py-4 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {images.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className={`rounded-full transition-all ${i === idx ? "w-6 h-2 bg-white" : "w-2 h-2 bg-white/30 hover:bg-white/60"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Gallery ──────────────────────────────────────────────────────────────
export default function ProductGallery({ images = [], title = "" }) {
  const ui           = useUIControl();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoomIndex,    setZoomIndex]    = useState(null); // null = closed
  const scrollRef    = useRef(null);
  const slideRefs    = useRef([]);

  const enableZoom  = ui.enableImageZoom  !== false;
  const enableVideo = ui.enableVideo      !== false;

  // Filter out videos if admin disabled them
  const media = enableVideo
    ? images
    : images.filter((item) => {
        const t = getMediaType(item);
        return t !== "video" && t !== "youtube" && t !== "vimeo";
      });

  useEffect(() => { setCurrentIndex(0); }, [images]);

  const goTo = useCallback((index) => {
    const clamped = Math.max(0, Math.min(index, media.length - 1));
    setCurrentIndex(clamped);
    // Use scrollIntoView on the specific slide — works correctly in all RTL/LTR browsers
    const slide = slideRefs.current[clamped];
    if (slide) {
      slide.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    }
  }, [media.length]);

  const handleMobileScroll = useCallback(() => {
    if (!scrollRef.current || scrollRef.current.clientWidth === 0) return;
    // Math.abs handles both LTR (positive) and RTL Firefox (negative) scrollLeft
    const idx = Math.round(Math.abs(scrollRef.current.scrollLeft) / scrollRef.current.clientWidth);
    if (idx !== currentIndex && idx >= 0 && idx < media.length) {
      setCurrentIndex(idx);
    }
  }, [currentIndex, media.length]);

  const openZoom = useCallback((index) => {
    if (!enableZoom) return;
    const type = getMediaType(media[index]);
    if (type === "image" || type === "gif") setZoomIndex(index);
  }, [enableZoom, media]);

  if (!media || media.length === 0) {
    return (
      <div className="bg-gray-100 rounded-xl flex items-center justify-center" style={{ aspectRatio: "1/1" }}>
        <span className="text-gray-400">No media available</span>
      </div>
    );
  }

  const selected = media[currentIndex];
  const hasPrev  = currentIndex > 0;
  const hasNext  = currentIndex < media.length - 1;

  // Container style: square aspect ratio, no overflow
  const containerCls = "w-full overflow-hidden rounded-xl bg-white flex items-center justify-center";
  const containerStyle = { aspectRatio: "1 / 1" };

  return (
    <>
      <div className="flex flex-col gap-4 w-full overflow-hidden">

        {/* ── Mobile: Horizontal snap scroll ── */}
        <div className="block md:hidden relative">
          <div
            ref={scrollRef}
            onScroll={handleMobileScroll}
            className="flex overflow-x-auto snap-x snap-mandatory"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
          >
            {media.map((item, i) => {
              const type = getMediaType(item);
              const isImg = type === "image" || type === "gif";
              return (
                <div key={i} ref={(el) => { slideRefs.current[i] = el; }} className="w-full flex-shrink-0 snap-center relative">
                  {/* No onClick on container — zoom only via dedicated button */}
                  <div className={containerCls} style={containerStyle}>
                    {type === "video" ? (
                      <ProtectedVideo url={getSrc(item)} autoPlay={i === currentIndex} controls
                        className="w-full h-full" />
                    ) : type === "youtube" || type === "vimeo" ? (
                      <MediaItem src={item} title={title} autoPlay={i === currentIndex}
                        className="w-full h-full" />
                    ) : (
                      <img
                        src={thumbUrl(getSrc(item), 'lg') || getSrc(item)}
                        alt={`${title} ${i + 1}`}
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                        className="max-w-full max-h-full object-contain select-none"
                        loading={i === 0 ? "eager" : "lazy"}
                      />
                    )}
                  </div>
                  {/* Zoom button — outside overflow-hidden container so it's never clipped */}
                  {enableZoom && isImg && i === currentIndex && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openZoom(i); }}
                      className="absolute top-3 right-3 w-9 h-9 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center text-white shadow-md transition-all z-20"
                      aria-label="Zoom image"
                    >
                      <ZoomIn size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Arrows */}
          {media.length > 1 && (
            <>
              <button onClick={() => goTo(currentIndex - 1)} disabled={!hasPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md hover:bg-white transition-all disabled:opacity-30 z-10">
                <ChevronLeft className="w-4 h-4 text-gray-700" />
              </button>
              <button onClick={() => goTo(currentIndex + 1)} disabled={!hasNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md hover:bg-white transition-all disabled:opacity-30 z-10">
                <ChevronRight className="w-4 h-4 text-gray-700" />
              </button>
            </>
          )}

          {/* Type badge */}
          {(() => {
            const type = getMediaType(selected);
            if (type === "gif")     return <span className="absolute top-3 left-3 text-[10px] font-bold bg-black/60 text-white px-2 py-0.5 rounded-full z-10">GIF</span>;
            if (type === "video")   return <span className="absolute top-3 left-3 text-[10px] font-bold bg-black/60 text-white px-2 py-0.5 rounded-full flex items-center gap-1 z-10"><Play size={8} />VIDEO</span>;
            if (type === "youtube") return <span className="absolute top-3 left-3 text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1 z-10"><Play size={8} />YOUTUBE</span>;
            return null;
          })()}


          {/* Dots */}
          {media.length > 1 && (
            <div className="flex justify-center gap-1.5 mt-3">
              {media.map((item, i) => {
                const type = getMediaType(item);
                return (
                  <button key={i} onClick={() => goTo(i)}
                    className={`transition-all rounded-full ${
                      i === currentIndex
                        ? "w-5 h-2 bg-gray-900"
                        : type === "video" || type === "youtube" || type === "vimeo"
                          ? "w-2 h-2 bg-blue-400"
                          : type === "gif"
                            ? "w-2 h-2 bg-green-400"
                            : "w-2 h-2 bg-gray-300"
                    }`}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* ── Desktop: Main + Thumbnails ── */}
        <div className="hidden md:flex md:flex-row gap-3 w-full">

          {/* Thumbnails column */}
          {media.length > 1 && (
            <div className="flex flex-col gap-2 overflow-y-auto pr-0.5" style={{ maxHeight: 480, scrollbarWidth: "thin" }}>
              {media.map((item, i) => (
                <Thumb key={i} src={item} title={title} index={i}
                  active={i === currentIndex} onClick={() => goTo(i)} />
              ))}
            </div>
          )}

          {/* Main display */}
          <div className="relative flex-1">
            {/* 1:1 aspect container — no click, zoom only via icon button */}
            <div
              className={containerCls}
              style={containerStyle}
            >
              <MediaItem
                src={(() => {
                  const type = getMediaType(selected);
                  if (type !== "image") return selected; // video/gif/youtube/vimeo unchanged
                  const raw = getSrc(selected);
                  return thumbUrl(raw, 'lg') || raw;
                })()}
                title={title}
                autoPlay={true}
                className="w-full h-full"
                controls
              />
            </div>

            {/* Zoom icon — outside overflow-hidden so it's never clipped */}
            {enableZoom && (() => {
              const t = getMediaType(selected);
              if (t === "image" || t === "gif") {
                return (
                  <button
                    onClick={(e) => { e.stopPropagation(); openZoom(currentIndex); }}
                    className="absolute top-3 right-3 w-10 h-10 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center text-white shadow-md transition-all z-20 cursor-zoom-in"
                    aria-label="Zoom image"
                  >
                    <ZoomIn size={17} />
                  </button>
                );
              }
              return null;
            })()}

            {/* Arrows */}
            {media.length > 1 && (
              <>
                <button onClick={(e) => { e.stopPropagation(); goTo(currentIndex - 1); }} disabled={!hasPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md hover:bg-white transition-all disabled:opacity-20 z-10">
                  <ChevronLeft className="w-5 h-5 text-gray-700" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); goTo(currentIndex + 1); }} disabled={!hasNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md hover:bg-white transition-all disabled:opacity-20 z-10">
                  <ChevronRight className="w-5 h-5 text-gray-700" />
                </button>
              </>
            )}

            {/* Type badge */}
            {(() => {
              const type = getMediaType(selected);
              if (type === "gif")     return <span className="absolute top-3 left-3 text-[10px] font-bold bg-black/60 text-white px-2 py-1 rounded-full z-10">GIF</span>;
              if (type === "video")   return <span className="absolute top-3 left-3 text-[10px] font-bold bg-black/60 text-white px-2 py-1 rounded-full flex items-center gap-1 z-10"><Play size={9} />VIDEO</span>;
              if (type === "youtube") return <span className="absolute top-3 left-3 text-[10px] font-bold bg-red-600 text-white px-2 py-1 rounded-full flex items-center gap-1 z-10"><Play size={9} />YOUTUBE</span>;
              if (type === "vimeo")   return <span className="absolute top-3 left-3 text-[10px] font-bold bg-blue-600 text-white px-2 py-1 rounded-full flex items-center gap-1 z-10"><Play size={9} />VIMEO</span>;
              return null;
            })()}

            {/* Index counter */}
            {media.length > 1 && (
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold bg-black/50 text-white px-2 py-1 rounded-full z-10 pointer-events-none">
                {currentIndex + 1} / {media.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Zoom Modal */}
      {zoomIndex !== null && (
        <ZoomModal
          images={media}
          startIndex={zoomIndex}
          onClose={() => setZoomIndex(null)}
        />
      )}
    </>
  );
}
