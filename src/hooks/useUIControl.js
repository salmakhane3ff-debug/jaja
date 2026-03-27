/**
 * useUIControl — re-export from context for clean import paths.
 *
 * Usage:
 *   import { useUIControl } from "@/hooks/useUIControl";
 *   const ui = useUIControl();
 *   if (!ui.showWishlistButton) return null;
 */
export { useUIControl, UI_DEFAULTS } from "@/context/UIControlContext";
