"use client";

/**
 * SettingsContext
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches all commonly needed settings in ONE parallel batch on mount.
 * Every component that needs settings reads from context — zero duplicate
 * network requests no matter how many components use the same setting.
 *
 * Replaces individual fetch("/api/setting?type=...") calls scattered across:
 *   - useDiscountRules hook
 *   - ConversionBadges component
 *   - product.jsx (feedback-settings, conversion-settings)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createContext, useContext, useEffect, useState, useCallback } from "react";

const SETTING_TYPES = [
  "discount_rules",
  "conversion-settings",
  "feedback-settings",
  "store",
];

const SettingsContext = createContext({
  data:    {},  // { [type]: value }
  loaded:  {},  // { [type]: boolean }
  reload:  () => {},
});

export function SettingsProvider({ children }) {
  const [data,   setData]   = useState({});
  const [loaded, setLoaded] = useState({});

  const fetchAll = useCallback(() => {
    Promise.all(
      SETTING_TYPES.map((type) =>
        fetch(`/api/setting?type=${type}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
          .then((value) => ({ type, value }))
      )
    ).then((results) => {
      const dataMap   = {};
      const loadedMap = {};
      results.forEach(({ type, value }) => {
        dataMap[type]   = value;
        loadedMap[type] = true;
      });
      setData(dataMap);
      setLoaded(loadedMap);
    });
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <SettingsContext.Provider value={{ data, loaded, reload: fetchAll }}>
      {children}
    </SettingsContext.Provider>
  );
}

/** Access a specific setting type from the context. */
export function useSetting(type) {
  const { data, loaded } = useContext(SettingsContext);
  return { data: data[type] ?? null, loaded: !!loaded[type] };
}

/** Access the full context (for advanced use). */
export function useSettings() {
  return useContext(SettingsContext);
}
