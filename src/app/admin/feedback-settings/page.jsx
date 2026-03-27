"use client";

import { useState, useEffect } from "react";
import { Save, Star, RotateCcw } from "lucide-react";

const DEFAULTS = {
  // Product page
  enableProductFeedback: true,
  showStarsUnderTitle: true,
  showFeedbackCount: true,
  starClickAction: "scrollToFeedback",
  formDisplay: "modal",
  // Global page
  enableGlobalFeedback: true,
  // Homepage
  showOnHomepage: false,
  layout: "grid",
  maxItems: 6,
  position: "bottom",
};

export default function FeedbackSettingsPage() {
  const [form, setForm] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState("");

  useEffect(() => {
    fetch("/api/setting?type=feedback-settings")
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          setForm((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {});
  }, []);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/setting?type=feedback-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("فشل الحفظ، يرجى المحاولة مجدداً");
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({ k, label, hint }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-50">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={() => set(k, !form[k])}
        className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${form[k] ? "bg-blue-600" : "bg-gray-200"}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form[k] ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );

  const Radio = ({ k, value, label }) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        name={k}
        value={value}
        checked={form[k] === value}
        onChange={() => set(k, value)}
        className="accent-blue-600"
      />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
              <Star size={20} className="text-yellow-600 fill-yellow-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">إعدادات التقييمات</h1>
              <p className="text-sm text-gray-500">تحكم في عرض وسلوك نظام التقييمات</p>
            </div>
          </div>
          <button
            onClick={() => { setForm(DEFAULTS); }}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RotateCcw size={13} /> إعادة ضبط
          </button>
        </div>

        {/* ─── Product Page ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
          <h2 className="text-sm font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">
            📦 صفحة المنتج
          </h2>

          <Toggle k="enableProductFeedback" label="تفعيل التقييمات على صفحة المنتج" />
          <Toggle k="showStarsUnderTitle"   label="عرض النجوم تحت عنوان المنتج" />
          <Toggle k="showFeedbackCount"     label="عرض عدد التقييمات" />

          <div className="py-3 border-b border-gray-50">
            <p className="text-sm font-medium text-gray-800 mb-2">سلوك النقر على النجوم</p>
            <div className="flex flex-col gap-2 mr-2">
              <Radio k="starClickAction" value="scrollToFeedback"  label="التمرير إلى قسم التقييمات" />
              <Radio k="starClickAction" value="goToFeedbackPage"  label="الانتقال إلى صفحة /feedback" />
              <Radio k="starClickAction" value="disabled"          label="بدون إجراء (معطّل)" />
            </div>
          </div>

          <div className="py-3">
            <p className="text-sm font-medium text-gray-800 mb-2">طريقة عرض النموذج</p>
            <div className="flex gap-6 mr-2">
              <Radio k="formDisplay" value="modal"  label="نافذة منبثقة (Modal)" />
              <Radio k="formDisplay" value="inline" label="مضمّن في الصفحة (Inline)" />
            </div>
          </div>
        </div>

        {/* ─── Homepage ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
          <h2 className="text-sm font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">
            🏠 الصفحة الرئيسية
          </h2>

          <Toggle
            k="showOnHomepage"
            label="عرض قسم التقييمات في الصفحة الرئيسية"
            hint="يظهر القسم في أسفل الصفحة الرئيسية"
          />

          <div className="py-3 border-b border-gray-50">
            <p className="text-sm font-medium text-gray-800 mb-2">طريقة العرض</p>
            <div className="flex flex-col gap-2 mr-2">
              <Radio k="layout" value="grid"    label="شبكة (Grid)" />
              <Radio k="layout" value="slider"  label="سلايدر أفقي (Slider)" />
              <Radio k="layout" value="stacked" label="مكدّس عمودي (Stacked)" />
            </div>
          </div>

          <div className="py-3">
            <label className="text-sm font-medium text-gray-800 block mb-2">
              الحد الأقصى للتقييمات المعروضة
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={form.maxItems}
              onChange={(e) => set("maxItems", parseInt(e.target.value) || 6)}
              className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {/* ─── Global Page ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <h2 className="text-sm font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">
            ⭐ صفحة التقييمات (/feedback)
          </h2>
          <Toggle k="enableGlobalFeedback" label="تفعيل صفحة التقييمات العامة" />
        </div>

        {/* Save */}
        {error && (
          <p className="text-sm text-red-600 mb-3 text-center">{error}</p>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm transition-all ${
            saved
              ? "bg-green-500 text-white"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          } disabled:opacity-60`}
        >
          <Save size={16} />
          {saving ? "جارٍ الحفظ…" : saved ? "✓ تم الحفظ" : "حفظ الإعدادات"}
        </button>
      </div>
    </div>
  );
}
