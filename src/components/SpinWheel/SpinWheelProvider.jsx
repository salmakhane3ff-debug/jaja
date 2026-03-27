"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import FreeProductBanner from "./FreeProductBanner";

const SpinWheelModal = dynamic(() => import("./SpinWheelModal"), { ssr: false });

// ── Session ID (persisted in sessionStorage) ───────────────────────────────────
function getSessionId() {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem("spinSessionId");
  if (!id) {
    id = `spin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem("spinSessionId", id);
  }
  return id;
}

// ── Device detection ──────────────────────────────────────────────────────────
function isMobile() {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= 768;
}

// ── Page type detection ───────────────────────────────────────────────────────
function getPageType(pathname) {
  if (!pathname || pathname === "/") return "homepage";
  if (pathname.startsWith("/products") || pathname.startsWith("/product")) return "product";
  if (pathname.startsWith("/cart"))     return "cart";
  if (pathname.startsWith("/checkout")) return "checkout";
  return "other";
}

// ── Main provider ─────────────────────────────────────────────────────────────
export default function SpinWheelProvider() {
  const pathname    = usePathname();
  const [config, setConfig] = useState(null);
  const [open,   setOpen]   = useState(false);
  const triggered            = useRef(false);
  const sessionId            = useRef("");

  // Load config once on mount
  useEffect(() => {
    fetch("/api/spin-wheel-config")
      .then((r) => r.json())
      .then((cfg) => {
        if (!cfg.isEnabled) return;
        setConfig(cfg);
      })
      .catch(() => {});
  }, []);

  // Determine if we should show on this page / device
  const shouldShow = (cfg) => {
    if (!cfg?.isEnabled) return false;
    // Already spun this session
    if (sessionStorage.getItem("spinDone")) return false;

    const device   = isMobile() ? "mobile" : "desktop";
    const pageType = getPageType(pathname);

    // Device check
    if (cfg.deviceTarget !== "both" && cfg.deviceTarget !== device) return false;
    // Page check
    if (cfg.pageTarget !== "all" && cfg.pageTarget !== pageType) return false;

    return true;
  };

  const show = (cfg) => {
    if (triggered.current) return;
    triggered.current = true;
    sessionId.current = getSessionId();

    // Track spin_view
    fetch("/api/spin-wheel-spin", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ sessionId: sessionId.current, eventType: "spin_view" }),
    }).catch(() => {});

    setOpen(true);
  };

  // Set up trigger when config is ready
  useEffect(() => {
    if (!config) return;
    if (!shouldShow(config)) return;

    const { triggerType, triggerValue } = config;

    let cleanup = () => {};

    if (triggerType === "seconds") {
      const timer = setTimeout(() => show(config), (triggerValue || 10) * 1000);
      cleanup = () => clearTimeout(timer);

    } else if (triggerType === "scroll") {
      const handler = () => {
        const pct = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
        if (pct >= (triggerValue || 30)) show(config);
      };
      window.addEventListener("scroll", handler, { passive: true });
      cleanup = () => window.removeEventListener("scroll", handler);

    } else if (triggerType === "exit_intent") {
      const handler = (e) => {
        if (e.clientY <= 0) show(config);
      };
      document.addEventListener("mouseleave", handler);
      cleanup = () => document.removeEventListener("mouseleave", handler);

    } else if (triggerType === "add_to_cart") {
      const handler = () => show(config);
      window.addEventListener("cartUpdated", handler);
      cleanup = () => window.removeEventListener("cartUpdated", handler);
    }

    return cleanup;
  }, [config, pathname]);

  const handleWin = (winner) => {
    sessionStorage.setItem("spinDone", "1");
    if (winner.rewardType === "product" && winner.productId) {
      const reward = {
        productId:    winner.productId,
        minCartValue: winner.minCartValue,
        label:        winner.label,
      };
      localStorage.setItem("spinFreeProduct", JSON.stringify(reward));
      window.dispatchEvent(new Event("spinRewardSet"));
    }
  };

  const handleClose = () => {
    sessionStorage.setItem("spinDone", "1");
    setOpen(false);
  };

  return (
    <>
      {open && config && (
        <SpinWheelModal
          config={config}
          sessionId={sessionId.current}
          onWin={handleWin}
          onClose={handleClose}
        />
      )}
      <FreeProductBanner />
    </>
  );
}
