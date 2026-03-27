"use client";

/**
 * FunnelTracker
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop this component anywhere in a page tree to fire a one-shot funnel event
 * on mount. It renders nothing.
 *
 * Usage:
 *   <FunnelTracker event="checkout_start" />
 *   <FunnelTracker event="payment_selected" metadata={{ method: "cod" }} />
 *
 * Props:
 *   event     — one of: landing_view | product_click | add_to_cart
 *                        checkout_start | payment_selected | conversion
 *   productId — optional
 *   orderId   — optional
 *   metadata  — optional JSON object
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from "react";

// ── Helpers ───────────────────────────────────────────────────────────────────
function getCookie(name) {
  const pair = document.cookie.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.split("=")[1]) : null;
}

function resolveClickId() {
  return (
    localStorage.getItem("last_click_id") || getCookie("last_click_id") ||
    localStorage.getItem("click_id")       || getCookie("click_id")      ||
    null
  );
}

export function fireFunnelEvent({ event, productId, orderId, metadata } = {}) {
  if (!event) return;
  try {
    const clickId   = resolveClickId();
    const sessionId = sessionStorage.getItem("session_id") || undefined;
    const fireIt = () => {
      fetch("/api/tracking/event", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: event,
          clickId,
          sessionId,
          productId: productId || undefined,
          orderId:   orderId   || undefined,
          metadata:  metadata  || undefined,
        }),
      }).catch(() => {});
    };
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(fireIt, { timeout: 2000 });
    } else {
      setTimeout(fireIt, 0);
    }
  } catch { /* never crash */ }
}

export default function FunnelTracker({ event, productId, orderId, metadata }) {
  useEffect(() => {
    fireFunnelEvent({ event, productId, orderId, metadata });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
