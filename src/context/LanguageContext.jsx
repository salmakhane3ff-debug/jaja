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
  // Always start with DEFAULT_LANG so the first client render matches the server HTML.
  // After hydration completes, useEffect reads the stored preference and updates.
  const [lang, setLangState] = useState(DEFAULT_LANG);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const fromDom = document.documentElement.getAttribute("data-lang");
    if (fromDom && SUPPORTED_LANGS.includes(fromDom)) {
      setLangState(fromDom);
      setMounted(true);
      return;
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED_LANGS.includes(saved)) {
        setLangState(saved);
        setMounted(true);
        return;
      }
    } catch {}

    // No stored user preference — fetch the admin-configured store default
    fetch("/api/setting?type=language-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const adminDefault = data?.defaultLang;
        if (adminDefault && SUPPORTED_LANGS.includes(adminDefault)) {
          setLangState(adminDefault);
        }
      })
      .catch(() => {})
      .finally(() => setMounted(true));
  }, []);

  // Sync HTML attributes and persist whenever lang changes.
  // IMPORTANT: Never apply RTL on admin pages — the admin must always be LTR.
  // window.location.pathname is read at effect time (always current route).
  useEffect(() => {
    if (!mounted) return;
    const onAdmin = window.location.pathname.startsWith("/admin");
    const dir = (!onAdmin && lang === "ar") ? "rtl" : "ltr";
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
