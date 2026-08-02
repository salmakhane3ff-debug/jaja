"use client";

import React, { useEffect, useState } from "react";
import Container         from "@/components/Container";
import RatingBadge       from "@/components/RatingBadge";
import Slider            from "@/components/Slider/Slider";
import SliderCollection  from "@/components/Colleaction/SliderCollection";
import ProductGrid       from "@/components/Product/ProductGrid";
import HomeCollectionSections, { SingleCollectionSection } from "@/components/Colleaction/HomeCollectionSections";
import VideoReels        from "@/components/VideoReels";
import SupportBenefits   from "@/components/SupportBenefits";
import HomeFeedbackSection from "@/components/HomeFeedbackSection";
import { useLanguage }   from "@/context/LanguageContext";
import ShoppableReels      from "@/components/ShoppableReels";
import BeforeAfterSlider   from "@/components/BeforeAfterSlider";
import { trackClarity }    from "@/lib/trackClarity";
import { MapPin, Phone as PhoneIcon, Clock } from "lucide-react";
import { normalizeStoreMap, buildEmbedUrl, buildDirectionsUrl, telHref } from "@/lib/storeMap";

// ── Countdown section ─────────────────────────────────────────────────────────
function CountdownTimer({ targetDate }) {
  const calc = () => {
    const diff = new Date(targetDate) - new Date();
    if (diff <= 0) return { d: 0, h: 0, m: 0, s: 0 };
    return {
      d: Math.floor(diff / 86400000),
      h: Math.floor((diff % 86400000) / 3600000),
      m: Math.floor((diff % 3600000) / 60000),
      s: Math.floor((diff % 60000) / 1000),
    };
  };
  const [time, setTime] = useState(calc);
  useEffect(() => {
    const t = setInterval(() => setTime(calc()), 1000);
    return () => clearInterval(t);
  }, [targetDate]);

  return (
    <div className="flex justify-center gap-3">
      {[{ v: time.d, l: "Days" }, { v: time.h, l: "Hours" }, { v: time.m, l: "Min" }, { v: time.s, l: "Sec" }].map(({ v, l }) => (
        <div key={l} className="flex flex-col items-center bg-white/10 backdrop-blur rounded-xl px-4 py-3 min-w-[64px]">
          <span className="text-3xl font-black tabular-nums">{String(v).padStart(2, "0")}</span>
          <span className="text-xs uppercase tracking-widest opacity-70 mt-1">{l}</span>
        </div>
      ))}
    </div>
  );
}

