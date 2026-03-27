"use client";

/**
 * AffiliateRefCapture
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs on EVERY page load (injected into root layout).
 *
 * Ref capture logic:
 *  1. Check URL for ?ref=<username>
 *     → If found: validate via /api/affiliate/ref/[username]
 *                 → save affiliateRef + affiliateId to localStorage
 *                 → save affiliate_ref cookie (7 days)
 *                 → track click (if page is trackable)
 *
 *  2. If no ref in URL:
 *     → Check localStorage.affiliateRef OR cookie affiliate_ref
 *     → If found: restore ?ref=<username> to URL via router.replace
 *                 → track click (if page is trackable)
 *
 * Click tracking rules (prevents overcounting):
 *  - Only tracked on "/" and "/product/*" pages
 *  - One click per page per browser session (sessionStorage dedup)
 *  - Minimum 10 seconds between any two tracked clicks (throttle)
 *
 * Renders nothing — purely a side-effect component.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function AffiliateRefCapture() {
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url        = new URL(window.location.href);
    const refFromUrl = url.searchParams.get("ref")?.trim() || null;

    if (refFromUrl) {
      // ── Ref found in URL: validate with backend ────────────────────────────
      fetch(`/api/affiliate/ref/${encodeURIComponent(refFromUrl)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data?.affiliateId) return;

          console.log(
            "[Affiliate] Ref captured →",
            data.username,
            "| affiliateId:",
            data.affiliateId
          );

          // Persist in localStorage
          try {
            localStorage.setItem("affiliateRef", data.username);
            localStorage.setItem("affiliateId",  data.affiliateId);
          } catch {}

          // Persist in cookie (7 days)
          try {
            document.cookie =
              `affiliate_ref=${encodeURIComponent(data.username)};` +
              `max-age=${7 * 24 * 60 * 60};path=/;SameSite=Lax`;
          } catch {}

          // Track the click (respects page filter + dedup + throttle)
          maybeTrackClick(data.affiliateId, pathname);
        })
        .catch(() => {});
    } else {
      // ── No ref in URL: check storage / cookie and restore ─────────────────
      const stored = (() => {
        try { return localStorage.getItem("affiliateRef"); } catch { return null; }
      })() || getCookieValue("affiliate_ref");

      if (stored) {
        // Re-inject ?ref= into the current URL if it's missing
        const currentUrl = new URL(window.location.href);
        if (!currentUrl.searchParams.has("ref")) {
          currentUrl.searchParams.set("ref", stored);
          router.replace(currentUrl.pathname + currentUrl.search);
        }

        // Track the page-view click (respects page filter + dedup + throttle)
        const storedId = (() => {
          try { return localStorage.getItem("affiliateId"); } catch { return null; }
        })();
        if (storedId) {
          maybeTrackClick(storedId, pathname);
        }
      }
    }
  // Re-run on every navigation so ref is always present
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}

// ── Click tracking helpers ────────────────────────────────────────────────────

/**
 * Only track clicks on "/" and "/product/*".
 * Applies sessionStorage dedup (one click per page per session) and
 * a 10-second global throttle to prevent burst overcounting.
 */
function maybeTrackClick(affiliateId, pathname) {
  try {
    // 1. Page filter — only home and product pages
    const isTrackable = pathname === "/" || pathname.startsWith("/product/");
    if (!isTrackable) return;

    // 2. Per-page dedup — one tracked click per page per session
    const dedupKey = `click_tracked_${pathname}`;
    if (sessionStorage.getItem(dedupKey)) return;

    // 3. Global throttle — minimum 10 s between any two clicks
    const lastTs = parseInt(sessionStorage.getItem("affiliate_click_last_ts") || "0", 10);
    if (Date.now() - lastTs < 10_000) return;

    // Mark as tracked before the async fetch to prevent race conditions
    sessionStorage.setItem(dedupKey, "true");
    sessionStorage.setItem("affiliate_click_last_ts", String(Date.now()));

    const page = window.location.href;
    console.log("[Affiliate] Click tracked:", pathname);

    fetch("/api/affiliate/track-click", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ affiliateId, page }),
    }).catch(() => {});
  } catch {
    // sessionStorage unavailable (private browsing edge case) — skip silently
  }
}

/** Read a cookie value by name */
function getCookieValue(name) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(^|;\\s*)" + name + "=([^;]*)")
  );
  return match ? decodeURIComponent(match[2]) : null;
}
