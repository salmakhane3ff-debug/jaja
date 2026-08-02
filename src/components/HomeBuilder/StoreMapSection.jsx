"use client";

/**
 * 📍 Store Map section — the SINGLE renderer used by BOTH the storefront
 * (HomeSectionRenderer) and the Homepage Builder preview, so the two can never
 * drift apart.
 *
 * MAP: Leaflet + OpenStreetMap tiles. No Google iframe, no Embed API, no API
 * key — Google blocks framing of its Maps pages, which is what produced the
 * broken map. Leaflet is imported dynamically inside an effect so it never runs
 * during SSR. The marker is a CSS/SVG divIcon, which also avoids Leaflet's
 * well-known bundler issue with its default marker image assets.
 *
 * The "Open in Google Maps" BUTTON still points at Google — a normal link works
 * fine, only framing is blocked.
 */
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { MapPin, Phone as PhoneIcon, Clock, Star } from "lucide-react";
import {
  normalizeStoreMap, resolveCoordinates, buildDirectionsUrl, telHref, computeOpenNow,
} from "@/lib/storeMap";

/** Red pin rendered as pure markup — no image asset to 404. */
const RED_PIN_HTML = `
  <span style="position:relative;display:block;width:28px;height:40px">
    <svg viewBox="0 0 24 34" width="28" height="40" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 22 12 22s12-13.6 12-22c0-6.6-5.4-12-12-12z"
            fill="#ef4444" stroke="#ffffff" stroke-width="2"/>
      <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
    </svg>
  </span>`;

function LeafletMap({ lat, lng, label }) {
  const holder = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !holder.current) return;

      // Re-init safely when the coordinates change (admin preview edits live).
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

      const map = L.map(holder.current, {
        center: [lat, lng],
        zoom: 16,
        zoomAnimation: true,          // smooth zoom
        fadeAnimation: true,
        scrollWheelZoom: false,       // never hijack page scrolling
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      L.marker([lat, lng], {
        title: label || undefined,
        icon: L.divIcon({
          html: RED_PIN_HTML,
          className: "",              // no default leaflet styling
          iconSize: [28, 40],
          iconAnchor: [14, 40],       // tip of the pin sits on the coordinate
        }),
      }).addTo(map);

      // Container starts hidden/sized by CSS — make sure Leaflet measures it.
      setTimeout(() => { try { map.invalidateSize(); } catch {} }, 0);
      setReady(true);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [lat, lng, label]);

  return (
    <div className="relative w-full h-[300px] md:h-[420px] rounded-[24px] overflow-hidden shadow-lg shadow-gray-200/70 bg-gray-100">
      {!ready && (
        <div className="absolute inset-0 z-[1] animate-pulse bg-gradient-to-br from-gray-100 via-gray-200 to-gray-100 flex items-center justify-center">
          <MapPin className="w-8 h-8 text-gray-300" />
        </div>
      )}
      <div ref={holder} className="w-full h-full" />
    </div>
  );
}

export default function StoreMapSection({ data }) {
  const cfg = normalizeStoreMap(data);
  const coords = resolveCoordinates(cfg);
  const directions = buildDirectionsUrl(cfg);
  const tel = telHref(cfg.phone);
  const openNow = computeOpenNow(cfg.hours);

  if (!coords && !cfg.storeName && !cfg.address) return null;

  return (
    <section className="w-full animate-[smIn_0.5s_ease]">
      {(cfg.title || cfg.subtitle) && (
        <div className="text-center mb-5">
          {cfg.title && <h2 className="text-2xl md:text-3xl font-black tracking-tight text-gray-900">{cfg.title}</h2>}
          {cfg.subtitle && <p className="text-sm text-gray-500 mt-1.5">{cfg.subtitle}</p>}
        </div>
      )}

      {/* Compact store information card */}
      {(cfg.storeName || cfg.address || cfg.hours || cfg.phone || cfg.rating !== null || cfg.city) && (
        <div className="mb-4 rounded-3xl bg-gradient-to-br from-white to-gray-50 border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-red-200">
              <MapPin className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              {cfg.storeName && <h3 className="text-base sm:text-lg font-black text-gray-900 leading-tight truncate">{cfg.storeName}</h3>}
              {cfg.address && <p className="text-sm text-gray-500 mt-0.5 break-words">{cfg.address}</p>}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
                {cfg.rating !== null && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="flex" aria-label={`Note ${cfg.rating} sur 5`}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(cfg.rating) ? "fill-amber-400 text-amber-400" : "text-gray-200"}`} />
                      ))}
                    </span>
                    <span className="text-xs font-black text-gray-800">{cfg.rating.toFixed(1)}</span>
                  </span>
                )}
                {cfg.city && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />{cfg.city}
                  </span>
                )}
                {openNow !== null && (
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-black ${openNow ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${openNow ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
                    {openNow ? "Ouvert maintenant" : "Fermé"}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
                {cfg.hours && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />{cfg.hours}
                  </span>
                )}
                {cfg.phone && (
                  tel
                    ? <a href={tel} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-red-600 transition-colors"><PhoneIcon className="w-3.5 h-3.5 text-gray-400" />{cfg.phone}</a>
                    : <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600"><PhoneIcon className="w-3.5 h-3.5 text-gray-400" />{cfg.phone}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OpenStreetMap via Leaflet — no Google iframe */}
      {coords
        ? <LeafletMap lat={coords.lat} lng={coords.lng} label={cfg.storeName || cfg.title} />
        : (
          <div className="w-full rounded-[24px] border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
            <MapPin className="w-7 h-7 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-500">La position du magasin n'est pas encore configurée.</p>
          </div>
        )}

      {/* Two equal actions below the map — Call hides when no phone is set */}
      {(directions || tel) && (
        <div className={`grid gap-3 mt-4 ${directions && tel ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
          {directions && (
            <a href={directions} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-black text-sm shadow-lg shadow-red-200 hover:shadow-xl active:scale-[0.98] transition-all">
              <MapPin className="w-4 h-4" /> {cfg.buttonText}
            </a>
          )}
          {tel && (
            <a href={tel}
              className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-white border-2 border-gray-200 hover:border-gray-900 hover:bg-gray-50 text-gray-900 font-black text-sm active:scale-[0.98] transition-all">
              <PhoneIcon className="w-4 h-4" /> {cfg.callText}
            </a>
          )}
        </div>
      )}
      <style>{`
        @keyframes smIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .leaflet-container{font:inherit;background:#e5e7eb}
      `}</style>
    </section>
  );
}
