"use client";

/**
 * TrackingCapture
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads tracking URL params on mount, handles attribution, stores to
 * cookie + localStorage, then fires POST to /api/tracking/click.
 *
 * URL params captured:
 *   click_id    — unique click ID from tracker (Voluum, RedTrack, DaoPush)
 *   source_id   — traffic source ID
 *   campaign_id — campaign ID
 *   sub_id      — sub-ID / publisher ID
 *   cpc         — cost per click (float)
 *   cpm         — cost per 1000 impressions (float)
 *
 * Attribution model (Last-Click):
 *   first_click_id — stored ONCE if not already set (first touch)
 *   last_click_id  — ALWAYS overwritten with the latest clickId (last touch)
 *
 * Checkout pages read `last_click_id` for conversion attribution.
 *
 * Anti-duplicate: only fires click API if clickId changed or not yet sent
 * (tracked in sessionStorage key `tc_sent_<clickId>`).
 *
 * Renders nothing — pure side-effect component.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const COOKIE_DAYS = 7;

// ── Cookie helpers ────────────────────────────────────────────────────────────
function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  const pair = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.split("=")[1]) : null;
}

// ── Connection type detection ─────────────────────────────────────────────────
function getConnectionType() {
  try {
    const conn = navigator?.connection || navigator?.mozConnection || navigator?.webkitConnection;
    if (!conn) return null;
    return conn.effectiveType || conn.type || null; // "4g", "3g", "wifi", etc.
  } catch {
    return null;
  }
}

export default function TrackingCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    try {
      const clickId    = searchParams.get("click_id");
      const sourceId   = searchParams.get("source_id");
      const campaignId = searchParams.get("campaign_id");
      const subId      = searchParams.get("sub_id");
      const cpc        = searchParams.get("cpc");
      const cpm        = searchParams.get("cpm");

      if (!clickId) return; // No click_id in URL — nothing to track

      // ── Skip if already sent for this clickId this session ─────────────────
      const sentKey = `tc_sent_${clickId}`;
      if (sessionStorage.getItem(sentKey)) return;

      // ── Attribution: first-click + last-click ──────────────────────────────
      // First-click: only store if not already set
      if (!getCookie("first_click_id") && !localStorage.getItem("first_click_id")) {
        setCookie("first_click_id", clickId, COOKIE_DAYS);
        localStorage.setItem("first_click_id", clickId);
      }

      // Last-click: ALWAYS overwrite (most recent wins)
      setCookie("last_click_id", clickId, COOKIE_DAYS);
      localStorage.setItem("last_click_id", clickId);

      // Legacy compat: also write click_id
      setCookie("click_id", clickId, COOKIE_DAYS);
      localStorage.setItem("click_id", clickId);

      // Store campaign metadata
      if (sourceId)   localStorage.setItem("source_id",   sourceId);
      if (campaignId) localStorage.setItem("campaign_id", campaignId);
      if (subId)      localStorage.setItem("sub_id",      subId);
      if (cpc)        localStorage.setItem("cpc",         cpc);
      if (cpm)        localStorage.setItem("cpm",         cpm);

      // ── Mark as sent in session ────────────────────────────────────────────
      sessionStorage.setItem(sentKey, "1");

      // ── Detect connection type ─────────────────────────────────────────────
      const connectionType = getConnectionType();

      // ── Fire click + landing_view events (non-blocking) ───────────────────
      const zoneId = searchParams.get("zone_id");

      const fireClick = () => {
        fetch("/api/tracking/click", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clickId,
            sourceId,
            campaignId,
            subId,
            zoneId:         zoneId         || undefined,
            cpc:            cpc ? parseFloat(cpc) : undefined,
            cpm:            cpm ? parseFloat(cpm) : undefined,
            connectionType,
          }),
        }).catch(() => {});

        // Also fire landing_view funnel event
        fetch("/api/tracking/event", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: "landing_view",
            clickId,
            sessionId: sessionStorage.getItem("session_id") || undefined,
          }),
        }).catch(() => {});
      };

      // Generate a session ID if not already present
      if (!sessionStorage.getItem("session_id")) {
        sessionStorage.setItem("session_id", `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      }

      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(fireClick, { timeout: 3000 });
      } else {
        setTimeout(fireClick, 0);
      }
    } catch {
      // Never crash the page for tracking errors
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
