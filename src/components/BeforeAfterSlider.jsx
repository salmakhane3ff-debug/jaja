"use client";

import { useEffect, useState, useRef } from "react";
import { Swiper, SwiperSlide }         from "swiper/react";
import { Navigation }                  from "swiper/modules";
import "swiper/css";

// ── Heart icon ────────────────────────────────────────────────────────────────
function HeartIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" width="14px" height="14px" fill="currentColor">
      <path d="M15 7C7.8 7 2 12.8 2 20c0 14.8 16.7 22 22.4 26.8L25 47.3l.6-.5C31.3 42 48 34.8 48 20 48 12.8 42.2 7 35 7c-4.1 0-7.6 1.9-10 4.8C22.6 8.9 19.1 7 15 7z"/>
    </svg>
  );
}

// ── Stars ─────────────────────────────────────────────────────────────────────
function Stars({ count = 5 }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} xmlns="http://www.w3.org/2000/svg" width="16" height="15" viewBox="0 0 20 19" fill="none">
          <path d="M10 0L12.94 5.95L19.51 6.91L14.76 11.55L15.88 18.09L10 15L4.12 18.09L5.24 11.55L0.49 6.91L7.06 5.95L10 0Z" fill="#e7002a"/>
        </svg>
      ))}
    </div>
  );
}

// ── Single card ───────────────────────────────────────────────────────────────
function BACard({ item }) {
  const { beforeImage, afterImage, stars = 5, tags = [], product } = item;

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm flex flex-col h-full">

      {/* Before / After images */}
      <div className="grid grid-cols-2 gap-px bg-gray-200">
        {[{ src: beforeImage, label: "Avant" }, { src: afterImage, label: "Après" }].map(({ src, label }) => (
          <div key={label} className="relative aspect-square bg-gray-100 overflow-hidden">
            {src
              ? <img src={src} alt={label} className="w-full h-full object-cover" loading="lazy" />
              : <div className="w-full h-full bg-gray-200" />
            }
            <span className="absolute bottom-2 left-2 text-white text-[11px] font-bold bg-black/40 px-2 py-0.5 rounded-full">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2 p-3 flex-1">

        {/* Stars */}
        <Stars count={stars} />

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
              <span key={i} className="flex items-center gap-1 text-[11px] text-gray-600 border border-gray-200 rounded-full px-2 py-0.5">
                <HeartIcon /> {tag}
              </span>
            ))}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Product */}
        {product && (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 mt-auto">
            <div className="flex items-center gap-2 min-w-0">
              {product.image && (
                <img src={product.image} alt={product.title} className="w-10 h-10 object-cover rounded-lg flex-shrink-0" />
              )}
              <span className="text-xs font-semibold text-gray-800 truncate">{product.title}</span>
            </div>
            {(product.slug || product.id) && (
              <a
                href={product.slug ? `/products/${product.slug}` : `/products/${product.id}`}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-bold text-white rounded-full"
                style={{ background: "#1a1a1a" }}
              >
                Shop
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function BeforeAfterSlider({ title }) {
  const [items, setItems] = useState([]);
  const prevRef = useRef(null);
  const nextRef = useRef(null);

  useEffect(() => {
    fetch("/api/data?collection=before-after")
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  if (!items.length) return null;

  const heading = title || "Des résultats visibles, une confiance ressentie.";

  return (
    <div style={{ background: "#f5ebe8" }} className="w-full py-10 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4">

        {/* Title row: centered title + nav arrows */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex-1" />
          <h2 className="text-2xl md:text-3xl font-bold leading-snug text-gray-900 text-center">
            {heading.includes(",") ? (
              <>
                {heading.split(",")[0]},
                <em className="not-italic" style={{ fontStyle: "italic" }}> {heading.split(",").slice(1).join(",")}</em>
              </>
            ) : heading}
          </h2>
          {/* Nav arrows */}
          <div className="flex-1 flex justify-end gap-2">
            <button ref={prevRef}
              className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center hover:bg-white transition-colors disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <button ref={nextRef}
              className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center hover:bg-white transition-colors disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Swiper */}
        <div className="min-w-0">
          <Swiper
            modules={[Navigation]}
            navigation={{ prevEl: prevRef.current, nextEl: nextRef.current }}
            onBeforeInit={(swiper) => {
              swiper.params.navigation.prevEl = prevRef.current;
              swiper.params.navigation.nextEl = nextRef.current;
            }}
            slidesPerView={1.15}
            spaceBetween={12}
            breakpoints={{
              640:  { slidesPerView: 2.1,  spaceBetween: 12 },
              1024: { slidesPerView: 3,    spaceBetween: 14 },
            }}
            rewind={items.length > 1}
            className="!overflow-visible"
          >
            {items.map((item) => (
              <SwiperSlide key={item._id} className="h-auto">
                <BACard item={item} />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

      </div>
    </div>
  );
}
