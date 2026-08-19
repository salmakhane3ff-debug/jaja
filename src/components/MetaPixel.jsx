"use client";

/**
 * MetaPixel — loads fbevents.js, initialises every configured pixel once, and
 * emits PageView for the initial load AND for every Next.js client navigation.
 *
 * WHY IT IS SEPARATE FROM ScriptInjector: ScriptInjector receives a sanitised
 * integrations object, but Meta needs its own lifecycle (route-change PageView),
 * and keeping it here means the only prop it ever receives is
 * `{ enabled, pixelIds }` — a shape that structurally cannot carry the CAPI
 * access token.
 *
 * PAGEVIEW SEMANTICS: exactly one PageView per pixel per navigation.
 *   • initial load      → 1 (no duplicate from hydration: the effect keys on the
 *                            path, and the first run IS the initial PageView)
 *   • /a → /b           → 1 more
 *   • re-render of /b   → 0
 * `fbq('init')` is NOT allowed to auto-send PageView here, because the loader
 * would then race the router effect; PageView is always explicit.
 *
 * No reload, no router.refresh, no setTimeout.
 */

import Script from "next/script";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initMeta, metaTrack, newPageViewNonce, isMetaEnabled } from "@/lib/meta/browser";

export default function MetaPixel({ config }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastKeyRef = useRef(null);

  const enabled = Boolean(config?.enabled) && Array.isArray(config?.pixelIds) && config.pixelIds.length > 0;

  // Initialise as early as the client allows. The stub queues anything a page
  // component fires before fbevents.js finishes downloading.
  useEffect(() => {
    if (!enabled) return;
    initMeta(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // One PageView per navigation. The query string is part of the key so
  // /products?collection=A → ?collection=B counts as a real navigation.
  useEffect(() => {
    if (!enabled) return;
    if (!isMetaEnabled()) initMeta(config);

    const key = `${pathname}?${searchParams?.toString() ?? ""}`;
    if (lastKeyRef.current === key) return;   // re-render, not a navigation
    lastKeyRef.current = key;

    // A fresh nonce scopes this page view, so ViewContent/InitiateCheckout ids
    // are unique per navigation but stable across re-renders within it.
    newPageViewNonce();
    metaTrack("PageView");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pathname, searchParams]);

  if (!enabled) return null;

  return (
    <Script
      id="meta-pixel-loader"
      strategy="afterInteractive"
      src="https://connect.facebook.net/en_US/fbevents.js"
    />
  );
}
