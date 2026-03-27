"use client";

import { useState } from "react";
import { Languages, Globe, Save, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import ar from "@/locales/ar.json";
import fr from "@/locales/fr.json";

const LANG_META = {
  ar: { label: "العربية", dir: "rtl", flag: "🇲🇦" },
  fr: { label: "Français", dir: "ltr", flag: "🇫🇷" },
};

export default function AdminLanguagePage() {
  const [activeTab, setActiveTab] = useState("settings");
  const [editLang, setEditLang] = useState("ar");
  const [arTranslations, setArTranslations] = useState(ar);
  const [frTranslations, setFrTranslations] = useState(fr);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [saved, setSaved] = useState(false);

  const translations = editLang === "ar" ? arTranslations : frTranslations;
  const setTranslations = editLang === "ar" ? setArTranslations : setFrTranslations;

  // Group keys by prefix (nav_, product_, cart_, checkout_, etc.)
  const grouped = Object.entries(translations).reduce((acc, [key, value]) => {
    const group = key.includes("_") ? key.split("_")[0] : "general";
    if (!acc[group]) acc[group] = [];
    acc[group].push({ key, value });
    return acc;
  }, {});

  const groupLabels = {
    nav: "Navigation",
    product: "Products",
    cart: "Cart",
    checkout: "Checkout",
    currency: "Currency",
    footer: "Footer",
    language: "Language Names",
    general: "General",
  };

  const toggleGroup = (group) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const handleValueChange = (key, newValue) => {
    setTranslations((prev) => ({ ...prev, [key]: newValue }));
  };

  const handleSave = () => {
    // In a real app this would POST to an API endpoint.
    // For now we show a success indicator and log the updated JSON.
    console.log(`[Language Admin] Updated ${editLang}.json:`, translations);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    if (editLang === "ar") setArTranslations(ar);
    else setFrTranslations(fr);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Languages className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Language & Localization</h1>
          <p className="text-sm text-gray-500">Manage Arabic and French translations, currency, and RTL settings.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {["settings", "translations"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "settings" ? "Settings" : "Translation Editor"}
          </button>
        ))}
      </div>

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          {/* Language Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(LANG_META).map(([code, meta]) => (
              <div key={code} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{meta.flag}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{meta.label}</h3>
                    <span className="text-xs text-gray-500 uppercase tracking-wide">
                      {code} · {meta.dir.toUpperCase()}
                    </span>
                  </div>
                  {code === "ar" && (
                    <span className="ms-auto text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                      Default
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="flex justify-between">
                    <span>Direction</span>
                    <span className="font-medium text-gray-700">{meta.dir === "rtl" ? "Right-to-Left (RTL)" : "Left-to-Right (LTR)"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Currency</span>
                    <span className="font-medium text-gray-700">
                      {code === "ar" ? "درهم (MAD)" : "DH (MAD)"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Translation keys</span>
                    <span className="font-medium text-gray-700">
                      {code === "ar" ? Object.keys(ar).length : Object.keys(fr).length}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Currency Section */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Currency — Moroccan Dirham (MAD)</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Arabic display</p>
                <p className="text-lg font-semibold text-gray-900" dir="rtl">120 درهم</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">French display</p>
                <p className="text-lg font-semibold text-gray-900">120 DH</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Currency formatting is handled automatically by <code className="bg-gray-100 px-1 rounded">formatPrice(amount)</code> from{" "}
              <code className="bg-gray-100 px-1 rounded">useLanguage()</code>. No additional configuration needed.
            </p>
          </div>

          {/* Developer Guide */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h3 className="font-semibold text-blue-900 mb-3">Developer Guide</h3>
            <div className="space-y-2 text-sm text-blue-800">
              <p>Import the hook in any component:</p>
              <pre className="bg-white border border-blue-200 rounded-lg p-3 text-xs overflow-x-auto">{`import { useLanguage } from "@/context/LanguageContext";

const { t, formatPrice, lang, dir } = useLanguage();

// Translate a key
t("product_add_to_cart")   // → "أضف إلى السلة" (ar) or "Ajouter au panier" (fr)

// Format a price in MAD
formatPrice(120)            // → "120 درهم" (ar) or "120 DH" (fr)

// Check direction
dir === "rtl"               // → true when Arabic is active`}</pre>
              <p className="text-xs text-blue-700 mt-2">
                Translation keys are in <code className="bg-blue-100 px-1 rounded">src/locales/ar.json</code> and{" "}
                <code className="bg-blue-100 px-1 rounded">src/locales/fr.json</code>. Edit the JSON files directly or use the Translation Editor tab above.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Translation Editor Tab */}
      {activeTab === "translations" && (
        <div>
          {/* Language selector + actions */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex gap-2">
              {Object.entries(LANG_META).map(([code, meta]) => (
                <button
                  key={code}
                  onClick={() => setEditLang(code)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    editLang === code
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
                  }`}
                >
                  <span>{meta.flag}</span>
                  <span>{meta.label}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </button>
              <button
                onClick={handleSave}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                  saved
                    ? "bg-green-600 text-white"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                <Save className="w-4 h-4" />
                {saved ? "Saved!" : "Save Changes"}
              </button>
            </div>
          </div>

          {/* Translation groups */}
          <div className="space-y-2">
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <button
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 capitalize">
                      {groupLabels[group] || group}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {items.length} keys
                    </span>
                  </div>
                  {expandedGroups[group] ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {expandedGroups[group] && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {items.map(({ key, value }) => (
                      <div key={key} className="px-4 py-2 flex items-start gap-3">
                        <code className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded mt-1 min-w-[180px] shrink-0 break-all">
                          {key}
                        </code>
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => handleValueChange(key, e.target.value)}
                          dir={editLang === "ar" ? "rtl" : "ltr"}
                          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-gray-500 text-center">
            Changes here are in-memory only until persisted to the JSON files in{" "}
            <code className="bg-gray-100 px-1 rounded">src/locales/</code>.
          </p>
        </div>
      )}
    </div>
  );
}
