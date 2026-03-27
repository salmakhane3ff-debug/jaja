"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import ar from "@/locales/ar.json";
import fr from "@/locales/fr.json";

const translations = { ar, fr };

const SUPPORTED_LANGS = ["ar", "fr"];
const DEFAULT_LANG = "ar";
const STORAGE_KEY = "store_lang";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  /**
   * Lazy initializer — runs once per render environment:
   *   Server: window is undefined → return DEFAULT_LANG (matches the HTML shell)
   *   Client: the blocking inline script in <head> has already written data-lang
   *           onto <html>, so we read the correct language synchronously here.
   *           This means the very first client render already uses "fr" (or "ar"),
   *           so React never commits a wrong-language frame to the DOM.
   */
  const [lang, setLangState] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_LANG;
    const fromDom = document.documentElement.getAttribute("data-lang");
    if (fromDom && SUPPORTED_LANGS.includes(fromDom)) return fromDom;
    // Fallback: read localStorage directly (handles missing inline script)
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
    } catch {}
    return DEFAULT_LANG;
  });

  // mounted: false on server, true immediately after first client render.
  // useEffect (not layout) is fine here — we only need it for downstream
  // consumers that want to know "are we on the client yet".
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Sync HTML attributes and persist whenever lang changes
  useEffect(() => {
    if (!mounted) return;
    const dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.documentElement.setAttribute("data-lang", lang);
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang, mounted]);

  const setLang = useCallback((newLang) => {
    if (SUPPORTED_LANGS.includes(newLang)) {
      setLangState(newLang);
    }
  }, []);

  /**
   * Translate a key. Falls back to the key itself if not found.
   * Usage: t("add_to_cart")  →  "أضف إلى السلة" (ar) or "Ajouter au panier" (fr)
   */
  const t = useCallback(
    (key) => translations[lang]?.[key] ?? translations[DEFAULT_LANG]?.[key] ?? key,
    [lang]
  );

  /**
   * Format a price in Moroccan Dirham.
   * Arabic → "120 درهم"   French → "120 DH"
   */
  const formatPrice = useCallback(
    (amount) => {
      const num = Number(amount) ?? 0;
      const formatted = Number.isInteger(num) ? num : num.toFixed(2);
      if (lang === "ar") return `${formatted} درهم`;
      return `${formatted} DH`;
    },
    [lang]
  );

  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, dir, formatPrice, mounted }}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * Hook to access the language context.
 * Safe to call outside the provider — returns sensible Arabic defaults.
 */
export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      lang: DEFAULT_LANG,
      dir: "rtl",
      t: (key) => translations[DEFAULT_LANG]?.[key] ?? key,
      formatPrice: (amount) => `${Number(amount) ?? 0} درهم`,
      setLang: () => {},
      mounted: false,
    };
  }
  return ctx;
}
