"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Autoplay } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";

const getYoutubeId = (url = "") => {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/shorts/")[1];
    if (u.searchParams.has("v")) return u.searchParams.get("v");
    if (u.pathname.startsWith("/embed/")) return u.pathname.split("/embed/")[1];
    return null;
  } catch {
    return null;
  }
};

const isLocalVideo = (url = "") => url.startsWith("/uploads/") || url.startsWith("/videos/");

function Stars({ count = 5 }) {
  const n = Math.min(5, Math.max(1, Number(count) || 5));
  return (
    <div className="flex gap-0.5 mt-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 20 20" fill="currentColor"
          className={`w-3.5 h-3.5 ${i <= n ? "text-yellow-400" : "text-gray-500"}`}>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

// Mute icon
function IconMuted() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 16, height: 16 }}>
      <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0017.73 18L19 19.27 20.27 18 5.27 3 4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  );
}

function IconSound() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 16, height: 16 }}>
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function ReelCard({ item, active }) {
  const [muted, setMuted] = useState(true);
  const videoRef = useRef(null);
  const local = isLocalVideo(item.videoUrl);
  const videoId = local ? null : getYoutubeId(item.videoUrl);
  const [thumb, setThumb] = useState(
    videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : null
  );

  // Re-mute when slide becomes inactive; pause local video
  useEffect(() => {
    if (!active) {
      setMuted(true);
      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.pause();
      }
    } else {
      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [active]);

  // Sync mute state to local video element
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // YouTube embed URL — controls=0 + pointer-events:none hides all YouTube UI
  const ytSrc = videoId
    ? `https://www.youtube.com/embed/${videoId}?autoplay=${active ? 1 : 0}&mute=${muted ? 1 : 0}&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&iv_load_policy=3&fs=0&disablekb=1&playsinline=1&showinfo=0`
    : null;

  return (
    <div
      className="relative w-full overflow-hidden select-none"
      style={{ aspectRatio: "9/16", borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)" }}
    >
      {/* ── Active: local <video> ── */}
      {local && (
        <video
          ref={videoRef}
          src={item.videoUrl}
          className="absolute inset-0 w-full h-full object-cover"
          muted autoPlay loop playsInline
          style={{ opacity: active ? 1 : 0.6 }}
        />
      )}

      {/* ── Active: YouTube iframe ── */}
      {!local && active && videoId && (
        <iframe
          key={`${videoId}-${muted}`}
          src={ytSrc}
          className="absolute inset-0 w-full h-full"
          style={{ border: 0, pointerEvents: "none" }}
          allow="autoplay; encrypted-media"
          allowFullScreen={false}
        />
      )}

      {/* ── Inactive YouTube: thumbnail ── */}
      {!local && !active && (
        <img
          src={thumb}
          alt={item.name}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setThumb(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`)}
        />
      )}

      {/* Gradient */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
        style={{ pointerEvents: "none" }}
      />

      {/* Name + rating + mute button */}
      <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 flex items-end justify-between" style={{ zIndex: 2 }}>
        <div className="text-white">
          <p className="font-semibold text-sm leading-tight drop-shadow">{item.name}</p>
          <Stars count={item.rating} />
        </div>
        {active && (
          <button
            onClick={() => setMuted((m) => !m)}
            className="flex items-center justify-center rounded-full text-white transition-opacity hover:opacity-80"
            style={{ width: 32, height: 32, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.2)" }}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <IconMuted /> : <IconSound />}
          </button>
        )}
      </div>

      {/* Play icon on inactive slides (YouTube only) */}
      {!local && !active && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: "none", zIndex: 1 }}>
          <div className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: "rgba(255,255,255,0.8)" }}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="text-gray-900 ml-0.5" style={{ width: 18, height: 18 }}>
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VideoReelsSlider() {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const prevRef = useRef(null);
  const nextRef = useRef(null);

  useEffect(() => {
    fetch("/api/data?collection=video-reels", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setReels(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !reels.length) return null;

  return (
    <div className="w-full overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 mb-8 text-center">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900">Customer Reels</h2>
        <p className="text-sm text-gray-500 mt-1">Real feedback from our happy customers</p>
      </div>

      <div className="relative px-2 sm:px-4">
        {/* Nav arrows — hidden on mobile */}
        <button
          ref={prevRef}
          aria-label="Previous"
          className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white shadow-md border border-gray-200 items-center justify-center hover:bg-gray-50 transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-gray-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          ref={nextRef}
          aria-label="Next"
          className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white shadow-md border border-gray-200 items-center justify-center hover:bg-gray-50 transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-gray-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <Swiper
          modules={[Navigation, Autoplay]}
          centeredSlides
          slidesPerView={1.4}
          spaceBetween={12}
          loop={false}
          rewind
          autoplay={{ delay: 5000, disableOnInteraction: true }}
          navigation={{ prevEl: prevRef.current, nextEl: nextRef.current }}
          onBeforeInit={(swiper) => {
            swiper.params.navigation.prevEl = prevRef.current;
            swiper.params.navigation.nextEl = nextRef.current;
          }}
          onSlideChange={(swiper) => setActiveIndex(swiper.realIndex)}
          breakpoints={{
            480: { slidesPerView: 1.8, spaceBetween: 14 },
            640: { slidesPerView: 2.5, spaceBetween: 16 },
            900: { slidesPerView: 3.5, spaceBetween: 20 },
            1200: { slidesPerView: 4.5, spaceBetween: 24 },
          }}
          className="reel-spotlight-swiper"
        >
          {reels.map((item, idx) => (
            <SwiperSlide key={item._id || idx}>
              {({ isActive }) => (
                <div
                  className="transition-all duration-300"
                  style={{
                    transform: isActive ? "scale(1)" : "scale(0.88)",
                    opacity: isActive ? 1 : 0.65,
                    filter: isActive ? "none" : "brightness(0.7)",
                    boxShadow: isActive
                      ? "0 20px 60px rgba(0,0,0,0.25)"
                      : "0 4px 16px rgba(0,0,0,0.1)",
                    borderRadius: 16,
                  }}
                >
                  <ReelCard item={item} active={isActive} />
                </div>
              )}
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </div>
  );
}
