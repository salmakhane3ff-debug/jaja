/**
 * src/lib/tracking/clickId.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared client-side helper for resolving the visitor's tracked click ID
 * (cookie/localStorage), used by:
 *   - TrackingCapture.jsx — writes last_click_id / click_id on landing
 *   - FunnelTracker.jsx   — reads it to attach to funnel events
 *   - Checkout pages      — read it to attach to newly created orders
 *
 * Pure browser-storage utility — no React, no server dependency.
 * Must only be called client-side (relies on document.cookie / localStorage).
 * ─────────────────────────────────────────────────────────────────────────────
 */

function getCookie(name) {
  const pair = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.split("=")[1]) : null;
}

/**
 * Resolve the visitor's click ID using last-click attribution.
 * Checks localStorage first (survives cookie clearing), then the cookie.
 * Falls back to the legacy "click_id" key if "last_click_id" is unset.
 */
export function resolveClickId() {
  return (
    localStorage.getItem("last_click_id") || getCookie("last_click_id") ||
    localStorage.getItem("click_id")       || getCookie("click_id")      ||
    null
  );
}
