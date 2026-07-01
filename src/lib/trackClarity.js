/**
 * src/lib/trackClarity.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tiny fail-safe wrapper around Microsoft Clarity custom tags.
 *
 * Clarity is loaded globally in production by <ClarityScript /> (unchanged).
 * This helper only *sets* a custom tag on the already-loaded instance:
 *   window.clarity("set", key, String(value))
 *
 * Safe to call anywhere:
 *   - no-op during SSR (window undefined)
 *   - no-op when Clarity isn't loaded (dev/preview, or NEXT_PUBLIC_CLARITY_ID unset)
 *   - never throws → never blocks a user action
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function trackClarity(key, value = "1") {
  try {
    if (typeof window !== "undefined" && typeof window.clarity === "function") {
      window.clarity("set", key, String(value));
    }
  } catch {
    /* analytics must never break the app */
  }
}
