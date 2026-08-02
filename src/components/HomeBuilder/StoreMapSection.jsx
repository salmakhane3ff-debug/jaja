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
  buildStoreWhatsappUrl,
} from "@/lib/storeMap";

/** Official WhatsApp glyph (lucide has no brand icon). */
function WhatsAppIcon({ className = "w-4 h-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.86 1.21 3.06c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.23 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z"/>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23z"/>
    </svg>
  );
}

/**
 * Shared style for BOTH action buttons — identical size, radius, shadow, hover
 * and active animation. Uses the site's red/rose primary palette (the WhatsApp
 * button deliberately does NOT use WhatsApp green).
 */
const ACTION_BTN =
  "inline-flex items-center justify-center gap-2 w-full min-w-0 h-14 px-3 sm:px-5 rounded-2xl " +
  "bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 " +
  "text-white font-black text-xs sm:text-sm shadow-lg shadow-red-200 hover:shadow-xl " +
  "active:scale-[0.98] transition-all";

/** Red pin rendered as pure markup — no image asset to 404. */
const RED_PIN_HTML = `
  <span style="position:relative;display:block;width:28px;height:40px">
    <svg viewBox="0 0 24 34" width="28" height="40" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 22 12 22s12-13.6 12-22c0-6.6-5.4-12-12-12z"
            fill="#ef4444" stroke="#ffffff" stroke-width="2"/>
      <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
    </svg>
  </span>`;

/** Leaflet popups take an HTML string, so admin-entered text must be escaped. */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/** Popup markup: store name, address, working hours, phone (when present). */
function popupHtml({ storeName, address, hours, phone, tel }) {
  const rows = [
    address && `<div style="color:#6b7280;margin-top:2px">${esc(address)}</div>`,
    hours && `<div style="color:#374151;margin-top:6px">🕘 ${esc(hours)}</div>`,
    phone && (tel
      ? `<div style="margin-top:4px">☎️ <a href="${esc(tel)}" style="color:#ef4444;font-weight:700;text-decoration:none">${esc(phone)}</a></div>`
      : `<div style="margin-top:4px;color:#374151">☎️ ${esc(phone)}</div>`),
  ].filter(Boolean).join("");
  const title = storeName ? `<div style="font-weight:800;color:#111827">${esc(storeName)}</div>` : "";
  if (!title && !rows) return null;
  return `<div style="min-width:170px;font-size:13px;line-height:1.45">${title}${rows}</div>`;
}

function LeafletMap({ lat, lng, label, popup }) {
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

      const marker = L.marker([lat, lng], {
        title: label || undefined,
        icon: L.divIcon({
          html: RED_PIN_HTML,
          className: "",              // no default leaflet styling
          iconSize: [28, 40],
          iconAnchor: [14, 40],       // tip of the pin sits on the coordinate
        }),
      }).addTo(map);

      // Store details popup — opened by default so the info is visible at once.
      if (popup) {
        marker.bindPopup(popup, { offset: [0, -34], closeButton: true, maxWidth: 260 });
        marker.openPopup();
      }

      // Container starts hidden/sized by CSS — make sure Leaflet measures it.
      setTimeout(() => { try { map.invalidateSize(); } catch {} }, 0);
      setReady(true);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [lat, lng, label, popup]);

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

export default function StoreMapSection({ data, adminPreview = false }) {
  const cfg = normalizeStoreMap(data);
  const coords = resolveCoordinates(cfg);
  const directions = buildDirectionsUrl(cfg);
  const tel = telHref(cfg.phone);
  const whatsapp = buildStoreWhatsappUrl(cfg);
  const openNow = computeOpenNow(cfg.hours);

  // Nothing configured at all → render nothing on the storefront.
  if (!coords && !cfg.storeName && !cfg.address) return adminPreview ? (
    <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-2">
      <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
      <p className="text-xs font-semibold text-amber-800">Section vide : renseignez au minimum la position du magasin.</p>
    </div>
  ) : null;

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

      {/* OpenStreetMap via Leaflet — no Google iframe, ever */}
      {coords ? (
        <LeafletMap
          lat={coords.lat} lng={coords.lng}
          label={cfg.storeName || cfg.title}
          popup={popupHtml({ storeName: cfg.storeName, address: cfg.address, hours: cfg.hours, phone: cfg.phone, tel })}
        />
      ) : adminPreview ? (
        // Admin sees WHY there is no map; visitors just get the info card.
        <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs font-semibold text-amber-800">Position non configurée : la carte est masquée sur la boutique (latitude / longitude manquantes).</p>
        </div>
      ) : null}

      {/* Horizontal action bar — always ONE row, 50/50, never stacks on mobile.
          Both buttons share the site's red/rose primary style. */}
      {(directions || whatsapp) && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-4">
          {directions && (
            <a href={directions} target="_blank" rel="noopener noreferrer"
              className={`${ACTION_BTN} ${!whatsapp ? "col-span-2" : ""}`}>
              <MapPin className="w-4 h-4 shrink-0" />
              <span className="truncate">{cfg.buttonText}</span>
            </a>
          )}
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" dir="rtl"
              className={`${ACTION_BTN} ${!directions ? "col-span-2" : ""}`}>
              <WhatsAppIcon className="w-4 h-4 shrink-0" />
              <span className="truncate">{cfg.whatsappText}</span>
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
