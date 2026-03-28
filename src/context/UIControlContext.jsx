"use client";

/**
 * UIControlContext
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches all UI control settings from /api/ui-control once on mount.
 * Provides a flat settings object to the entire app via context.
 * Falls back to safe defaults while loading or on error.
 *
 * Usage:
 *   const ui = useUIControl();
 *   if (!ui.showWishlistButton) return null;
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { UI_DEFAULTS } from "@/lib/ui-defaults";

export { UI_DEFAULTS };

const UIControlContext = createContext({
  ...UI_DEFAULTS,
  _loaded: false,
  reload:  () => {},
});

export function UIControlProvider({ children }) {
  const [settings, setSettings] = useState({ ...UI_DEFAULTS, _loaded: false });

  const reload = useCallback(() => {
    fetch("/api/ui-control")
      .then((r) => r.json())
      .then((data) => setSettings({ ...UI_DEFAULTS, ...data, _loaded: true }))
      .catch(() => setSettings((s) => ({ ...s, _loaded: true })));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <UIControlContext.Provider value={{ ...settings, reload }}>
      {children}
    </UIControlContext.Provider>
  );
}

/** Hook — use anywhere in the app */
export const useUIControl = () => useContext(UIControlContext);
