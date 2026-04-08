"use client";

/**
 * PreloaderWrapper — zero-flicker, navigation-aware preloader.
 *
 * Hydration-safe design:
 *   The children <div> is ALWAYS rendered — on server AND client, in every
 *   phase. Only its `style` prop changes. This eliminates every structural
 *   mismatch between server-rendered HTML and the client's initial render.
 *
 * Two loading pipelines:
 *   [A] Initial page load  — window.load + minDuration → revealing → done
 *   [B] SPA navigation     — pathname change triggers a fixed NAV_DURATION
 *                            timeout (window.load never fires on SPA nav).
 *                            useSearchParams() is intentionally NOT used:
 *                            it causes Next.js to run a server prerender pass
 *                            where usePathname() returns a different value,
 *                            producing a server/client hydration mismatch.
 *
 * All hooks are unconditional (Rules of Hooks).
 * No useLayoutEffect — avoids SSR warning and server/client hook-type mismatch.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Preloader from "./Preloader";
import { PRELOADER_DEFAULTS } from "@/lib/preloaderDefaults";

// ── Routes where the preloader never runs ────────────────────────────────────
// startsWith() covers every child segment automatically:
//   "/offer"  → /offer/summer-sale, /offer/any-slug …
//   "/pages"  → /pages/about-us   (builder-generated pages)
//   "/admin"  → all admin sub-routes
const DISABLED_ROUTES = [
  "/admin",
  "/checkout",
  "/landing",
  "/offer",
  "/pages",
  "/affiliate",
  "/login",
];

const CROSSFADE_MS = 500; // must match .pl-fadeout duration in globals.css
const NAV_DURATION = 500; // preloader duration for SPA navigations (ms)

export default function PreloaderWrapper({ children, config }) {
  const pathname = usePathname();

  const cfg         = { ...PRELOADER_DEFAULTS, ...config };
  const imgs        = (cfg.images ?? ["/logonc.svg"]).slice(0, 3);
  const minDuration = cfg.minDuration ?? 1200;
  const disabled    = DISABLED_ROUTES.some((r) => pathname?.startsWith(r));

  // ── All hooks run unconditionally (Rules of Hooks) ───────────────────────
  const [phase,    setPhase]    = useState("preload");
  const [imgIndex, setImgIndex] = useState(0);

  const triggered  = useRef(false); // StrictMode double-fire guard
  const isFirstNav = useRef(true);  // distinguishes mount from navigation
  const timers     = useRef({ reveal: null, done: null });

  // ── Shared timer helpers (captured by closure, refs are always current) ──
  function clearTimers() {
    clearTimeout(timers.current.reveal);
    clearTimeout(timers.current.done);
  }

  function startReveal(duration) {
    clearTimers();
    timers.current.reveal = setTimeout(() => {
      document.body.style.overflow = "";
      setPhase("revealing");
      timers.current.done = setTimeout(
        () => setPhase("done"),
        CROSSFADE_MS + 30,
      );
    }, duration);
  }

  // ── Effect A: initial page load (fires once after hydration) ─────────────
  useEffect(() => {
    if (disabled) return;

    setPhase("loading");
    document.body.style.overflow = "hidden";
    const start = Date.now();

    const triggerReveal = () => {
      if (triggered.current) return; // guard StrictMode double-invocation
      triggered.current = true;
      startReveal(Math.max(0, minDuration - (Date.now() - start)));
    };

    if (document.readyState === "complete") {
      triggerReveal();
    } else {
      window.addEventListener("load", triggerReveal, { once: true });
    }

    return () => {
      window.removeEventListener("load", triggerReveal);
      clearTimers();
      triggered.current = false;
      document.body.style.overflow = "";
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ↑ [] — this effect owns ONLY the initial load. Do NOT add deps.

  // ── Effect B: SPA navigation (pathname OR query params change) ───────────
  // window.load does not fire during client-side navigation.
  // We use a fixed timeout instead. Runs on EVERY route change after mount.
  useEffect(() => {
    // Skip the very first execution — Effect A owns the initial load.
    if (isFirstNav.current) {
      isFirstNav.current = false;
      return;
    }

    clearTimers();
    document.body.style.overflow = "";

    if (disabled) {
      // Disabled route (admin, checkout, landing pages…) — instant render.
      setPhase("done");
      return;
    }

    // Enabled route — show preloader for NAV_DURATION ms.
    setPhase("loading");
    document.body.style.overflow = "hidden";
    startReveal(NAV_DURATION);

    return () => {
      // User navigated again before NAV_DURATION elapsed — clean up so
      // the next navigation starts fresh without stale timers.
      clearTimers();
      document.body.style.overflow = "";
    };
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect C: image rotation ─────────────────────────────────────────────
  useEffect(() => {
    if (disabled || imgs.length <= 1) return;
    const id = setInterval(() => setImgIndex((i) => (i + 1) % imgs.length), 700);
    return () => clearInterval(id);
  }, [imgs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived flags ────────────────────────────────────────────────────────
  const isRevealing = !disabled && phase === "revealing";
  // isDone covers both "done" phase AND disabled routes.
  // Both produce style=undefined on the children div → same DOM structure →
  // React can reconcile without remounting on navigation. [invariant]
  const isDone = disabled || phase === "done";

  // ── Render ───────────────────────────────────────────────────────────────
  //
  // CRITICAL — children <div> is ALWAYS in the JSX, unconditionally.
  // Server and client ALWAYS agree on this element's presence.
  //
  // Why not conditional (the previous design):
  //   When `showChildren` was false on the server but true on the client
  //   (or vice versa) React would see a structural mismatch:
  //     server  → Fragment > [Preloader]
  //     client  → Fragment > [Preloader, div]
  //   This produced the "server rendered HTML didn't match the client" error.
  //
  // Current design — only the `style` prop changes, never the element itself:
  //   phase "preload" / "loading" → visibility:hidden  (in DOM, not painted)
  //   phase "revealing"           → opacity fades in
  //   phase "done" / disabled     → style=undefined    (fully visible)
  //
  return (
    <>
      {/* Preloader overlay — enabled routes only, removed once done */}
      {!disabled && !isDone && (
        <Preloader
          images={imgs}
          animation={cfg.animation}
          text={cfg.showText !== false ? cfg.text : ""}
          fading={isRevealing}
          imgIndex={imgIndex}
        />
      )}

      {/*
        Children wrapper — unconditional, always at the same tree position.
        Changing only style (never presence) means React never remounts the
        Next.js Router fiber during navigation → no "Rendered more hooks"
        error, no hydration mismatch, no flash.
      */}
      <div
        aria-hidden={isDone ? undefined : "true"}
        style={
          isDone
            ? undefined
            : {
                opacity:       isRevealing ? 1 : 0,
                visibility:    isRevealing ? "visible" : "hidden",
                transition:    isRevealing ? `opacity ${CROSSFADE_MS}ms ease` : "none",
                pointerEvents: "none",
                userSelect:    "none",
              }
        }
      >
        {children}
      </div>
    </>
  );
}