// ── Hero section ──────────────────────────────────────────────────────────────
function HeroSection({ data }) {
  return (
    <div className="relative w-full h-[280px] md:h-[480px] lg:h-[560px] overflow-hidden rounded-3xl mx-auto"
      style={{ background: data.image ? undefined : "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}>
      {data.image && (
        <>
          <img src={data.image} alt={data.title || "Hero"} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black" style={{ opacity: (data.overlayOpacity ?? 40) / 100 }} />
        </>
      )}
      <div className="relative z-10 h-full flex flex-col justify-center items-center text-center text-white px-6">
        {data.title    && <h1 className="text-3xl md:text-5xl font-black mb-3 leading-tight drop-shadow-lg">{data.title}</h1>}
        {data.subtitle && <p  className="text-base md:text-xl opacity-90 mb-6 max-w-xl drop-shadow">{data.subtitle}</p>}
        {data.buttonText && (
          <a href={data.buttonUrl || "/products"}
            className="inline-flex items-center gap-2 bg-white text-gray-900 font-bold px-8 py-3 rounded-full hover:bg-gray-100 active:scale-95 transition-all shadow-lg text-sm md:text-base">
            {data.buttonText}
          </a>
        )}
      </div>
    </div>
  );
}

// ── Image banner ──────────────────────────────────────────────────────────────
function ImageSection({ data }) {
  if (!data.url) return null;
  const img = <img src={data.url} alt={data.alt || ""} className="w-full object-cover rounded-3xl" loading="lazy" />;
  return data.link ? <a href={data.link}>{img}</a> : img;
}

// ── Video section ─────────────────────────────────────────────────────────────
function VideoSection({ data }) {
  if (!data.url) return null;
  const isYT = data.url.includes("youtube.com") || data.url.includes("youtu.be");
  const ytId = isYT
    ? (data.url.match(/youtu\.be\/([^?]+)/) || data.url.match(/[?&]v=([^&]+)/))?.[1]
    : null;

  return (
    <div className="w-full rounded-3xl overflow-hidden bg-black aspect-video">
      {ytId ? (
        <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${ytId}?autoplay=${data.autoplay ? 1 : 0}&mute=${data.muted ? 1 : 0}&loop=1&playlist=${ytId}`}
          allow="autoplay; encrypted-media" allowFullScreen />
      ) : (
        <video src={data.url} className="w-full h-full object-cover"
          autoPlay={data.autoplay} muted={data.muted} loop playsInline controls={!data.autoplay} />
      )}
    </div>
  );
}

// ── Text block ────────────────────────────────────────────────────────────────
function TextSection({ data }) {
  if (!data.content) return null;
  return (
    <div className={`max-w-3xl mx-auto text-gray-700 text-sm md:text-base leading-relaxed text-${data.align || "center"}`}
      dangerouslySetInnerHTML={{ __html: data.content.replace(/\n/g, "<br/>") }} />
  );
}

// ── CTA ───────────────────────────────────────────────────────────────────────
function CtaSection({ data }) {
  return (
    <div className="rounded-3xl overflow-hidden px-8 py-12 text-center text-white"
      style={{ background: data.bg || "#111827" }}>
      {data.title    && <h2 className="text-2xl md:text-4xl font-black mb-2">{data.title}</h2>}
      {data.subtitle && <p  className="opacity-80 mb-6 text-sm md:text-base">{data.subtitle}</p>}
      {data.buttonText && (
        <a href={data.buttonUrl || "/products"}
          className="inline-block bg-white text-gray-900 font-bold px-10 py-3 rounded-full hover:bg-gray-100 active:scale-95 transition-all text-sm md:text-base shadow-lg">
          {data.buttonText}
        </a>
      )}
    </div>
  );
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function CountdownSection({ data }) {
  if (!data.targetDate) return null;
  return (
    <div className="bg-gradient-to-r from-purple-600 to-indigo-700 rounded-3xl px-6 py-10 text-white text-center">
      {data.title    && <h2 className="text-xl md:text-3xl font-black mb-2">{data.title}</h2>}
      {data.subtitle && <p  className="opacity-80 mb-6 text-sm">{data.subtitle}</p>}
      <CountdownTimer targetDate={data.targetDate} />
    </div>
  );
}

// ── Contact ───────────────────────────────────────────────────────────────────
function ContactSection({ data }) {
  return (
    <div className="bg-white rounded-3xl border border-gray-200 px-6 py-8 text-center max-w-lg mx-auto shadow-sm">
      {data.title && <h2 className="text-xl font-bold text-gray-900 mb-4">{data.title}</h2>}
      <div className="space-y-2 text-sm text-gray-600">
        {data.phone   && <p>📞 <a href={`tel:${data.phone}`}   onClick={() => trackClarity("cta_phone", "footer")} className="hover:text-black">{data.phone}</a></p>}
        {data.email   && <p>✉️ <a href={`mailto:${data.email}`} className="hover:text-black">{data.email}</a></p>}
        {data.address && <p>📍 {data.address}</p>}
      </div>
    </div>
  );
}

// ── Products section ──────────────────────────────────────────────────────────
function ProductsSection({ data }) {
  return (
    <div>
      {data.title && <h2 className="text-xl md:text-2xl font-bold text-center mb-6 text-gray-900">{data.title}</h2>}
      <ProductGrid />
    </div>
  );
}

// ── Section map ───────────────────────────────────────────────────────────────
const RENDERERS = {
  hero:               ({ data }) => <HeroSection data={data} />,
  slider:             ()         => <Slider />,
  collection_slider:  ()         => <SliderCollection />,
  rating_badge:       ()         => <RatingBadge />,
  products:           ({ data }) => <ProductsSection data={data} />,
  collection_section: ({ data }) => {
    const isManual = data?.mode === "manual";
    // Render SingleCollectionSection when:
    //   • manual mode (selectedProducts drives the display), OR
    //   • auto mode with a collection chosen
    if (isManual || data?.collectionTitle || data?.collectionId) {
      return (
        <SingleCollectionSection
          collectionTitle={data.collectionTitle}
          collectionId={data.collectionId}
          productLimit={data.productLimit || 8}
          customTitle={data.customTitle || ""}
          showViewMore={data.showViewMore !== false}
          mode={data.mode || "auto"}
          selectedProducts={Array.isArray(data.selectedProducts) ? data.selectedProducts : []}
        />
      );
    }
    // Fallback: no collection configured → show all homepage collections (legacy)
    return <HomeCollectionSections />;
  },
  image:              ({ data }) => <ImageSection data={data} />,
  video:              ({ data }) => <VideoSection data={data} />,
  text:               ({ data }) => <TextSection data={data} />,
  cta:                ({ data }) => <CtaSection data={data} />,
  countdown:          ({ data }) => <CountdownSection data={data} />,
  reviews:            ()         => <HomeFeedbackSection forceShow />,
  support:            ()         => <SupportBenefits />,
  reels:              ()         => <VideoReels />,
  shoppable_reels:    ({ data }) => <ShoppableReels title={data?.title || "In Action"} />,
  before_after:       ({ data }) => <BeforeAfterSlider title={data?.title || ""} />,
  contact:            ({ data }) => <ContactSection data={data} />,
  store_map:          ({ data }) => <StoreMapSection data={data} />,
};

// Sections that should be wrapped in the shared Container (max-w-7xl, centered).
// Sections not listed here render full-width (e.g. video reels, support bar).
const CONTAINER_SECTIONS = new Set([
  "hero",
  "slider",
  "image",
  "cta",
  "countdown",
  "contact",
  "text",
  "video",
  "products",
  "collection_slider",
  "collection_section",
  "before_after",
  "store_map",
]);

// ── 📍 Store Map section ──────────────────────────────────────────────────────
// Store info card above an embedded Google Map (red marker comes from the
// `q=lat,lng` embed), with a directions button below. The iframe URL is built
// and validated in src/lib/storeMap.js — never taken from raw admin input.
function StoreMapSection({ data }) {
  const cfg = normalizeStoreMap(data);
  const embed = buildEmbedUrl(cfg);
  const directions = buildDirectionsUrl(cfg);
  const tel = telHref(cfg.phone);
  const [loaded, setLoaded] = useState(false);

  const rows = [
    cfg.address && { icon: MapPin, text: cfg.address },
    cfg.phone && { icon: PhoneIcon, text: cfg.phone, href: tel },
    cfg.hours && { icon: Clock, text: cfg.hours },
  ].filter(Boolean);

  if (!embed && !rows.length && !cfg.storeName) return null;

  return (
    <section className="w-full">
      {(cfg.title || cfg.subtitle) && (
        <div className="text-center mb-5">
          {cfg.title && <h2 className="text-2xl md:text-3xl font-black text-gray-900">{cfg.title}</h2>}
          {cfg.subtitle && <p className="text-sm text-gray-500 mt-1.5">{cfg.subtitle}</p>}
        </div>
      )}

      <div className="rounded-3xl bg-white border border-gray-100 shadow-lg shadow-gray-100/70 overflow-hidden">
        {/* Store information card — above the map */}
        {(cfg.storeName || rows.length > 0) && (
          <div className="p-5 sm:p-6 border-b border-gray-100">
            {cfg.storeName && (
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-9 h-9 rounded-full bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                  <MapPin className="w-4.5 h-4.5" />
                </span>
                <h3 className="text-base font-black text-gray-900">{cfg.storeName}</h3>
              </div>
            )}
            <div className="grid sm:grid-cols-3 gap-3">
              {rows.map(({ icon: Icon, text, href }, i) => (
                <div key={i} className="flex items-start gap-2 rounded-2xl bg-gray-50 px-3.5 py-3">
                  <Icon className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  {href
                    ? <a href={href} className="text-xs font-semibold text-gray-700 hover:text-black break-words">{text}</a>
                    : <span className="text-xs font-semibold text-gray-700 break-words">{text}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Embedded map — ~300px on mobile, taller on desktop */}
        {embed && (
          <div className="relative w-full h-[300px] md:h-[420px] bg-gray-100">
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <iframe
              src={embed}
              title={cfg.storeName || cfg.title || "Store map"}
              onLoad={() => setLoaded(true)}
              className={`w-full h-full border-0 transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        )}

        {/* Directions button — below the map */}
        {directions && (
          <div className="p-5 sm:p-6">
            <a href={directions} target="_blank" rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-red-500 hover:bg-red-600 active:scale-[0.98] text-white font-black text-sm shadow-lg shadow-red-200 transition-all">
              <MapPin className="w-4 h-4" /> {cfg.buttonText}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Main renderer ─────────────────────────────────────────────────────────────
// PERF: Accepts `sections` as an optional prop.
//       When page.jsx already fetched homepage_layout and passes sections here,
//       this component skips its own duplicate fetch — eliminating a redundant
//       /api/setting?type=homepage_layout network round-trip on every page load.
export default function HomeSectionRenderer({ sections: initialSections } = {}) {
  const [sections, setSections] = useState(initialSections ?? null);

  useEffect(() => {
    // PERF: Skip fetch when caller already provided sections (e.g. page.jsx).
    if (initialSections != null) return;

    fetch("/api/setting?type=homepage_layout", { cache: "no-store" })
      .then(r => r.ok ? r.json() : {})
      .then(d => setSections(Array.isArray(d?.sections) ? d.sections : null))
      .catch(() => setSections(null));
  }, [initialSections]);

  // null = loading or no custom layout → homepage uses default layout
  if (sections === null) return null;

  return (
    <div className="space-y-10 md:space-y-16 pb-10">
      {sections.filter(s => s.visible !== false).map(sec => {
        const Renderer = RENDERERS[sec.type];
        if (!Renderer) return null;
        const content = <Renderer data={sec.data || {}} />;
        return CONTAINER_SECTIONS.has(sec.type)
          ? <Container key={sec.id}>{content}</Container>
          : <div key={sec.id} className="w-full">{content}</div>;
      })}
    </div>
  );
}
