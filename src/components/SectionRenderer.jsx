"use client";

/**
 * SectionRenderer — renders product content sections on the product page.
 * Backward-compatible: if no sections, falls back to rendering description HTML.
 *
 * Props:
 *   sections    – array of section objects (from product.sections)
 *   description – legacy HTML string (fallback)
 */

import { useState } from "react";
import { ChevronDown, Play, Volume2, VolumeX } from "lucide-react";

// ── Video helpers ────────────────────────────────────────────────────────────
function getVideoType(url) {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("vimeo.com"))                              return "vimeo";
  if (/\.(mp4|webm|ogg|mov|m4v)/.test(u))                  return "mp4";
  return null;
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

// ── Section renderers ─────────────────────────────────────────────────────────

function TextSection({ data }) {
  if (!data.html) return null;
  return (
    <div
      className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
      style={{ fontSize: "0.9rem", lineHeight: "1.7" }}
      dangerouslySetInnerHTML={{ __html: data.html }}
    />
  );
}

function ImageSection({ data }) {
  if (!data.url) return null;
  const isGif = /\.gif(\?|$)/i.test(data.url);
  const cls = data.fullWidth ? "w-full" : "max-w-lg mx-auto";
  return (
    <div className={cls}>
      <img
        src={data.url}
        alt={data.alt || ""}
        loading={isGif ? "eager" : "lazy"}
        onContextMenu={(e) => e.preventDefault()}
        className="w-full rounded-xl object-contain border border-gray-100 bg-gray-50"
        style={isGif ? {} : { maxHeight: 500 }}
      />
    </div>
  );
}

function VideoSection({ data }) {
  const { url, autoplay, muted, loop } = data;
  if (!url) return null;

  const type = getVideoType(url);

  if (type === "youtube") {
    const vid = getYouTubeId(url);
    if (!vid) return null;
    const params = new URLSearchParams({
      autoplay: autoplay ? "1" : "0",
      mute:     (autoplay || muted) ? "1" : "0",
      loop:     loop ? "1" : "0",
      playlist: vid,
      rel:      "0",
      modestbranding: "1",
    });
    return (
      <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
        <iframe
          src={`https://www.youtube.com/embed/${vid}?${params}`}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ border: "none" }}
          loading="lazy"
        />
      </div>
    );
  }

  if (type === "vimeo") {
    const vid = getVimeoId(url);
    if (!vid) return null;
    return (
      <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
        <iframe
          src={`https://player.vimeo.com/video/${vid}?autoplay=${autoplay ? 1 : 0}&muted=${muted ? 1 : 0}&loop=${loop ? 1 : 0}&byline=0&portrait=0&title=0`}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          style={{ border: "none" }}
          loading="lazy"
        />
      </div>
    );
  }

  if (type === "mp4") {
    return (
      <div className="w-full rounded-xl overflow-hidden bg-black" onContextMenu={(e) => e.preventDefault()}>
        <video
          src={url}
          autoPlay={autoplay}
          muted={muted}
          loop={loop}
          playsInline
          controls
          disablePictureInPicture
          controlsList="nodownload nofullscreen"
          className="w-full rounded-xl"
          style={{ maxHeight: 500, background: "#000" }}
          loading="lazy"
        />
      </div>
    );
  }

  return null;
}

function GallerySection({ data }) {
  const images = data.images || [];
  if (images.length === 0) return null;

  const cols = data.columns || 2;
  const gap  = data.gap ?? 8;

  return (
    <div
      className="w-full"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: `${gap}px`,
      }}
    >
      {images.map((url, i) => {
        const isGif = /\.gif(\?|$)/i.test(url);
        return (
          <div key={i} className="overflow-hidden rounded-lg bg-gray-100 border border-gray-100"
            style={{ aspectRatio: "1/1" }}>
            <img src={url} alt={`Gallery ${i + 1}`} loading={isGif ? "eager" : "lazy"}
              onContextMenu={(e) => e.preventDefault()}
              className="w-full h-full object-contain" />
          </div>
        );
      })}
    </div>
  );
}

function FaqSection({ data }) {
  const items = data.items || [];
  if (items.length === 0) return null;

  const [openIdx, setOpenIdx] = useState(null);

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const isOpen = openIdx === i;
        return (
          <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? null : i)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left bg-white hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-800 pr-4">{item.q}</span>
              <ChevronDown
                size={16}
                className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-1 bg-white border-t border-gray-100">
                <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SpacerSection({ data }) {
  return <div style={{ height: `${data.height || 40}px` }} aria-hidden="true" />;
}

// ── Section dispatcher ────────────────────────────────────────────────────────
function renderSection(section, i) {
  const { type, data } = section;
  switch (type) {
    case "text":    return <TextSection    key={i} data={data} />;
    case "image":   return <ImageSection   key={i} data={data} />;
    case "video":   return <VideoSection   key={i} data={data} />;
    case "gallery": return <GallerySection key={i} data={data} />;
    case "faq":     return <FaqSection     key={i} data={data} />;
    case "spacer":  return <SpacerSection  key={i} data={data} />;
    default:        return null;
  }
}

// ── Main SectionRenderer ──────────────────────────────────────────────────────
export default function SectionRenderer({ sections, description }) {
  // Parse sections if it came as a JSON string
  let parsed = [];
  if (Array.isArray(sections) && sections.length > 0) {
    parsed = sections;
  } else if (typeof sections === "string") {
    try { parsed = JSON.parse(sections); } catch { parsed = []; }
  }

  // If no sections but has legacy description → show it as a text block
  if (parsed.length === 0 && description) {
    return (
      <div
        className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
        style={{ fontSize: "0.9rem", lineHeight: "1.7" }}
        dangerouslySetInnerHTML={{ __html: description }}
      />
    );
  }

  if (parsed.length === 0) return null;

  return (
    <div className="space-y-6">
      {parsed.map((section, i) => renderSection(section, i))}
    </div>
  );
}
