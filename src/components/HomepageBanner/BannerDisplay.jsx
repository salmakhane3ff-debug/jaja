"use client";

import { useState, useEffect, useRef } from "react";

// ── Slider Banner ─────────────────────────────────────────────────────────────

function BannerSlider({ banner }) {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef(null);
  const images = Array.isArray(banner.images) ? banner.images : [];
  const links  = Array.isArray(banner.links)  ? banner.links  : [];

  useEffect(() => {
    if (images.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % images.length);
    }, 3000);
    return () => clearInterval(timerRef.current);
  }, [images.length]);

  if (images.length === 0) return null;

  return (
    <div className="relative w-full overflow-hidden" style={{ paddingBottom: "37.5%" }}>
      {images.map((img, i) => {
        const href = links[i] || null;
        return (
          <div
            key={i}
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: i === current ? 1 : 0, zIndex: i === current ? 1 : 0 }}
          >
            {href ? (
              <a href={href} className="block w-full h-full">
                <img
                  src={img}
                  alt={`${banner.title} ${i + 1}`}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
              </a>
            ) : (
              <img
                src={img}
                alt={`${banner.title} ${i + 1}`}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
            )}
          </div>
        );
      })}

      {/* Dot indicators */}
      {images.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                clearInterval(timerRef.current);
                setCurrent(i);
              }}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === current ? "bg-white scale-125" : "bg-white/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Single Banner ─────────────────────────────────────────────────────────────

function BannerSingle({ banner }) {
  const img  = Array.isArray(banner.images) ? banner.images[0] : null;
  const href = Array.isArray(banner.links)  ? banner.links[0]  : null;
  if (!img) return null;

  const image = (
    <div className="relative w-full overflow-hidden" style={{ paddingBottom: "37.5%" }}>
      <img
        src={img}
        alt={banner.title}
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
      />
    </div>
  );

  return href ? <a href={href} className="block">{image}</a> : image;
}

// ── Main Export ───────────────────────────────────────────────────────────────

export default function BannerDisplay({ banner }) {
  if (!banner || !banner.isActive) return null;

  return (
    <div className="w-full">
      {banner.type === "slider" ? (
        <BannerSlider banner={banner} />
      ) : (
        <BannerSingle banner={banner} />
      )}
    </div>
  );
}
