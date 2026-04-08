"use client";

/**
 * /admin/landing-pages/[id]/builder
 * ─────────────────────────────────────────────────────────────────────────────
 * Drag-and-drop visual builder for landing pages.
 *
 * Layout:
 *   TOP BAR   — back link, page title, template picker, view toggle, preview, save
 *   LEFT (240px) — block type palette
 *   CENTER (flex)  — canvas: ordered block list with drag handles + mini previews
 *   RIGHT (288px) — settings panel for selected block
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Save, Eye, Smartphone, Monitor, Loader2, Wand2,
  Trash2, Copy, GripVertical, EyeOff, ChevronDown, ChevronUp,
  Plus, X, Check,
} from "lucide-react";
import Link from "next/link";

// ══════════════════════════════════════════════════════════════════════════════
//  BLOCK CATALOGUE
// ══════════════════════════════════════════════════════════════════════════════

const BLOCK_TYPES = [
  { type: "hero",        label: "Hero",          emoji: "🦸", color: "bg-amber-50  text-amber-700  border-amber-200"  },
  { type: "image",       label: "Image",         emoji: "🖼️", color: "bg-sky-50    text-sky-700    border-sky-200"    },
  { type: "text",        label: "Text",          emoji: "📝", color: "bg-gray-50   text-gray-700   border-gray-200"   },
  { type: "video",       label: "Video",         emoji: "🎬", color: "bg-red-50    text-red-700    border-red-200"    },
  { type: "beforeAfter", label: "Before/After",  emoji: "↔️", color: "bg-teal-50   text-teal-700   border-teal-200"   },
  { type: "features",    label: "Features",      emoji: "✨", color: "bg-violet-50 text-violet-700 border-violet-200" },
  { type: "reviews",     label: "Reviews",       emoji: "⭐", color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  { type: "cta",         label: "CTA Button",    emoji: "👆", color: "bg-orange-50 text-orange-700 border-orange-200" },
  { type: "countdown",   label: "Countdown",     emoji: "⏱️", color: "bg-red-50    text-red-700    border-red-200"    },
  { type: "productCard", label: "Product Card",  emoji: "🛍️", color: "bg-green-50  text-green-700  border-green-200"  },
  { type: "trustBadges", label: "Trust Badges",  emoji: "🛡️", color: "bg-blue-50   text-blue-700   border-blue-200"   },
  { type: "faq",         label: "FAQ",           emoji: "❓", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { type: "spacer",      label: "Spacer",        icon: "↕",   color: "bg-gray-50   text-gray-500   border-gray-200"   },
  { type: "stockCounter",    label: "Stock Counter",     emoji: "📦", color: "bg-red-50    text-red-700    border-red-200"    },
  { type: "autoCountdown",   label: "Auto Countdown",    emoji: "🔄", color: "bg-orange-50 text-orange-700 border-orange-200" },
  { type: "viewerCount",     label: "Viewer Count",      emoji: "👁️", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { type: "verifiedReviews", label: "Verified Reviews",  emoji: "✅", color: "bg-green-50  text-green-700  border-green-200"  },
  { type: "customerPhotos",  label: "Customer Photos",   emoji: "📸", color: "bg-pink-50   text-pink-700   border-pink-200"   },
  { type: "deliveryBadges",  label: "Delivery Badges",   emoji: "🚚", color: "bg-teal-50   text-teal-700   border-teal-200"   },
  { type: "activityPopup",   label: "Activity Popup",    emoji: "🔔", color: "bg-amber-50  text-amber-700  border-amber-200"  },
  { type: "socialProof",     label: "Social Proof Bar",  emoji: "🏆", color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  { type: "imageSlider",  label: "Image Slider",     emoji: "🎠", color: "bg-sky-50    text-sky-700    border-sky-200"    },
  { type: "imageGrid",    label: "Image Grid",        emoji: "⊞",  color: "bg-gray-50   text-gray-700   border-gray-200"   },
  { type: "audio",        label: "Background Audio",  emoji: "🔊", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { type: "orderForm",    label: "Order Form (COD)",  emoji: "🧾", color: "bg-green-50  text-green-700  border-green-200"  },
  { type: "upsell",       label: "Upsell",            emoji: "💰", color: "bg-amber-50  text-amber-700  border-amber-200"  },
  { type: "feedbackBlock",label: "Feedback Block",    emoji: "💬", color: "bg-rose-50   text-rose-700   border-rose-200"   },
  { type: "menu",         label: "Menu / Navbar",     emoji: "🧭", color: "bg-slate-50  text-slate-700  border-slate-200"  },
];

function blockMeta(type) {
  return BLOCK_TYPES.find((b) => b.type === type) || { label: type, emoji: "📦", color: "bg-gray-50 text-gray-600 border-gray-200" };
}

function defaultConfig(type) {
  switch (type) {
    case "hero":        return { title: "عنوان رئيسي جذاب", subtitle: "عرض حصري محدود الوقت", bgImage: "", buttonText: "اطلب الآن", buttonColor: "#f59e0b", overlayOpacity: 0.55 };
    case "image":       return { src: "", alt: "", caption: "", fullWidth: true };
    case "text":        return { content: "<p>اكتب نصك هنا...</p>", align: "right" };
    case "video":       return { url: "", autoplay: false, controls: true, caption: "" };
    case "beforeAfter": return { beforeImage: "", afterImage: "", beforeLabel: "قبل", afterLabel: "بعد" };
    case "features":    return { title: "لماذا تختار هذا المنتج؟", items: [{ icon: "✓", title: "جودة مضمونة", desc: "منتج أصلي بأعلى معايير الجودة" }, { icon: "🚚", title: "توصيل سريع", desc: "خلال 24-48 ساعة لجميع المدن" }, { icon: "↩", title: "استرداد مجاني", desc: "7 أيام استرداد بدون شروط" }] };
    case "reviews":     return { title: "آراء العملاء", items: [{ name: "أحمد م.", rating: 5, text: "منتج رائع، الجودة فاقت توقعاتي" }, { name: "فاطمة ب.", rating: 5, text: "توصيل سريع وجودة ممتازة جداً" }] };
    case "cta":         return { text: "لا تفوّت هذا العرض الحصري!", buttonText: "اطلب الآن بسعر مميز", buttonColor: "#f59e0b", bgColor: "#fffbeb" };
    case "countdown":   return { endDate: "", title: "ينتهي العرض خلال", bgColor: "#ef4444" };
    case "productCard": return { showPrice: true, showRating: true, showDescription: true, showBuyButton: true };
    case "trustBadges": return { items: [{ icon: "🚚", label: "توصيل مجاني" }, { icon: "🛡️", label: "ضمان الجودة" }, { icon: "↩️", label: "إرجاع مجاني" }, { icon: "✅", label: "منتج أصلي" }] };
    case "faq":         return { title: "الأسئلة الشائعة", items: [{ q: "ما هي مدة التوصيل؟", a: "يصلك خلال 24 إلى 48 ساعة في جميع أرجاء المغرب" }, { q: "هل يمكن الاسترداد؟", a: "نعم، ضمان استرداد كامل خلال 7 أيام من الاستلام" }] };
    case "spacer":      return { height: 32 };
    case "stockCounter":    return { count: 5, label: "فقط {count} قطعة متبقية في المخزون!", showBar: true };
    case "autoCountdown":   return { resetHours: 4, title: "ينتهي العرض قريباً", bgColor: "#dc2626" };
    case "viewerCount":     return { min: 18, max: 35, label: "شخصاً يشاهد هذا العرض الآن", icon: "👁️" };
    case "verifiedReviews": return { title: "آراء موثّقة من عملاء حقيقيين", items: [{ name: "أحمد م.", city: "الدار البيضاء", rating: 5, text: "منتج رائع جداً، الجودة فاقت توقعاتي", verified: true }] };
    case "customerPhotos":  return { title: "صور من عملائنا", items: [] };
    case "deliveryBadges":  return { badges: [{ icon: "💵", label: "الدفع عند الاستلام" }, { icon: "🚀", label: "توصيل سريع" }, { icon: "↩️", label: "ضمان 7 أيام" }, { icon: "✅", label: "منتج أصلي 100%" }] };
    case "activityPopup":   return { items: [{ name: "أحمد", city: "الدار البيضاء" }, { name: "فاطمة", city: "الرباط" }, { name: "يوسف", city: "مراكش" }, { name: "سارة", city: "فاس" }], intervalSec: 8, displaySec: 4 };
    case "socialProof":     return { soldCount: "1000+", rating: "4.8", reviewCount: "532", bgColor: "#f0fdf4" };
    case "imageSlider":   return { images: [], autoplay: true, interval: 3000, showArrows: true, showDots: true };
    case "imageGrid":     return { images: [], mobileColumns: 2, desktopColumns: 3, gap: 0 };
    case "audio":         return { url: "", autoplay: true, loop: true, volume: 0.5, label: "موسيقى الخلفية" };
    case "orderForm":     return { productId: "", buttonText: "اطلب الآن", showAddress: true, successMessage: "تم استلام طلبك بنجاح! 🎉 سنتصل بك قريباً" };
    case "upsell":        return { productId: "", discountPrice: "", title: "عرض خاص — أضفه لطلبك", description: "" };
    case "feedbackBlock": return { title: "آراء عملائنا الحقيقيين", productId: "", showImages: true, showVoice: true, limit: 6 };
    case "menu":          return { logoText: "اسم المتجر", logoImage: "", links: [{ label: "الرئيسية", url: "/" }, { label: "تواصل معنا", url: "#contact" }], bgColor: "#ffffff", textColor: "#111827", sticky: false };
    default:            return {};
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  TEMPLATE PRESETS
// ══════════════════════════════════════════════════════════════════════════════

function makeBlocks(types) {
  return types.map((type) => ({ id: Math.random().toString(36).slice(2), type, visible: true, config: defaultConfig(type) }));
}

const TEMPLATES = {
  classic:      { name: "Classic",       blocks: makeBlocks(["hero", "productCard", "features", "trustBadges", "reviews", "cta"]) },
  story:        { name: "Story",         blocks: makeBlocks(["hero", "text", "beforeAfter", "features", "reviews", "cta"]) },
  minimal:      { name: "Minimal",       blocks: makeBlocks(["hero", "productCard", "cta"]) },
  "image-heavy":{ name: "Image Heavy",   blocks: makeBlocks(["hero", "image", "image", "features", "reviews", "cta"]) },
  "video-first":{ name: "Video First",   blocks: makeBlocks(["hero", "video", "features", "trustBadges", "reviews", "cta"]) },
  "high-conversion": { name: "⚡ High Conversion", blocks: makeBlocks(["hero", "socialProof", "deliveryBadges", "stockCounter", "productCard", "features", "beforeAfter", "video", "verifiedReviews", "customerPhotos", "autoCountdown", "cta", "faq"]) },
};

// ══════════════════════════════════════════════════════════════════════════════
//  SMALL HELPERS
// ══════════════════════════════════════════════════════════════════════════════

const cls = (...c) => c.filter(Boolean).join(" ");

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function FieldRow({ label, children, hint }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-gray-600">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, className = "" }) {
  return (
    <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={cls("w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-400 bg-white", className)}
    />
  );
}

function TextArea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea rows={rows} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-400 bg-white resize-y font-mono"
    />
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div className={cls("relative w-8 h-4 rounded-full transition-colors", checked ? "bg-violet-500" : "bg-gray-300")}
        onClick={() => onChange(!checked)}>
        <div className={cls("absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
      </div>
      {label && <span className="text-xs text-gray-600">{label}</span>}
    </label>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  BLOCK SETTINGS (dynamic form per block type)
// ══════════════════════════════════════════════════════════════════════════════

function ArrayItemEditor({ items, onChange, renderItem, createEmpty }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="bg-gray-50 rounded-lg p-2.5 space-y-1.5 relative">
          {renderItem(item, (updated) => {
            const next = [...items]; next[i] = updated; onChange(next);
          })}
          <button onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="absolute top-1.5 right-1.5 text-gray-300 hover:text-red-500">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...items, createEmpty()])}
        className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-violet-600 border border-dashed border-violet-300 rounded-lg hover:bg-violet-50">
        <Plus className="w-3 h-3" /> Add item
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MEDIA UPLOAD HELPER
// ══════════════════════════════════════════════════════════════════════════════

function UploadImageButton({ onUploaded, accept = "image/*", label = "Upload image" }) {
  const ref   = useRef(null);
  const [uploading, setUploading] = useState(false);
  const upload = async (file) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/image", { method: "POST", body: fd });
      const d = await r.json();
      if (d.url) onUploaded(d.url);
    } catch {}
    setUploading(false);
    if (ref.current) ref.current.value = "";
  };
  return (
    <>
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
        className="flex items-center gap-1.5 text-xs text-violet-600 border border-dashed border-violet-300 rounded-lg px-2.5 py-1.5 hover:bg-violet-50 disabled:opacity-60 w-full justify-center">
        {uploading ? <><Loader2 className="w-3 h-3 animate-spin" />Uploading…</> : <><Plus className="w-3 h-3" />{label}</>}
      </button>
    </>
  );
}

function ImagesArrayEditor({ images, onChange }) {
  const add  = (url) => onChange([...(images || []), url]);
  const remove = (i) => onChange((images || []).filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {(images || []).map((url, i) => (
          <div key={i} className="relative group rounded-lg overflow-hidden aspect-square bg-gray-100">
            <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
            <button onClick={() => remove(i)}
              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center">
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
      </div>
      <UploadImageButton onUploaded={add} accept="image/*,image/gif" label="Add image / GIF" />
    </div>
  );
}

function BlockSettingsForm({ block, onUpdate }) {
  const cfg = block.config || {};
  const set = (k, v) => onUpdate({ ...block, config: { ...cfg, [k]: v } });

  switch (block.type) {

    case "hero": return (
      <div className="space-y-3">
        <FieldRow label="Title"><TextInput value={cfg.title} onChange={(v) => set("title", v)} placeholder="Main headline" /></FieldRow>
        <FieldRow label="Subtitle"><TextInput value={cfg.subtitle} onChange={(v) => set("subtitle", v)} placeholder="Supporting text" /></FieldRow>
        <FieldRow label="Background Image URL" hint="Leave blank to use product image">
          <TextInput value={cfg.bgImage} onChange={(v) => set("bgImage", v)} placeholder="https://…" />
        </FieldRow>
        <FieldRow label="Button Text"><TextInput value={cfg.buttonText} onChange={(v) => set("buttonText", v)} placeholder="اطلب الآن" /></FieldRow>
        <FieldRow label="Button Color">
          <div className="flex gap-2 items-center">
            <input type="color" value={cfg.buttonColor || "#f59e0b"} onChange={(e) => set("buttonColor", e.target.value)} className="w-8 h-7 rounded border border-gray-200 cursor-pointer" />
            <TextInput value={cfg.buttonColor} onChange={(v) => set("buttonColor", v)} placeholder="#f59e0b" className="flex-1" />
          </div>
        </FieldRow>
        <FieldRow label={`Overlay opacity: ${Math.round((cfg.overlayOpacity ?? 0.55) * 100)}%`}>
          <input type="range" min="0" max="1" step="0.05" value={cfg.overlayOpacity ?? 0.55}
            onChange={(e) => set("overlayOpacity", parseFloat(e.target.value))}
            className="w-full accent-violet-500" />
        </FieldRow>
      </div>
    );

    case "image": return (
      <div className="space-y-3">
        <FieldRow label="Image URL"><TextInput value={cfg.src} onChange={(v) => set("src", v)} placeholder="https://…" /></FieldRow>
        <FieldRow label="Alt text"><TextInput value={cfg.alt} onChange={(v) => set("alt", v)} placeholder="Description" /></FieldRow>
        <FieldRow label="Caption (optional)"><TextInput value={cfg.caption} onChange={(v) => set("caption", v)} placeholder="Image caption" /></FieldRow>
        <Toggle checked={cfg.fullWidth !== false} onChange={(v) => set("fullWidth", v)} label="Full width" />
      </div>
    );

    case "text": return (
      <div className="space-y-3">
        <FieldRow label="Content (HTML supported)"><TextArea value={cfg.content} onChange={(v) => set("content", v)} rows={6} /></FieldRow>
        <FieldRow label="Alignment">
          <select value={cfg.align || "right"} onChange={(e) => set("align", e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none bg-white">
            <option value="right">Right (RTL)</option>
            <option value="left">Left</option>
            <option value="center">Center</option>
          </select>
        </FieldRow>
      </div>
    );

    case "video": return (
      <div className="space-y-3">
        <FieldRow label="Video URL" hint="YouTube, Vimeo, or direct mp4">
          <TextInput value={cfg.url} onChange={(v) => set("url", v)} placeholder="https://youtube.com/watch?v=…" />
        </FieldRow>
        <FieldRow label="Caption (optional)"><TextInput value={cfg.caption} onChange={(v) => set("caption", v)} /></FieldRow>
        <div className="flex gap-4">
          <Toggle checked={!!cfg.autoplay} onChange={(v) => set("autoplay", v)} label="Autoplay" />
          <Toggle checked={cfg.controls !== false} onChange={(v) => set("controls", v)} label="Controls" />
        </div>
      </div>
    );

    case "beforeAfter": return (
      <div className="space-y-3">
        <FieldRow label="Before image URL"><TextInput value={cfg.beforeImage} onChange={(v) => set("beforeImage", v)} placeholder="https://…" /></FieldRow>
        <FieldRow label="After image URL"><TextInput value={cfg.afterImage} onChange={(v) => set("afterImage", v)} placeholder="https://…" /></FieldRow>
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="Before label"><TextInput value={cfg.beforeLabel} onChange={(v) => set("beforeLabel", v)} placeholder="قبل" /></FieldRow>
          <FieldRow label="After label"><TextInput value={cfg.afterLabel} onChange={(v) => set("afterLabel", v)} placeholder="بعد" /></FieldRow>
        </div>
      </div>
    );

    case "features": return (
      <div className="space-y-3">
        <FieldRow label="Section title"><TextInput value={cfg.title} onChange={(v) => set("title", v)} /></FieldRow>
        <FieldRow label="Items">
          <ArrayItemEditor
            items={cfg.items || []}
            onChange={(items) => set("items", items)}
            createEmpty={() => ({ icon: "✓", title: "ميزة جديدة", desc: "وصف الميزة" })}
            renderItem={(item, upd) => (
              <>
                <div className="grid grid-cols-3 gap-1">
                  <TextInput value={item.icon} onChange={(v) => upd({ ...item, icon: v })} placeholder="✓" />
                  <TextInput value={item.title} onChange={(v) => upd({ ...item, title: v })} placeholder="Title" className="col-span-2" />
                </div>
                <TextInput value={item.desc} onChange={(v) => upd({ ...item, desc: v })} placeholder="Description" />
              </>
            )}
          />
        </FieldRow>
      </div>
    );

    case "reviews": return (
      <div className="space-y-3">
        <FieldRow label="Section title"><TextInput value={cfg.title} onChange={(v) => set("title", v)} /></FieldRow>
        <FieldRow label="Reviews">
          <ArrayItemEditor
            items={cfg.items || []}
            onChange={(items) => set("items", items)}
            createEmpty={() => ({ name: "عميل", rating: 5, text: "تجربة رائعة!" })}
            renderItem={(item, upd) => (
              <>
                <div className="grid grid-cols-2 gap-1">
                  <TextInput value={item.name} onChange={(v) => upd({ ...item, name: v })} placeholder="Name" />
                  <select value={item.rating || 5} onChange={(e) => upd({ ...item, rating: Number(e.target.value) })}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                    {[5,4,3,2,1].map(n => <option key={n} value={n}>{n} ★</option>)}
                  </select>
                </div>
                <TextInput value={item.text} onChange={(v) => upd({ ...item, text: v })} placeholder="Review text" />
              </>
            )}
          />
        </FieldRow>
      </div>
    );

    case "cta": return (
      <div className="space-y-3">
        <FieldRow label="Heading text"><TextInput value={cfg.text} onChange={(v) => set("text", v)} /></FieldRow>
        <FieldRow label="Button text"><TextInput value={cfg.buttonText} onChange={(v) => set("buttonText", v)} /></FieldRow>
        <FieldRow label="Button color">
          <div className="flex gap-2 items-center">
            <input type="color" value={cfg.buttonColor || "#f59e0b"} onChange={(e) => set("buttonColor", e.target.value)} className="w-8 h-7 rounded border border-gray-200 cursor-pointer" />
            <TextInput value={cfg.buttonColor} onChange={(v) => set("buttonColor", v)} className="flex-1" />
          </div>
        </FieldRow>
        <FieldRow label="Background color">
          <div className="flex gap-2 items-center">
            <input type="color" value={cfg.bgColor || "#fffbeb"} onChange={(e) => set("bgColor", e.target.value)} className="w-8 h-7 rounded border border-gray-200 cursor-pointer" />
            <TextInput value={cfg.bgColor} onChange={(v) => set("bgColor", v)} className="flex-1" />
          </div>
        </FieldRow>
        <FieldRow label="Custom button URL (optional)" hint="Leave blank to trigger Buy Now">
          <TextInput value={cfg.buttonUrl} onChange={(v) => set("buttonUrl", v)} placeholder="/checkout/address" />
        </FieldRow>
      </div>
    );

    case "countdown": return (
      <div className="space-y-3">
        <FieldRow label="End date & time">
          <input type="datetime-local" value={cfg.endDate || ""} onChange={(e) => set("endDate", e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none bg-white" />
        </FieldRow>
        <FieldRow label="Label above timer"><TextInput value={cfg.title} onChange={(v) => set("title", v)} placeholder="ينتهي العرض خلال" /></FieldRow>
        <FieldRow label="Background color">
          <div className="flex gap-2 items-center">
            <input type="color" value={cfg.bgColor || "#ef4444"} onChange={(e) => set("bgColor", e.target.value)} className="w-8 h-7 rounded border border-gray-200 cursor-pointer" />
            <TextInput value={cfg.bgColor} onChange={(v) => set("bgColor", v)} className="flex-1" />
          </div>
        </FieldRow>
      </div>
    );

    case "productCard": return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">Automatically pulls data from the linked product.</p>
        <Toggle checked={cfg.showPrice !== false} onChange={(v) => set("showPrice", v)} label="Show price" />
        <Toggle checked={cfg.showRating !== false} onChange={(v) => set("showRating", v)} label="Show rating" />
        <Toggle checked={cfg.showDescription !== false} onChange={(v) => set("showDescription", v)} label="Show description" />
        <Toggle checked={cfg.showBuyButton !== false} onChange={(v) => set("showBuyButton", v)} label="Show buy button" />
      </div>
    );

    case "trustBadges": return (
      <div className="space-y-3">
        <FieldRow label="Badges">
          <ArrayItemEditor
            items={cfg.items || []}
            onChange={(items) => set("items", items)}
            createEmpty={() => ({ icon: "✅", label: "Badge label" })}
            renderItem={(item, upd) => (
              <div className="grid grid-cols-3 gap-1">
                <TextInput value={item.icon} onChange={(v) => upd({ ...item, icon: v })} placeholder="Emoji" />
                <TextInput value={item.label} onChange={(v) => upd({ ...item, label: v })} placeholder="Label" className="col-span-2" />
              </div>
            )}
          />
        </FieldRow>
      </div>
    );

    case "faq": return (
      <div className="space-y-3">
        <FieldRow label="Section title"><TextInput value={cfg.title} onChange={(v) => set("title", v)} /></FieldRow>
        <FieldRow label="Questions">
          <ArrayItemEditor
            items={cfg.items || []}
            onChange={(items) => set("items", items)}
            createEmpty={() => ({ q: "سؤال؟", a: "الإجابة هنا" })}
            renderItem={(item, upd) => (
              <>
                <TextInput value={item.q} onChange={(v) => upd({ ...item, q: v })} placeholder="Question" />
                <TextInput value={item.a} onChange={(v) => upd({ ...item, a: v })} placeholder="Answer" />
              </>
            )}
          />
        </FieldRow>
      </div>
    );

    case "spacer": return (
      <div className="space-y-3">
        <FieldRow label={`Height: ${cfg.height || 32}px`}>
          <input type="range" min="8" max="200" step="8" value={cfg.height || 32}
            onChange={(e) => set("height", parseInt(e.target.value))}
            className="w-full accent-violet-500" />
        </FieldRow>
      </div>
    );

    case "stockCounter": return (
      <div className="space-y-3">
        <FieldRow label="Quantity remaining">
          <input type="number" min="1" max="99" value={cfg.count ?? 5} onChange={(e) => set("count", parseInt(e.target.value))}
            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none bg-white" />
        </FieldRow>
        <FieldRow label="Label" hint="Use {count} as placeholder">
          <TextInput value={cfg.label} onChange={(v) => set("label", v)} placeholder="فقط {count} قطعة متبقية!" />
        </FieldRow>
        <Toggle checked={cfg.showBar !== false} onChange={(v) => set("showBar", v)} label="Show progress bar" />
      </div>
    );

    case "autoCountdown": return (
      <div className="space-y-3">
        <FieldRow label="Reset every (hours)" hint="Timer resets automatically">
          <input type="number" min="1" max="72" value={cfg.resetHours ?? 4} onChange={(e) => set("resetHours", parseInt(e.target.value))}
            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none bg-white" />
        </FieldRow>
        <FieldRow label="Label"><TextInput value={cfg.title} onChange={(v) => set("title", v)} placeholder="ينتهي العرض قريباً" /></FieldRow>
        <FieldRow label="Background color">
          <div className="flex gap-2 items-center">
            <input type="color" value={cfg.bgColor || "#dc2626"} onChange={(e) => set("bgColor", e.target.value)} className="w-8 h-7 rounded border border-gray-200 cursor-pointer" />
            <TextInput value={cfg.bgColor} onChange={(v) => set("bgColor", v)} className="flex-1" />
          </div>
        </FieldRow>
      </div>
    );

    case "viewerCount": return (
      <div className="space-y-3">
        <FieldRow label="Label"><TextInput value={cfg.label} onChange={(v) => set("label", v)} placeholder="شخصاً يشاهد هذا الآن" /></FieldRow>
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="Min viewers">
            <input type="number" min="1" value={cfg.min ?? 18} onChange={(e) => set("min", parseInt(e.target.value))}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none bg-white" />
          </FieldRow>
          <FieldRow label="Max viewers">
            <input type="number" min="1" value={cfg.max ?? 35} onChange={(e) => set("max", parseInt(e.target.value))}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none bg-white" />
          </FieldRow>
        </div>
      </div>
    );

    case "verifiedReviews": return (
      <div className="space-y-3">
        <FieldRow label="Section title"><TextInput value={cfg.title} onChange={(v) => set("title", v)} /></FieldRow>
        <FieldRow label="Reviews">
          <ArrayItemEditor
            items={cfg.items || []}
            onChange={(items) => set("items", items)}
            createEmpty={() => ({ name: "عميل", city: "المغرب", rating: 5, text: "تجربة رائعة!", verified: true })}
            renderItem={(item, upd) => (
              <>
                <div className="grid grid-cols-2 gap-1">
                  <TextInput value={item.name} onChange={(v) => upd({ ...item, name: v })} placeholder="Name" />
                  <TextInput value={item.city} onChange={(v) => upd({ ...item, city: v })} placeholder="City" />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <select value={item.rating || 5} onChange={(e) => upd({ ...item, rating: Number(e.target.value) })}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                    {[5,4,3,2,1].map(n => <option key={n} value={n}>{n} ★</option>)}
                  </select>
                  <Toggle checked={item.verified !== false} onChange={(v) => upd({ ...item, verified: v })} label="Verified" />
                </div>
                <TextInput value={item.text} onChange={(v) => upd({ ...item, text: v })} placeholder="Review text" />
              </>
            )}
          />
        </FieldRow>
      </div>
    );

    case "customerPhotos": return (
      <div className="space-y-3">
        <FieldRow label="Section title"><TextInput value={cfg.title} onChange={(v) => set("title", v)} /></FieldRow>
        <FieldRow label="Customer photos">
          <ArrayItemEditor
            items={cfg.items || []}
            onChange={(items) => set("items", items)}
            createEmpty={() => ({ url: "", name: "عميل", caption: "" })}
            renderItem={(item, upd) => (
              <>
                <TextInput value={item.url} onChange={(v) => upd({ ...item, url: v })} placeholder="Image URL https://…" />
                <div className="grid grid-cols-2 gap-1">
                  <TextInput value={item.name} onChange={(v) => upd({ ...item, name: v })} placeholder="Customer name" />
                  <TextInput value={item.caption} onChange={(v) => upd({ ...item, caption: v })} placeholder="Caption" />
                </div>
              </>
            )}
          />
        </FieldRow>
      </div>
    );

    case "deliveryBadges": return (
      <div className="space-y-3">
        <FieldRow label="Badges">
          <ArrayItemEditor
            items={cfg.badges || []}
            onChange={(badges) => set("badges", badges)}
            createEmpty={() => ({ icon: "✅", label: "ميزة" })}
            renderItem={(item, upd) => (
              <div className="grid grid-cols-3 gap-1">
                <TextInput value={item.icon} onChange={(v) => upd({ ...item, icon: v })} placeholder="Emoji" />
                <TextInput value={item.label} onChange={(v) => upd({ ...item, label: v })} placeholder="Label" className="col-span-2" />
              </div>
            )}
          />
        </FieldRow>
      </div>
    );

    case "activityPopup": return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">Shows a floating popup "Name from City just ordered"</p>
        <FieldRow label="People list">
          <ArrayItemEditor
            items={cfg.items || []}
            onChange={(items) => set("items", items)}
            createEmpty={() => ({ name: "أحمد", city: "الدار البيضاء" })}
            renderItem={(item, upd) => (
              <div className="grid grid-cols-2 gap-1">
                <TextInput value={item.name} onChange={(v) => upd({ ...item, name: v })} placeholder="Name" />
                <TextInput value={item.city} onChange={(v) => upd({ ...item, city: v })} placeholder="City" />
              </div>
            )}
          />
        </FieldRow>
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="Show every (sec)">
            <input type="number" min="3" max="60" value={cfg.intervalSec ?? 8} onChange={(e) => set("intervalSec", parseInt(e.target.value))}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none bg-white" />
          </FieldRow>
          <FieldRow label="Display for (sec)">
            <input type="number" min="2" max="10" value={cfg.displaySec ?? 4} onChange={(e) => set("displaySec", parseInt(e.target.value))}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none bg-white" />
          </FieldRow>
        </div>
      </div>
    );

    case "socialProof": return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="Units sold"><TextInput value={cfg.soldCount} onChange={(v) => set("soldCount", v)} placeholder="1000+" /></FieldRow>
          <FieldRow label="Rating"><TextInput value={cfg.rating} onChange={(v) => set("rating", v)} placeholder="4.8" /></FieldRow>
        </div>
        <FieldRow label="Review count"><TextInput value={cfg.reviewCount} onChange={(v) => set("reviewCount", v)} placeholder="532" /></FieldRow>
        <FieldRow label="Background color">
          <div className="flex gap-2 items-center">
            <input type="color" value={cfg.bgColor || "#f0fdf4"} onChange={(e) => set("bgColor", e.target.value)} className="w-8 h-7 rounded border border-gray-200 cursor-pointer" />
            <TextInput value={cfg.bgColor} onChange={(v) => set("bgColor", v)} className="flex-1" />
          </div>
        </FieldRow>
      </div>
    );

    case "imageSlider": return (
      <div className="space-y-3">
        <FieldRow label="Images (upload or add GIF)" hint="Swipe-enabled on mobile">
          <ImagesArrayEditor images={cfg.images || []} onChange={(v) => set("images", v)} />
        </FieldRow>
        <div className="grid grid-cols-2 gap-2">
          <Toggle checked={cfg.autoplay !== false} onChange={(v) => set("autoplay", v)} label="Auto-slide" />
          <Toggle checked={cfg.showArrows !== false} onChange={(v) => set("showArrows", v)} label="Arrows" />
        </div>
        <Toggle checked={cfg.showDots !== false} onChange={(v) => set("showDots", v)} label="Dot indicators" />
        <FieldRow label={`Interval: ${cfg.interval || 3000}ms`}>
          <input type="range" min="1000" max="8000" step="500" value={cfg.interval || 3000}
            onChange={(e) => set("interval", parseInt(e.target.value))}
            className="w-full accent-violet-500" />
        </FieldRow>
      </div>
    );

    case "imageGrid": return (
      <div className="space-y-3">
        <FieldRow label="Images (GIF supported)" hint="Edge-to-edge, no margins">
          <ImagesArrayEditor images={cfg.images || []} onChange={(v) => set("images", v)} />
        </FieldRow>
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="Mobile cols">
            <select value={cfg.mobileColumns || 2} onChange={(e) => set("mobileColumns", parseInt(e.target.value))}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
              {[1,2,3].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Desktop cols">
            <select value={cfg.desktopColumns || 3} onChange={(e) => set("desktopColumns", parseInt(e.target.value))}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
              {[2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </FieldRow>
        </div>
        <FieldRow label={`Gap: ${cfg.gap ?? 0}px`}>
          <input type="range" min="0" max="16" step="2" value={cfg.gap ?? 0}
            onChange={(e) => set("gap", parseInt(e.target.value))}
            className="w-full accent-violet-500" />
        </FieldRow>
      </div>
    );

    case "audio": return (
      <div className="space-y-3">
        <FieldRow label="Audio file" hint="Upload MP3, WAV, or paste URL">
          <TextInput value={cfg.url} onChange={(v) => set("url", v)} placeholder="https://… or upload below" />
          <UploadImageButton accept="audio/*" label="Upload audio file" onUploaded={(u) => set("url", u)} />
        </FieldRow>
        <FieldRow label="Player label (optional)">
          <TextInput value={cfg.label} onChange={(v) => set("label", v)} placeholder="موسيقى الخلفية" />
        </FieldRow>
        <div className="flex flex-col gap-2">
          <Toggle checked={cfg.autoplay !== false} onChange={(v) => set("autoplay", v)} label="Autoplay (after interaction)" />
          <Toggle checked={cfg.loop !== false} onChange={(v) => set("loop", v)} label="Loop" />
        </div>
        <FieldRow label={`Volume: ${Math.round((cfg.volume ?? 0.5) * 100)}%`}>
          <input type="range" min="0" max="1" step="0.1" value={cfg.volume ?? 0.5}
            onChange={(e) => set("volume", parseFloat(e.target.value))}
            className="w-full accent-violet-500" />
        </FieldRow>
      </div>
    );

    case "orderForm": return (
      <div className="space-y-3">
        <FieldRow label="Linked product ID" hint="Leave blank to use page's main product">
          <TextInput value={cfg.productId} onChange={(v) => set("productId", v)} placeholder="Product UUID (optional)" />
        </FieldRow>
        <FieldRow label="Button text">
          <div className="grid grid-cols-3 gap-1">
            {["اطلب الآن", "احجز الآن", "Buy Now"].map((t) => (
              <button key={t} type="button" onClick={() => set("buttonText", t)}
                className={cls("text-[10px] py-1 rounded border transition-colors", cfg.buttonText === t ? "bg-violet-500 text-white border-violet-500" : "border-gray-200 text-gray-600 hover:bg-gray-50")}>
                {t}
              </button>
            ))}
          </div>
          <TextInput value={cfg.buttonText} onChange={(v) => set("buttonText", v)} placeholder="Custom text…" className="mt-1" />
        </FieldRow>
        <Toggle checked={cfg.showAddress !== false} onChange={(v) => set("showAddress", v)} label="Show address field" />
        <FieldRow label="Success message">
          <TextArea value={cfg.successMessage} onChange={(v) => set("successMessage", v)} rows={2} placeholder="تم استلام طلبك! 🎉" />
        </FieldRow>
      </div>
    );

    case "upsell": return (
      <div className="space-y-3">
        <FieldRow label="Upsell product ID" hint="Product to show as add-on offer">
          <TextInput value={cfg.productId} onChange={(v) => set("productId", v)} placeholder="Product UUID" />
        </FieldRow>
        <FieldRow label="Offer title">
          <TextInput value={cfg.title} onChange={(v) => set("title", v)} placeholder="عرض خاص — أضفه لطلبك" />
        </FieldRow>
        <FieldRow label="Short description (optional)">
          <TextInput value={cfg.description} onChange={(v) => set("description", v)} placeholder="وفّر أكثر عند شراء المنتجين معاً" />
        </FieldRow>
        <FieldRow label="Special price (override)" hint="Leave blank to use product's sale price">
          <TextInput value={cfg.discountPrice} onChange={(v) => set("discountPrice", v)} placeholder="e.g. 79" />
        </FieldRow>
      </div>
    );

    case "feedbackBlock": return (
      <div className="space-y-3">
        <FieldRow label="Section title">
          <TextInput value={cfg.title} onChange={(v) => set("title", v)} placeholder="آراء عملائنا" />
        </FieldRow>
        <FieldRow label="Product ID (filter feedback)" hint="Leave blank to show all">
          <TextInput value={cfg.productId} onChange={(v) => set("productId", v)} placeholder="Product UUID (optional)" />
        </FieldRow>
        <FieldRow label={`Max items: ${cfg.limit || 6}`}>
          <input type="range" min="1" max="20" step="1" value={cfg.limit || 6}
            onChange={(e) => set("limit", parseInt(e.target.value))}
            className="w-full accent-violet-500" />
        </FieldRow>
        <div className="flex flex-col gap-2">
          <Toggle checked={cfg.showImages !== false} onChange={(v) => set("showImages", v)} label="Show customer photos" />
          <Toggle checked={cfg.showVoice !== false} onChange={(v) => set("showVoice", v)} label="Show voice comments" />
        </div>
      </div>
    );

    case "menu": return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">Optional top navbar — appears once at the top of the page.</p>
        <FieldRow label="Logo text">
          <TextInput value={cfg.logoText} onChange={(v) => set("logoText", v)} placeholder="اسم المتجر" />
        </FieldRow>
        <FieldRow label="Logo image URL (overrides text)">
          <TextInput value={cfg.logoImage} onChange={(v) => set("logoImage", v)} placeholder="https://…" />
          <UploadImageButton onUploaded={(u) => set("logoImage", u)} label="Upload logo" />
        </FieldRow>
        <FieldRow label="Nav links">
          <ArrayItemEditor
            items={cfg.links || []}
            onChange={(links) => set("links", links)}
            createEmpty={() => ({ label: "رابط", url: "/" })}
            renderItem={(item, upd) => (
              <div className="grid grid-cols-2 gap-1">
                <TextInput value={item.label} onChange={(v) => upd({ ...item, label: v })} placeholder="Label" />
                <TextInput value={item.url}   onChange={(v) => upd({ ...item, url: v })}   placeholder="URL or #section" />
              </div>
            )}
          />
        </FieldRow>
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="Background">
            <div className="flex gap-2 items-center">
              <input type="color" value={cfg.bgColor || "#ffffff"} onChange={(e) => set("bgColor", e.target.value)} className="w-8 h-7 rounded border border-gray-200 cursor-pointer" />
              <TextInput value={cfg.bgColor} onChange={(v) => set("bgColor", v)} className="flex-1" />
            </div>
          </FieldRow>
          <FieldRow label="Text color">
            <div className="flex gap-2 items-center">
              <input type="color" value={cfg.textColor || "#111827"} onChange={(e) => set("textColor", e.target.value)} className="w-8 h-7 rounded border border-gray-200 cursor-pointer" />
              <TextInput value={cfg.textColor} onChange={(v) => set("textColor", v)} className="flex-1" />
            </div>
          </FieldRow>
        </div>
        <Toggle checked={!!cfg.sticky} onChange={(v) => set("sticky", v)} label="Sticky (stays at top on scroll)" />
      </div>
    );

    default: return <p className="text-xs text-gray-400 italic">No settings for this block type.</p>;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CANVAS BLOCK MINI-PREVIEW
// ══════════════════════════════════════════════════════════════════════════════

function BlockMiniPreview({ block }) {
  const { type, config: cfg = {} } = block;
  switch (type) {
    case "hero":
      return (
        <div className="relative rounded-lg overflow-hidden bg-gray-800 h-16 flex items-end p-2">
          {cfg.bgImage && <img src={cfg.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" loading="lazy" />}
          <div className="relative z-10">
            <div className="text-white text-[10px] font-bold leading-tight truncate max-w-[200px]">{cfg.title || "Hero Title"}</div>
            {cfg.subtitle && <div className="text-white/70 text-[9px] truncate max-w-[200px]">{cfg.subtitle}</div>}
          </div>
          <div className="relative z-10 ml-auto">
            <div className="text-[9px] px-2 py-0.5 rounded font-bold text-white" style={{ background: cfg.buttonColor || "#f59e0b" }}>
              {cfg.buttonText || "اطلب"}
            </div>
          </div>
        </div>
      );
    case "image":
      return cfg.src ? (
        <img src={cfg.src} alt={cfg.alt || ""} className="w-full h-16 object-cover rounded-lg" loading="lazy" />
      ) : (
        <div className="h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-[10px]">🖼️ No image set</div>
      );
    case "text":
      return (
        <div className="text-[10px] text-gray-600 line-clamp-2 max-h-8 overflow-hidden"
          dangerouslySetInnerHTML={{ __html: cfg.content || "<p>Text block</p>" }} />
      );
    case "video":
      return <div className="h-10 bg-gray-800 rounded-lg flex items-center justify-center text-white text-[10px] gap-1"><span>▶</span> {cfg.url ? "Video" : "No URL set"}</div>;
    case "beforeAfter":
      return (
        <div className="flex gap-1 h-10">
          <div className="flex-1 rounded bg-gray-200 flex items-center justify-center text-[9px] text-gray-500">
            {cfg.beforeImage ? <img src={cfg.beforeImage} alt="" className="w-full h-full object-cover rounded" loading="lazy" /> : cfg.beforeLabel || "Before"}
          </div>
          <div className="w-px bg-gray-400" />
          <div className="flex-1 rounded bg-gray-200 flex items-center justify-center text-[9px] text-gray-500">
            {cfg.afterImage ? <img src={cfg.afterImage} alt="" className="w-full h-full object-cover rounded" loading="lazy" /> : cfg.afterLabel || "After"}
          </div>
        </div>
      );
    case "features":
      return (
        <div className="space-y-0.5">
          {(cfg.items || []).slice(0, 3).map((item, i) => (
            <div key={i} className="flex items-center gap-1 text-[9px] text-gray-600">
              <span>{item.icon}</span><span className="truncate">{item.title}</span>
            </div>
          ))}
        </div>
      );
    case "reviews":
      return (
        <div className="space-y-0.5">
          {(cfg.items || []).slice(0, 2).map((item, i) => (
            <div key={i} className="flex items-center gap-1 text-[9px] text-gray-600">
              <span className="text-amber-400">{"★".repeat(item.rating || 5)}</span>
              <span className="truncate">{item.name} — {item.text}</span>
            </div>
          ))}
        </div>
      );
    case "cta":
      return (
        <div className="h-10 rounded-lg flex items-center justify-between px-3" style={{ background: cfg.bgColor || "#fffbeb" }}>
          <span className="text-[9px] text-gray-700 truncate mr-2">{cfg.text || "CTA text"}</span>
          <span className="text-[9px] text-white px-2 py-0.5 rounded font-bold" style={{ background: cfg.buttonColor || "#f59e0b" }}>
            {cfg.buttonText || "اطلب"}
          </span>
        </div>
      );
    case "countdown":
      return (
        <div className="h-10 rounded-lg flex items-center justify-center gap-2 px-3" style={{ background: cfg.bgColor || "#ef4444" }}>
          <span className="text-[9px] text-white">{cfg.title || "ينتهي العرض خلال"}</span>
          <span className="text-[10px] font-bold text-white bg-black/20 px-1 rounded">00:00:00</span>
        </div>
      );
    case "productCard":
      return <div className="h-10 bg-gray-50 rounded-lg flex items-center px-3 gap-2 text-[9px] text-gray-600"><span>🛍️</span> Product card (auto-filled from linked product)</div>;
    case "trustBadges":
      return (
        <div className="flex gap-2 flex-wrap">
          {(cfg.items || []).slice(0, 4).map((b, i) => (
            <div key={i} className="flex items-center gap-1 text-[9px] text-gray-600"><span>{b.icon}</span><span>{b.label}</span></div>
          ))}
        </div>
      );
    case "faq":
      return (
        <div className="space-y-0.5">
          {(cfg.items || []).slice(0, 2).map((item, i) => (
            <div key={i} className="text-[9px] text-gray-600 truncate">❓ {item.q}</div>
          ))}
        </div>
      );
    case "spacer":
      return <div className="flex items-center gap-2 text-[9px] text-gray-400">↕ {cfg.height || 32}px spacing</div>;
    case "stockCounter":
      return <div className="flex items-center gap-2 text-[9px] text-red-600 font-bold">📦 فقط {cfg.count ?? 5} متبقية</div>;
    case "autoCountdown":
      return (
        <div className="h-8 rounded flex items-center justify-center gap-2 px-2 text-[9px] text-white" style={{ background: cfg.bgColor || "#dc2626" }}>
          🔄 {cfg.title || "ينتهي العرض"} · كل {cfg.resetHours || 4}س
        </div>
      );
    case "viewerCount":
      return <div className="flex items-center gap-1 text-[9px] text-indigo-600">👁️ {cfg.min || 18}–{cfg.max || 35} {cfg.label || "يشاهدون الآن"}</div>;
    case "verifiedReviews":
      return (
        <div className="space-y-0.5">
          {(cfg.items || []).slice(0, 2).map((r, i) => (
            <div key={i} className="flex items-center gap-1 text-[9px] text-gray-600">
              <span className="text-green-500">✅</span><span className="truncate">{r.name} — {r.text}</span>
            </div>
          ))}
        </div>
      );
    case "customerPhotos":
      return (
        <div className="flex gap-1">
          {(cfg.items || []).slice(0, 4).map((p, i) =>
            p.url ? <img key={i} src={p.url} alt="" className="w-8 h-8 rounded object-cover" loading="lazy" /> :
            <div key={i} className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center text-[9px]">📸</div>
          )}
          {(!cfg.items || cfg.items.length === 0) && <div className="text-[9px] text-gray-400">📸 No photos yet</div>}
        </div>
      );
    case "deliveryBadges":
      return (
        <div className="flex gap-2 flex-wrap">
          {(cfg.badges || []).slice(0, 4).map((b, i) => (
            <div key={i} className="flex items-center gap-1 text-[9px] text-teal-700"><span>{b.icon}</span><span>{b.label}</span></div>
          ))}
        </div>
      );
    case "activityPopup":
      return <div className="text-[9px] text-amber-700">🔔 {(cfg.items || [])[0]?.name || "أحمد"} من {(cfg.items || [])[0]?.city || "الدار البيضاء"} طلب للتو</div>;
    case "socialProof":
      return (
        <div className="flex items-center gap-3 text-[9px]" style={{ background: cfg.bgColor || "#f0fdf4" }}>
          <span className="font-bold text-green-700">🏆 {cfg.soldCount || "1000+"} مبيعة</span>
          <span className="text-amber-600">⭐ {cfg.rating || "4.8"} ({cfg.reviewCount || "532"})</span>
        </div>
      );
    case "imageSlider":
      return (
        <div className="relative h-14 rounded-lg overflow-hidden bg-gray-200">
          {(cfg.images || [])[0]
            ? <img src={cfg.images[0]} alt="" className="w-full h-full object-cover" loading="lazy" />
            : <div className="w-full h-full flex items-center justify-center text-gray-400 text-[10px]">🎠 {(cfg.images || []).length} images</div>
          }
          {(cfg.images || []).length > 1 && (
            <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-1">
              {(cfg.images || []).slice(0, 5).map((_, i) => (
                <div key={i} className={`w-1 h-1 rounded-full ${i === 0 ? "bg-white" : "bg-white/50"}`} />
              ))}
            </div>
          )}
        </div>
      );
    case "imageGrid":
      return (
        <div className={`grid gap-0.5`} style={{ gridTemplateColumns: `repeat(${Math.min(cfg.mobileColumns || 2, (cfg.images || []).length || 2)}, 1fr)` }}>
          {(cfg.images || []).slice(0, cfg.mobileColumns || 2).map((url, i) => (
            <img key={i} src={url} alt="" className="w-full h-8 object-cover" loading="lazy" />
          ))}
          {(cfg.images || []).length === 0 && (
            <div className="col-span-2 h-8 bg-gray-100 rounded flex items-center justify-center text-[9px] text-gray-400">⊞ Image grid</div>
          )}
        </div>
      );
    case "audio":
      return <div className="flex items-center gap-2 h-8 bg-purple-50 rounded-lg px-2 text-[9px] text-purple-700">🔊 {cfg.label || "Background Audio"} {cfg.autoplay ? "· autoplay" : ""}</div>;
    case "orderForm":
      return (
        <div className="bg-green-50 rounded-lg p-2 space-y-1">
          <div className="flex gap-1">
            <div className="h-2 bg-gray-200 rounded flex-1" />
            <div className="h-2 bg-gray-200 rounded flex-1" />
          </div>
          <div className="h-4 rounded text-center text-[8px] font-bold text-white flex items-center justify-center" style={{ background: "#22c55e" }}>
            {cfg.buttonText || "اطلب الآن"}
          </div>
        </div>
      );
    case "upsell":
      return <div className="flex items-center gap-2 h-10 bg-amber-50 rounded-lg px-2 text-[9px] text-amber-700">💰 {cfg.title || "Upsell offer"}</div>;
    case "feedbackBlock":
      return <div className="flex items-center gap-1 text-[9px] text-rose-700">💬 {cfg.title || "Customer Feedback"} · max {cfg.limit || 6}</div>;
    case "menu":
      return <div className="flex items-center gap-2 h-8 bg-white rounded-lg border border-gray-100 px-2 text-[9px] text-gray-700">🧭 {cfg.logoText || "Menu"}{cfg.sticky ? " · sticky" : ""}</div>;
    default:
      return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CANVAS BLOCK ITEM (draggable row in block list)
// ══════════════════════════════════════════════════════════════════════════════

function BlockItem({ block, isSelected, onSelect, onDelete, onDuplicate, onToggle, isDragOver, onDragStart, onDragOver, onDragEnd }) {
  const meta = blockMeta(block.type);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={cls(
        "group relative rounded-xl border transition-all cursor-pointer select-none mb-2",
        isSelected ? "border-violet-400 shadow-md shadow-violet-100" : "border-gray-200 hover:border-gray-300",
        isDragOver  ? "opacity-50 scale-[0.98]" : "",
        !block.visible ? "opacity-40" : "",
      )}
    >
      {/* Header */}
      <div className={cls("flex items-center gap-2 px-3 py-2 rounded-t-xl", meta.color.split(" ").slice(0, 2).join(" ") + " bg-opacity-40")}>
        <GripVertical className="w-3.5 h-3.5 text-gray-400 cursor-grab flex-shrink-0" />
        <span className="text-sm">{meta.emoji || meta.icon}</span>
        <span className="text-xs font-semibold text-gray-700 flex-1">{meta.label}</span>

        {/* Controls */}
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="p-1 rounded hover:bg-black/10 text-gray-500 hover:text-gray-700 transition-colors" title={block.visible ? "Hide" : "Show"}>
          {block.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="p-1 rounded hover:bg-black/10 text-gray-500 hover:text-gray-700 transition-colors" title="Duplicate">
          <Copy className="w-3 h-3" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Mini preview */}
      <div className="px-3 py-2.5">
        <BlockMiniPreview block={block} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  LEFT PANEL: BLOCK PICKER
