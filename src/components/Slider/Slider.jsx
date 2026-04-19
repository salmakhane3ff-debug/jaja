"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image"; // PERF: Next.js Image for automatic WebP/AVIF + responsive sizing
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination, Navigation } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/navigation";
import { Skeleton } from "@heroui/skeleton";

const COLLECTION       = "slider-image";
const PROMO_COLLECTION = "promo-text";

// ── YouTube helpers ───────────────────────────────────────────────────────────

function isYouTubeUrl(url = "") {
  return url.includes("youtube.com") || url.includes("youtu.be");
}

function getYouTubeEmbedUrl(url) {
  const short = url.match(/youtu\.be\/([^?&\s]+)/);
  if (short)
    return `https://www.youtube.com/embed/${short[1]}?autoplay=1&mute=1&loop=1&playlist=${short[1]}&controls=0&playsinline=1`;
  const long = url.match(/[?&]v=([^&\s]+)/);
  if (long)
    return `https://www.youtube.com/embed/${long[1]}?autoplay=1&mute=1&loop=1&playlist=${long[1]}&controls=0&playsinline=1`;
  return url;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StyleOne() {
  const [images,     setImages]     = useState([]);
  const [promoTexts, setPromoTexts] = useState([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [error,      setError]      = useState(null);
  const swiperRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const ts = Date.now();
        const [sliderRes, promoRes] = await Promise.all([
          fetch(`/api/data?collection=${COLLECTION}&_t=${ts}`,       { cache: "no-store" }),
          fetch(`/api/data?collection=${PROMO_COLLECTION}&_t=${ts}`, { cache: "no-store" }),
        ]);

        const sliderData = await sliderRes.json();
        const promoData  = await promoRes.json();

        if (sliderRes.ok) {
          const sorted = sliderData
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .filter((s) => s.active !== false);
          setImages(sorted);
        }

        if (promoRes.ok && promoData.length > 0) {
          setPromoTexts(promoData.filter((item) => item.status === "Active"));
        } else {
          setPromoTexts([]);
        }
      } catch (err) {
        setError("Failed to load data");
        setPromoTexts([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Pause autoplay while a video slide is active
  // Also lazily assign src to video elements when their slide becomes active
  const handleSlideChange = (swiper) => {
    const current = images[swiper.realIndex];
    if (current?.mediaType === "video") {
      swiper.autoplay?.stop();
      // Lazy-load: assign src when slide becomes active for the first time
      const slide = swiper.slides[swiper.realIndex];
      const vid = slide?.querySelector("video[data-src]");
      if (vid && vid.dataset.src) {
        vid.src = vid.dataset.src;
        vid.removeAttribute("data-src");
        vid.play().catch(() => {});
      }
    } else {
      swiper.autoplay?.start();
    }
  };

  if (isLoading) {
    return <Skeleton className="w-full h-[200px] md:h-[400px] lg:h-[500px] rounded-3xl" />;
  }

  if (images.length === 0) {
    if (error) console.error("Slider error:", error);
    return null;
  }

  return (
    <div>
      <div className="relative">
          <Swiper
            modules={[Autoplay, Pagination, Navigation]}
            slidesPerView={1}
            className="rounded-3xl overflow-hidden"
            loop={false}
            rewind={images.length > 1}
            autoplay={
              images.length > 1
                ? { delay: 4000, disableOnInteraction: false }
                : false
            }
            pagination={
              images.length > 1
                ? {
                    clickable: true,
                    dynamicBullets: true,
                    dynamicMainBullets: 3,
                    el: ".slider-pagination",
                  }
                : false
            }
            navigation={false}
            onSwiper={(swiper) => { swiperRef.current = swiper; }}
            onSlideChange={handleSlideChange}
          >
            {images.map((item, index) => {
              const isVideo   = item.mediaType === "video";
              const hasBuyNow = item.showBuyNow && item.buyNowUrl;
              // PERF: First slide is the LCP element — load it eagerly with high priority.
              //       All subsequent slides are below-fold so they load lazily.
              const isFirstSlide = index === 0;

              return (
                <SwiperSlide key={item._id || index}>
                  <div className="relative group w-full h-[200px] md:h-[400px] lg:h-[500px] overflow-hidden bg-black">

                    {isVideo ? (
                      /* ── Video ── */
                      isYouTubeUrl(item.videoUrl) ? (
                        <iframe
                          src={getYouTubeEmbedUrl(item.videoUrl)}
                          className="absolute inset-0 w-full h-full"
                          frameBorder="0"
                          allow="autoplay; encrypted-media; picture-in-picture"
                          allowFullScreen
                          title={item.title || `Slide ${index + 1}`}
                        />
                      ) : (
                        /* PERF: src only set on first (active) slide.
                               autoPlay + preload="none" is contradictory — the browser
                               ignores preload="none" when autoPlay is present and fetches
                               the full video. Setting src={undefined} on inactive slides
                               prevents the browser from downloading off-screen videos. */
                        <video
                          src={index === 0 ? item.videoUrl : undefined}
                          data-src={index !== 0 ? item.videoUrl : undefined}
                          className="w-full h-full object-cover"
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="none"
                          poster={item.image || undefined}
                        />
                      )
                    ) : (
                      /* ── Image ── */
                      <a href={item.url || "#"} className="block w-full h-full">
                        {/* PERF: Replaced raw <img> with Next.js <Image>.
                               - fill: fills the absolutely-positioned container (no width/height needed)
                               - sizes: tells browser the image always spans 100vw → correct srcset
                               - priority: first slide is LCP; browser preloads it immediately
                               - fetchPriority="high": additional hint for browsers that support it
                               - quality={85}: good visual quality at ~30% smaller file size
                               Benefits: automatic WebP/AVIF, responsive srcset, no CLS */}
                        <Image
                          src={item.image}
                          alt={item.title || `Slide ${index + 1}`}
                          fill
                          sizes="100vw"
                          className="object-cover"
                          priority={isFirstSlide}
                          fetchPriority={isFirstSlide ? "high" : "auto"}
                          quality={85}
                        />
                      </a>
                    )}

                    {/* Click-through overlay for video slides with a redirect URL */}
                    {isVideo && item.url && item.url !== "#" && !hasBuyNow && (
                      <a
                        href={item.url}
                        className="absolute inset-0 z-10"
                        aria-label={item.title || "View offer"}
                      />
                    )}

                    {/* ── Buy Now Button ── */}
                    {hasBuyNow && (
                      <div className="absolute bottom-4 sm:bottom-6 left-0 right-0 z-20 flex justify-center px-4 pointer-events-none">
                        <a
                          href={item.buyNowUrl}
                          className="pointer-events-auto inline-flex items-center gap-2 px-5 sm:px-7 py-2.5 sm:py-3 bg-gray-900 hover:bg-gray-700 active:scale-95 text-white font-bold text-sm sm:text-base rounded-xl shadow-lg transition-all duration-150 select-none"
                          onClick={(e) => e.stopPropagation()}
                        >
                          🛒 <span>{item.buyNowText || "Buy Now"}</span>
                        </a>
                      </div>
                    )}
                  </div>
                </SwiperSlide>
              );
            })}
          </Swiper>

          {images.length > 1 && (
            <div className="slider-pagination flex justify-center mt-4" />
          )}
      </div>

      {/* Promo bar */}
      {promoTexts.length > 0 && (
        <div className="bg-gradient-to-r from-red-500 to-pink-500 text-white py-3 mt-6 overflow-hidden relative">
          <div className="flex animate-marquee whitespace-nowrap">
            {Array(500)
              .fill(null)
              .map((_, i) => (
                <span key={i} className="text-lg font-bold mx-8 flex items-center">
                  {promoTexts[0].text ||
                    `${promoTexts[0].emoji || "🎉"} ${
                      promoTexts[0].title || promoTexts[0].content
                    } ${promoTexts[0].emoji || "🎉"}`}
                </span>
              ))}
          </div>
        </div>
      )}

      <style jsx global>{`
        .slider-pagination {
          position: relative !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center;
          width: 100% !important;
        }
        .slider-pagination .swiper-pagination-bullet {
          position: static !important;
          left: auto !important;
          right: auto !important;
          width: 8px; height: 8px;
          background: rgba(107,114,128,0.5);
          opacity: 0.5; transition: all 0.3s ease;
          margin: 0 4px !important;
        }
        .slider-pagination .swiper-pagination-bullet-active {
          background: rgb(75,85,99);
          opacity: 1; width: 24px; border-radius: 4px;
        }
        .slider-pagination .swiper-pagination-bullet-active-main { opacity: 1; }
        .slider-pagination .swiper-pagination-bullet-active-prev,
        .slider-pagination .swiper-pagination-bullet-active-next { opacity: 0.7; }

        @keyframes marquee {
          0%   { transform: translateX(0%); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee { animation: marquee 120s linear infinite; }
        .animate-marquee:hover { animation-play-state: paused; }
        @media (max-width: 768px) {
          .animate-marquee { animation: marquee 15s linear infinite; }
        }
      `}</style>
    </div>
  );
}
