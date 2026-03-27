"use client";

/**
 * _ProductForm.jsx
 * Shared form used by both /admin/products/new and /admin/products/[id].
 * Props:
 *   initial     – initial field values (or empty defaults)
 *   onSubmit    – async (fields) => void — called with the form payload
 *   loading     – bool
 *   submitLabel – string ("إنشاء" | "حفظ التعديلات")
 *
 * New sections (non-breaking additions):
 *   🔹 Redirect Behavior  — redirectMode + redirectUrl
 *   🔹 Payment Methods    — allowCOD + allowPrepaid (at least one required)
 */

import { useState } from "react";
import {
  Plus, X, Loader2, ImageIcon, Tag,
  ExternalLink, CreditCard, Package, AlertTriangle,
} from "lucide-react";
import SectionBuilder from "@/components/admin/SectionBuilder";

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, required, children, hint, error }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {!error && hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, sublabel, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`w-full flex items-center justify-between gap-4 px-4 py-3.5 rounded-xl border-2 transition-all duration-150
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
        ${checked
          ? "border-gray-900 bg-gray-900"
          : "border-gray-100 bg-white hover:border-gray-200"
        }`}
    >
      <div className="text-right">
        <p className={`text-sm font-bold ${checked ? "text-white" : "text-gray-900"}`}>{label}</p>
        {sublabel && (
          <p className={`text-xs mt-0.5 ${checked ? "text-gray-300" : "text-gray-400"}`}>{sublabel}</p>
        )}
      </div>

      {/* Toggle pill */}
      <div
        className={`relative shrink-0 w-12 h-6 rounded-full transition-colors duration-200
          ${checked ? "bg-white/30" : "bg-gray-200"}`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full shadow-sm transition-transform duration-200
            ${checked ? "translate-x-6 bg-white" : "translate-x-0.5 bg-gray-400"}`}
        />
      </div>
    </button>
  );
}

// ── Image URL list editor ─────────────────────────────────────────────────────

function ImageEditor({ images, onChange }) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const url = draft.trim();
    if (!url) return;
    onChange([...images, url]);
    setDraft("");
  };

  const remove = (i) => onChange(images.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="https://example.com/image.jpg"
          className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-gray-400 bg-gray-50"
        />
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 px-3 py-2 bg-gray-900 text-white text-xs rounded-xl hover:bg-gray-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          إضافة
        </button>
      </div>

      {images.length > 0 && (
        <div className="space-y-1.5">
          {images.map((url, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 group">
              <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 shrink-0 bg-white">
                <img
                  src={url}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    e.currentTarget.nextSibling.style.display = "flex";
                  }}
                />
                <div className="w-full h-full hidden items-center justify-center" style={{ display: "none" }}>
                  <ImageIcon className="w-4 h-4 text-gray-300" />
                </div>
              </div>
              <span className="flex-1 text-xs text-gray-500 truncate">{url}</span>
              <button type="button" onClick={() => remove(i)} className="text-gray-300 hover:text-red-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Variants editor ───────────────────────────────────────────────────────────

function VariantsEditor({ variants, onChange }) {
  const [draftName,    setDraftName]    = useState("");
  const [draftOptions, setDraftOptions] = useState("");

  const add = () => {
    const name    = draftName.trim();
    const options = draftOptions.split(",").map((o) => o.trim()).filter(Boolean);
    if (!name || options.length === 0) return;
    onChange([...variants, { name, options }]);
    setDraftName("");
    setDraftOptions("");
  };

  const remove = (i) => onChange(variants.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2">
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="الاسم (مثال: اللون)"
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-gray-400 bg-gray-50"
        />
        <input
          type="text"
          value={draftOptions}
          onChange={(e) => setDraftOptions(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="الخيارات مفصولة بفاصلة (مثال: أحمر, أزرق)"
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-gray-400 bg-gray-50"
        />
        <button
          type="button"
          onClick={add}
          className="flex items-center justify-center gap-1 px-3 py-2 bg-gray-900 text-white text-xs rounded-xl hover:bg-gray-700 transition-colors whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          إضافة
        </button>
      </div>

      {variants.length > 0 && (
        <div className="space-y-2">
          {variants.map((v, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
              <Tag className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-gray-700">{v.name}: </span>
                <span className="text-xs text-gray-500">{v.options.join(", ")}</span>
              </div>
              <button type="button" onClick={() => remove(i)} className="text-gray-300 hover:text-red-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function FormSection({ title, icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60 flex items-center gap-2">
        {icon && <span className="text-base">{icon}</span>}
        <h3 className="text-sm font-bold text-gray-700">{title}</h3>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

const EMPTY = {
  title:            "",
  slug:             "",
  shortDescription: "",
  description:      "",
  regularPrice:     "",
  salePrice:        "",
  stockQuantity:    "",
  stockStatus:      "In Stock",
  sku:              "",
  status:           "Active",
  images:           [],
  variants:         [],
  sections:         [],
  // New fields
  redirectMode:     "default",
  redirectUrl:      "",
  allowCOD:         true,
  allowPrepaid:     true,
};

export default function ProductForm({ initial = {}, onSubmit, loading, submitLabel = "حفظ" }) {
  const merged = {
    ...EMPTY,
    ...initial,
    regularPrice: initial.regularPrice === 0 || initial.regularPrice == null ? "" : initial.regularPrice,
    // Normalise new boolean fields (API may return them as booleans already)
    allowCOD:     initial.allowCOD     === false ? false : true,
    allowPrepaid: initial.allowPrepaid === false ? false : true,
    redirectMode: initial.redirectMode || "default",
    redirectUrl:  initial.redirectUrl  || "",
  };

  const [fields,   setFields]   = useState(merged);
  const [images,   setImages]   = useState(Array.isArray(merged.images)   ? merged.images   : []);
  const [variants, setVariants] = useState(Array.isArray(merged.variants) ? merged.variants : []);
  const [sections, setSections] = useState(() => {
    const raw = merged.sections;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return []; } }
    return [];
  });
  const [errors,   setErrors]   = useState({});

  const set = (k, v) => {
    setFields((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    const errs = {};

    if (!fields.title.trim()) errs.title = "العنوان مطلوب";

    if (fields.regularPrice !== "") {
      const parsed = parseFloat(fields.regularPrice);
      if (isNaN(parsed) || parsed < 0) errs.regularPrice = "يجب أن يكون السعر رقماً موجباً";
    }

    // Redirect URL required when mode = "landing"
    if (fields.redirectMode === "landing" && !fields.redirectUrl.trim()) {
      errs.redirectUrl = "رابط صفحة الهبوط مطلوب عند اختيار إعادة التوجيه";
    }

    // At least one payment method must remain enabled
    if (!fields.allowCOD && !fields.allowPrepaid) {
      errs.payment = "يجب تفعيل طريقة دفع واحدة على الأقل";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const parsed = parseFloat(fields.regularPrice);
    onSubmit({
      ...fields,
      images,
      variants,
      sections,
      regularPrice:  fields.regularPrice !== "" && !isNaN(parsed) ? parsed : null,
      salePrice:     fields.salePrice     === "" ? null : parseFloat(fields.salePrice),
      stockQuantity: fields.stockQuantity === "" ? null : parseInt(fields.stockQuantity, 10),
      // Ensure booleans are sent as actual booleans
      allowCOD:      Boolean(fields.allowCOD),
      allowPrepaid:  Boolean(fields.allowPrepaid),
      redirectUrl:   fields.redirectMode === "landing" ? fields.redirectUrl.trim() : null,
    });
  };

  const bothPaymentOff = !fields.allowCOD && !fields.allowPrepaid;

  // ── DEBUG (remove after confirming fields load correctly) ──────────────────
  console.log("FORM VALUES:", fields);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">

      {/* DEBUG — shows live field values; remove once confirmed working */}
      <div className="text-red-500 text-xs break-all bg-red-50 border border-red-200 rounded-xl p-3 font-mono">
        DEBUG: {JSON.stringify(fields)}
      </div>

      {/* ── Basic info ── */}
      <FormSection title="المعلومات الأساسية">
        <Field label="العنوان" required error={errors.title}>
          <input
            type="text"
            value={fields.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="اسم المنتج"
            className={`w-full text-sm border rounded-xl px-3 py-2.5 focus:outline-none bg-gray-50 ${
              errors.title ? "border-red-400 focus:border-red-400" : "border-gray-200 focus:border-gray-400"
            }`}
          />
        </Field>

        <Field label="Slug" hint="يُستخدم في عنوان URL للمنتج (اختياري)">
          <input
            type="text"
            value={fields.slug}
            onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            placeholder="my-product-name"
            dir="ltr"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-gray-400 bg-gray-50 font-mono"
          />
        </Field>

        <Field label="وصف قصير">
          <textarea
            rows={2}
            value={fields.shortDescription}
            onChange={(e) => set("shortDescription", e.target.value)}
            placeholder="ملخص المنتج (يظهر في بطاقة المنتج)"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-gray-400 bg-gray-50 resize-none"
          />
        </Field>

        <Field label="الوصف الكامل (legacy HTML)" hint="This is shown as a fallback when no sections are defined below.">
          <textarea
            rows={3}
            value={fields.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="الوصف الكامل للمنتج (يدعم HTML)"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-gray-400 bg-gray-50 resize-y"
          />
        </Field>
      </FormSection>

      {/* ── Page Builder Sections ── */}
      <FormSection title="Page Builder — Sections" icon="🧩">
        <p className="text-xs text-gray-400 -mt-2">
          Build the product page content with rich sections: text, images, videos, galleries, FAQs and spacers.
          Sections appear below the product info on the product page. If no sections are added, the legacy description is shown.
        </p>
        <SectionBuilder sections={sections} onChange={setSections} />
      </FormSection>

      {/* ── Pricing ── */}
      <FormSection title="السعر والمخزون">
        <div className="grid grid-cols-2 gap-4">
          <Field label="السعر الأصلي (MAD)" hint="اختياري — يُستخدم لعرض الخصم" error={errors.regularPrice}>
            <input
              type="number" min="0" step="0.01"
              value={fields.regularPrice ?? ""}
              onChange={(e) => set("regularPrice", e.target.value)}
              placeholder="اتركه فارغاً إن لم يكن هناك خصم"
              className={`w-full text-sm border rounded-xl px-3 py-2.5 focus:outline-none bg-gray-50 ${
                errors.regularPrice ? "border-red-400 focus:border-red-400" : "border-gray-200 focus:border-gray-400"
              }`}
            />
          </Field>

          <Field label="سعر التخفيض (MAD)" hint="اتركه فارغاً إن لم يكن هناك خصم">
            <input
              type="number" min="0" step="0.01"
              value={fields.salePrice}
              onChange={(e) => set("salePrice", e.target.value)}
              placeholder="0.00"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-gray-400 bg-gray-50"
            />
          </Field>

          <Field label="الكمية في المخزون">
            <input
              type="number" min="0"
              value={fields.stockQuantity}
              onChange={(e) => set("stockQuantity", e.target.value)}
              placeholder="0"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-gray-400 bg-gray-50"
            />
          </Field>

          <Field label="حالة المخزون">
            <select
              value={fields.stockStatus}
              onChange={(e) => set("stockStatus", e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-gray-400 bg-gray-50"
            >
              <option value="In Stock">متوفر</option>
              <option value="Out of Stock">غير متوفر</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="SKU">
            <input
              type="text"
              value={fields.sku}
              onChange={(e) => set("sku", e.target.value)}
              placeholder="SKU-001"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-gray-400 bg-gray-50"
            />
          </Field>

          <Field label="الحالة">
            <select
              value={fields.status}
              onChange={(e) => set("status", e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-gray-400 bg-gray-50"
            >
              <option value="Active">نشط</option>
              <option value="Inactive">غير نشط</option>
            </select>
          </Field>
        </div>
      </FormSection>

      {/* ── Images ── */}
      <FormSection title="الصور">
        <ImageEditor images={images} onChange={setImages} />
      </FormSection>

      {/* ── Variants ── */}
      <FormSection title="الخيارات (Variants)">
        <p className="text-xs text-gray-400 -mt-2">أضف مجموعات خيارات مثل: اللون، المقاس</p>
        <VariantsEditor variants={variants} onChange={setVariants} />
      </FormSection>

      {/* ── Redirect Behavior (NEW) ── */}
      <FormSection title="سلوك التوجيه" icon="🔀">
        <p className="text-xs text-gray-400 -mt-2">
          تحكم في إلى أين يُوجَّه الزائر عند الضغط على المنتج
        </p>

        {/* Radio options */}
        <div className="space-y-2">
          {/* Default */}
          <button
            type="button"
            onClick={() => set("redirectMode", "default")}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-right transition-all duration-150
              ${fields.redirectMode === "default"
                ? "border-gray-900 bg-gray-900"
                : "border-gray-100 bg-white hover:border-gray-200"}`}
          >
            {/* Radio circle */}
            <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
              ${fields.redirectMode === "default" ? "border-white" : "border-gray-300"}`}>
              {fields.redirectMode === "default" && (
                <div className="w-2.5 h-2.5 rounded-full bg-white" />
              )}
            </div>
            <div className="flex-1">
              <p className={`text-sm font-bold ${fields.redirectMode === "default" ? "text-white" : "text-gray-900"}`}>
                صفحة المنتج العادية
              </p>
              <p className={`text-xs mt-0.5 ${fields.redirectMode === "default" ? "text-gray-300" : "text-gray-400"}`}>
                المسار الافتراضي — صفحة المنتج أو الدفع
              </p>
            </div>
            <Package className={`shrink-0 w-5 h-5 ${fields.redirectMode === "default" ? "text-gray-300" : "text-gray-300"}`} />
          </button>

          {/* Landing */}
          <button
            type="button"
            onClick={() => set("redirectMode", "landing")}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-right transition-all duration-150
              ${fields.redirectMode === "landing"
                ? "border-amber-500 bg-amber-500"
                : "border-gray-100 bg-white hover:border-gray-200"}`}
          >
            <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
              ${fields.redirectMode === "landing" ? "border-white" : "border-gray-300"}`}>
              {fields.redirectMode === "landing" && (
                <div className="w-2.5 h-2.5 rounded-full bg-white" />
              )}
            </div>
            <div className="flex-1">
              <p className={`text-sm font-bold ${fields.redirectMode === "landing" ? "text-white" : "text-gray-900"}`}>
                توجيه إلى صفحة هبوط
              </p>
              <p className={`text-xs mt-0.5 ${fields.redirectMode === "landing" ? "text-amber-100" : "text-gray-400"}`}>
                يُحوَّل الزائر مباشرةً إلى الرابط أدناه
              </p>
            </div>
            <ExternalLink className={`shrink-0 w-5 h-5 ${fields.redirectMode === "landing" ? "text-amber-100" : "text-gray-300"}`} />
          </button>
        </div>

        {/* URL input — animated slide-in when landing is selected */}
        <div
          className={`overflow-hidden transition-all duration-300 ${
            fields.redirectMode === "landing" ? "max-h-32 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <Field label="رابط صفحة الهبوط (Landing Page URL)" error={errors.redirectUrl}>
            <div className="relative">
              <ExternalLink className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="url"
                value={fields.redirectUrl}
                onChange={(e) => set("redirectUrl", e.target.value)}
                placeholder="https://your-landing-page.com/offer"
                dir="ltr"
                className={`w-full text-sm border rounded-xl pr-9 pl-3 py-2.5 focus:outline-none bg-gray-50 font-mono text-xs ${
                  errors.redirectUrl ? "border-red-400 focus:border-red-400" : "border-gray-200 focus:border-amber-400"
                }`}
              />
            </div>
          </Field>
        </div>
      </FormSection>

      {/* ── Payment Methods (NEW) ── */}
      <FormSection title="طرق الدفع المسموح بها" icon="💳">
        <p className="text-xs text-gray-400 -mt-2">
          حدد طرق الدفع التي يُسمح بها لهذا المنتج في مرحلة الدفع
        </p>

        {/* Error banner — both disabled */}
        {bothPaymentOff && (
          <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-xs font-semibold text-red-600">
              {errors.payment || "يجب تفعيل طريقة دفع واحدة على الأقل"}
            </p>
          </div>
        )}

        <div className="space-y-2.5">
          <Toggle
            checked={fields.allowCOD}
            onChange={(v) => set("allowCOD", v)}
            label="الدفع عند الاستلام (COD)"
            sublabel="يسمح للعميل بالدفع نقداً عند تسليم الطلب"
            disabled={fields.allowCOD && !fields.allowPrepaid} // prevent disabling the only active method
          />

          <Toggle
            checked={fields.allowPrepaid}
            onChange={(v) => set("allowPrepaid", v)}
            label="الدفع المسبق (تحويل بنكي)"
            sublabel="يسمح للعميل بالدفع مسبقاً عبر التحويل البنكي"
            disabled={fields.allowPrepaid && !fields.allowCOD} // prevent disabling the only active method
          />
        </div>

        {/* Status summary pill */}
        <div className="flex gap-2 flex-wrap pt-1">
          {fields.allowCOD && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              COD مفعّل
            </span>
          )}
          {fields.allowPrepaid && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Prépaid مفعّل
            </span>
          )}
        </div>

        {errors.payment && !bothPaymentOff && (
          <p className="text-xs text-red-500">{errors.payment}</p>
        )}
      </FormSection>

      {/* ── Submit ── */}
      <button
        type="submit"
        disabled={loading || bothPaymentOff}
        className="w-full flex items-center justify-center gap-2 py-3.5 bg-gray-900 hover:bg-gray-800 active:scale-[0.99] text-white rounded-2xl font-bold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? "جارٍ الحفظ..." : submitLabel}
      </button>
    </form>
  );
}