// ══════════════════════════════════════════════════════════════════════════════

function BlockPicker({ onAdd }) {
  return (
    <div className="p-3">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Add Blocks</p>
      <div className="space-y-1">
        {BLOCK_TYPES.map(({ type, label, emoji, icon, color }) => (
          <button key={type} onClick={() => onAdd(type)}
            className={cls("w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all hover:shadow-sm active:scale-[0.97]", color)}>
            <span className="text-sm">{emoji || icon}</span>
            <span>{label}</span>
            <Plus className="w-3 h-3 ml-auto opacity-50" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  RIGHT PANEL: SETTINGS
// ══════════════════════════════════════════════════════════════════════════════

function SettingsPanel({ block, onUpdate, landingPage, products }) {
  if (!block) {
    return (
      <div className="p-5 flex flex-col items-center justify-center h-full text-center">
        <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
          <span className="text-2xl">👈</span>
        </div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Select a block</p>
        <p className="text-xs text-gray-400">Click any block in the canvas to edit its settings here.</p>
      </div>
    );
  }

  const meta = blockMeta(block.type);

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">{meta.emoji || meta.icon}</span>
          <div>
            <p className="text-xs font-bold text-gray-800">{meta.label}</p>
            <p className="text-[10px] text-gray-400 capitalize">{block.type} block</p>
          </div>
        </div>
      </div>

      {/* Settings form */}
      <div className="flex-1 overflow-y-auto p-4">
        <BlockSettingsForm block={block} onUpdate={onUpdate} products={products} landingPage={landingPage} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SAVE TEMPLATES DIALOG
// ══════════════════════════════════════════════════════════════════════════════

function SaveTemplateDialog({ blocks, templateType, onClose }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await fetch("/api/landing/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), templateType, content: blocks }),
    });
    setSaving(false);
    setDone(true);
    setTimeout(onClose, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Save as Template</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        {done ? (
          <div className="flex items-center gap-2 text-green-600 text-sm py-2">
            <Check className="w-4 h-4" /> Template saved!
          </div>
        ) : (
          <>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Template name…"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-violet-400 bg-gray-50"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">Cancel</button>
              <button onClick={handleSave} disabled={saving || !name.trim()}
                className="px-4 py-2 text-sm text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-60 flex items-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Template
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function BuilderPage() {
  const { id }   = useParams();
  const router   = useRouter();

  const [loading,      setLoading]      = useState(true);
  const [landingPage,  setLandingPage]  = useState(null);
  const [blocks,       setBlocks]       = useState([]);
  const [selected,     setSelected]     = useState(null);   // block id
  const [viewMode,     setViewMode]     = useState("mobile");
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [templateType, setTemplateType] = useState("classic");
  const [products,     setProducts]     = useState([]);
  const [showSaveTpl,  setShowSaveTpl]  = useState(false);
  const [generating,   setGenerating]   = useState(false);

  const dragId = useRef(null);

  // ── Load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/landing-page?id=${id}`).then((r) => r.json()),
      fetch("/api/products?status=all").then((r) => r.json()),
    ]).then(([lp, prods]) => {
      if (lp && !lp.error) {
        setLandingPage(lp);
        setBlocks(Array.isArray(lp.sections) ? lp.sections : []);
        setTemplateType(lp.templateType || "classic");
      }
      setProducts(Array.isArray(prods) ? prods : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  // ── Block actions ───────────────────────────────────────────────────────────

  const addBlock = useCallback((type) => {
    const block = { id: uid(), type, visible: true, config: defaultConfig(type) };
    setBlocks((prev) => [...prev, block]);
    setSelected(block.id);
  }, []);

  const updateBlock = useCallback((updated) => {
    setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }, []);

  const deleteBlock = useCallback((blockId) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    setSelected((s) => (s === blockId ? null : s));
  }, []);

  const duplicateBlock = useCallback((blockId) => {
    setBlocks((prev) => {
      const idx   = prev.findIndex((b) => b.id === blockId);
      if (idx === -1) return prev;
      const clone = { ...prev[idx], id: uid() };
      const next  = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
  }, []);

  const toggleVisible = useCallback((blockId) => {
    setBlocks((prev) => prev.map((b) => b.id === blockId ? { ...b, visible: !b.visible } : b));
  }, []);

  // ── Drag & drop ─────────────────────────────────────────────────────────────

  const handleDragStart = useCallback((blockId) => { dragId.current = blockId; }, []);
  const handleDragOver  = useCallback((targetId) => {
    if (!dragId.current || dragId.current === targetId) return;
    setBlocks((prev) => {
      const from = prev.findIndex((b) => b.id === dragId.current);
      const to   = prev.findIndex((b) => b.id === targetId);
      if (from === -1 || to === -1) return prev;
      const next  = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);
  const handleDragEnd = useCallback(() => { dragId.current = null; }, []);

  // ── Template presets ────────────────────────────────────────────────────────

  const applyTemplate = (key) => {
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    if (blocks.length > 0 && !confirm(`Apply "${tpl.name}" template? Current blocks will be replaced.`)) return;
    setBlocks(tpl.blocks.map((b) => ({ ...b, id: uid() })));
    setTemplateType(key);
    setSelected(null);
  };

  // ── AI smart fill ───────────────────────────────────────────────────────────

  const handleSmartFill = () => {
    const prod = products.find((p) => p._id === landingPage?.productId || p.id === landingPage?.productId);
    setGenerating(true);
    setTimeout(() => {
      const newBlocks = [
        { id: uid(), type: "hero",        visible: true, config: { title: prod?.title || landingPage?.title || "عنوان رئيسي", subtitle: prod?.shortDescription || "عرض حصري محدود الوقت", bgImage: (prod?.images || [])[0] || "", buttonText: "اطلب الآن", buttonColor: "#f59e0b", overlayOpacity: 0.6 } },
        { id: uid(), type: "productCard", visible: true, config: { showPrice: true, showRating: true, showDescription: true, showBuyButton: true } },
        { id: uid(), type: "features",    visible: true, config: { title: "لماذا تختار هذا المنتج؟", items: [{ icon: "✓", title: "جودة مضمونة", desc: "منتج أصلي بأعلى معايير الجودة" }, { icon: "🚚", title: "توصيل سريع", desc: "خلال 24-48 ساعة لجميع المدن" }, { icon: "↩", title: "استرداد مجاني", desc: "7 أيام استرداد بدون شروط" }] } },
        { id: uid(), type: "trustBadges", visible: true, config: defaultConfig("trustBadges") },
        { id: uid(), type: "reviews",     visible: true, config: defaultConfig("reviews") },
        { id: uid(), type: "countdown",   visible: true, config: { ...defaultConfig("countdown"), title: "العرض ينتهي قريباً" } },
        { id: uid(), type: "cta",         visible: true, config: { text: prod ? `احصل على ${prod.title} بأفضل سعر!` : "لا تفوّت هذا العرض!", buttonText: "اطلب الآن", buttonColor: "#f59e0b", bgColor: "#fffbeb" } },
      ];
      setBlocks(newBlocks);
      setSelected(null);
      setGenerating(false);
    }, 800);
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/landing-page", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: id, sections: blocks, templateType }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    finally { setSaving(false); }
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const selectedBlock = blocks.find((b) => b.id === selected) || null;

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          <p className="text-sm text-gray-500">Loading builder…</p>
        </div>
      </div>
    );
  }

  if (!landingPage) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] gap-4">
        <p className="text-gray-500 text-sm">Landing page not found.</p>
        <Link href="/admin/landing-pages" className="text-violet-600 text-sm underline">← Back to list</Link>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>

      {/* ── TOP BAR ─────────────────────────────────────────────────────────── */}
      <div className="h-14 bg-white border-b border-gray-200 flex items-center gap-2 px-3 flex-shrink-0 shadow-sm z-10">

        {/* Back */}
        <Link href="/admin/landing-pages"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors mr-1">
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </Link>

        {/* Page title */}
        <div className="h-5 w-px bg-gray-200 mx-1" />
        <span className="text-sm font-semibold text-gray-800 truncate max-w-[120px] sm:max-w-xs">{landingPage.title}</span>

        <div className="flex-1" />

        {/* Template selector */}
        <div className="hidden sm:flex items-center gap-1">
          <span className="text-xs text-gray-400">Template:</span>
          <select value={templateType} onChange={(e) => applyTemplate(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-violet-400">
            <option value="classic">Classic</option>
            <option value="story">Story</option>
            <option value="minimal">Minimal</option>
            <option value="image-heavy">Image Heavy</option>
            <option value="video-first">Video First</option>
          </select>
        </div>

        {/* Smart fill (AI) */}
        <button onClick={handleSmartFill} disabled={generating}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-xl hover:bg-violet-100 transition-colors disabled:opacity-60">
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{generating ? "Generating…" : "Auto-Fill"}</span>
        </button>

        {/* Save as template */}
        <button onClick={() => setShowSaveTpl(true)}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
          <Copy className="w-3.5 h-3.5" /> Save as Template
        </button>

        {/* View toggle */}
        <div className="flex items-center bg-gray-100 rounded-xl p-0.5">
          <button onClick={() => setViewMode("mobile")}
            className={cls("p-1.5 rounded-lg transition-all", viewMode === "mobile" ? "bg-white shadow-sm text-violet-600" : "text-gray-400 hover:text-gray-600")}>
            <Smartphone className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setViewMode("desktop")}
            className={cls("p-1.5 rounded-lg transition-all", viewMode === "desktop" ? "bg-white shadow-sm text-violet-600" : "text-gray-400 hover:text-gray-600")}>
            <Monitor className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Preview */}
        {landingPage.slug && (
          <a href={`/offer/${landingPage.slug}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Preview</span>
          </a>
        )}

        {/* Save */}
        <button onClick={handleSave} disabled={saving}
          className={cls("flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all",
            saved  ? "bg-green-500 text-white" :
            saving ? "bg-violet-400 text-white opacity-70 cursor-not-allowed" :
                     "bg-violet-600 text-white hover:bg-violet-700 shadow-sm")}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{saving ? "Saving…" : saved ? "Saved!" : "Save"}</span>
        </button>
      </div>

      {/* ── MAIN 3-PANEL LAYOUT ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: BLOCK PICKER ─────────────────────────────────────────────── */}
        <div className="w-48 xl:w-52 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0 hidden md:block">
          <BlockPicker onAdd={addBlock} />
        </div>

        {/* ── CENTER: CANVAS ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-gray-100 p-4 xl:p-6">
          <div className={cls(
            "mx-auto transition-all duration-300 ease-in-out",
            viewMode === "mobile" ? "max-w-sm" : "max-w-3xl",
          )}>
            {/* Mobile frame */}
            {viewMode === "mobile" && (
              <div className="bg-gray-800 rounded-[32px] p-2 shadow-2xl mx-auto w-full max-w-[360px]">
                <div className="bg-gray-900 rounded-[8px] h-5 w-20 mx-auto mb-2" />
                <div className="bg-white rounded-[24px] overflow-hidden min-h-[400px] p-3 space-y-0">
                  {blocks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="text-4xl mb-3">📱</div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">Canvas is empty</p>
                      <p className="text-[10px] text-gray-400">Add blocks from the left panel</p>
                    </div>
                  ) : (
                    blocks.map((block) => (
                      <BlockItem
                        key={block.id}
                        block={block}
                        isSelected={selected === block.id}
                        onSelect={() => setSelected(block.id)}
                        onDelete={() => deleteBlock(block.id)}
                        onDuplicate={() => duplicateBlock(block.id)}
                        onToggle={() => toggleVisible(block.id)}
                        isDragOver={dragId.current && dragId.current !== block.id}
                        onDragStart={() => handleDragStart(block.id)}
                        onDragOver={() => handleDragOver(block.id)}
                        onDragEnd={handleDragEnd}
                      />
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Desktop canvas */}
            {viewMode === "desktop" && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 min-h-[500px]">
                {blocks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="text-5xl mb-4">🖥️</div>
                    <p className="text-sm font-semibold text-gray-500 mb-2">No blocks yet</p>
                    <p className="text-xs text-gray-400 mb-4">Add blocks from the left panel or use Auto-Fill</p>
                    <button onClick={handleSmartFill} disabled={generating}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-60">
                      {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                      Auto-Fill from Product
                    </button>
                  </div>
                ) : (
                  <div className="space-y-0">
                    {blocks.map((block) => (
                      <BlockItem
                        key={block.id}
                        block={block}
                        isSelected={selected === block.id}
                        onSelect={() => setSelected(block.id)}
                        onDelete={() => deleteBlock(block.id)}
                        onDuplicate={() => duplicateBlock(block.id)}
                        onToggle={() => toggleVisible(block.id)}
                        isDragOver={dragId.current && dragId.current !== block.id}
                        onDragStart={() => handleDragStart(block.id)}
                        onDragOver={() => handleDragOver(block.id)}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Block count */}
            {blocks.length > 0 && (
              <p className="text-center text-[10px] text-gray-400 mt-3">
                {blocks.length} block{blocks.length !== 1 ? "s" : ""} · {blocks.filter(b => b.visible).length} visible
              </p>
            )}
          </div>
        </div>

        {/* ── RIGHT: SETTINGS ────────────────────────────────────────────────── */}
        <div className="w-64 xl:w-72 bg-white border-l border-gray-200 overflow-hidden flex flex-col flex-shrink-0 hidden md:flex">
          <SettingsPanel
            block={selectedBlock}
            onUpdate={updateBlock}
            landingPage={landingPage}
            products={products}
          />
        </div>
      </div>

      {/* ── MOBILE: Add blocks bottom sheet hint ────────────────────────────── */}
      <div className="md:hidden bg-violet-600 text-white text-xs text-center py-2 px-4 flex-shrink-0">
        Use a desktop browser for the full builder experience.
      </div>

      {/* ── SAVE TEMPLATE DIALOG ────────────────────────────────────────────── */}
      {showSaveTpl && (
        <SaveTemplateDialog
          blocks={blocks}
          templateType={templateType}
          onClose={() => setShowSaveTpl(false)}
        />
      )}
    </div>
  );
}
