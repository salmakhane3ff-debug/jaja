"use client";

import { useState, useEffect } from "react";

/**
 * MapSection
 * ──────────────────────────────────────────────────────────────────────────
 * Renders the Google Maps iframe on the homepage based on admin settings.
 *
 * Props:
 *   slot  "after_hero" | "after_products" | "before_footer"
 *         Only renders when settings.position === slot.
 */
export default function MapSection({ slot }) {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    fetch("/api/setting?type=map-settings")
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) setSettings(data);
      })
      .catch(() => {});
  }, []);

  // Hide until loaded, or if disabled / wrong slot / no URL
  if (!settings) return null;
  if (!settings.isEnabled) return null;
  if (!settings.mapUrl || !settings.mapUrl.trim()) return null;
  if (settings.position !== slot) return null;

  return (
    <div className="w-full overflow-hidden">
      <iframe
        src={settings.mapUrl.trim()}
        width={settings.width || "100%"}
        height={settings.height || "420px"}
        style={{
          border: 0,
          display: "block",
          width: settings.width || "100%",
          height: settings.height || "420px",
        }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title="Store Location Map"
      />
    </div>
  );
}
