"use client";

import { useLanguage } from "@/context/LanguageContext";

const LANGS = [
  { code: "ar", flag: "🇲🇦", label: "Switch to Arabic" },
  { code: "fr", flag: "🇫🇷", label: "Switch to French" },
];

export default function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="flex items-center gap-1 select-none">
      {LANGS.map(({ code, flag, label }) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          aria-label={label}
          title={label}
          suppressHydrationWarning
          className={`w-7 h-7 flex items-center justify-center rounded-md text-lg transition-all duration-150
            ${lang === code
              ? "ring-2 ring-orange-400 ring-offset-1 scale-110"
              : "opacity-50 hover:opacity-90 hover:scale-105"
            }`}
        >
          {flag}
        </button>
      ))}
    </div>
  );
}
