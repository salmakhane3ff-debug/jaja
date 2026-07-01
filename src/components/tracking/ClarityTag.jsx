"use client";

import { useEffect } from "react";
import { trackClarity } from "@/lib/trackClarity";

/**
 * Fires a single Microsoft Clarity custom tag once on mount, then renders
 * nothing. Used to co-locate a Clarity tag next to an existing on-mount funnel
 * event (e.g. beside <FunnelTracker event="checkout_start" />) without touching
 * the funnel component or risking rules-of-hooks in the host page.
 */
export default function ClarityTag({ tag, value }) {
  useEffect(() => {
    trackClarity(tag, value ?? "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
