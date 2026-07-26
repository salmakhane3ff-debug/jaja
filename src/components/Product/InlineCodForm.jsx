"use client";

/**
 * src/components/Product/InlineCodForm.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The inline COD order form — the SAME UX used by landing pages, now shared so
 * the product page can embed it too (no duplicated form / order logic). It posts
 * to the existing /api/order pipeline via the pure buildCodOrderPayload, and
 * fires the existing affiliate-recording call. Optional props let the product
 * page pass the selected quantity / variants / price and mark orderSource.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useEffect } from "react";
import { Zap } from "lucide-react";
import { resolveClickId } from "@/lib/tracking/clickId";
import { buildCodOrderPayload, validateCodForm } from "@/lib/codOrder";

function imgSrc(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v.url || v.src || "";
}

export default function InlineCodForm({
  product,
  cfg = {},
  landingPage = null,
  quantity = 1,
  variant = null,
  price = null,
  orderSource = "landing",
  // Bump this counter (from the product page's Buy Now) to focus the first field
  // and play a subtle highlight so the customer immediately notices the form.
  focusSignal = 0,
}) {
  const [form,   setForm]   = useState({ name: "", phone: "", city: "", address: "" });
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const nameRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!focusSignal) return; // landing usage never signals → no focus/animation
    nameRef.current?.focus({ preventScroll: true });
    const card = cardRef.current;
    if (card) {
      // Restart the CSS animation without remounting (which would reset inputs).
      card.style.animation = "none";
      // eslint-disable-next-line no-unused-expressions
      card.offsetWidth; // force reflow
      card.style.animation = "codAttn 1.3s ease-out";
    }
  }, [focusSignal]);

  const submit = async (e) => {
    e.preventDefault();
    if (!validateCodForm(form).valid) return;
    setStatus("submitting");
    try {
      const prefix    = orderSource === "product" ? "pp" : "lp";
      const sessionId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Reuse the same attribution/tracking the working checkout relies on.
      const affiliateId  = (() => { try { return localStorage.getItem("affiliateId")  || null; } catch { return null; } })();
      const affiliateRef = (() => { try { return localStorage.getItem("affiliateRef") || null; } catch { return null; } })();
      const images = (product?.images || []).map(imgSrc).filter(Boolean);

      const payload = buildCodOrderPayload({
        product, form, quantity, variant, price, orderSource, landingPage,
        sessionId, bemobClickId: resolveClickId(), affiliateId, images,
      });

      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        // Affiliate recording — identical fire-and-forget flow as landing/checkout.
        try {
          const created = await res.json();
          const orderId = created?._id || created?.id || null;
          if (affiliateRef || affiliateId) {
            fetch("/api/affiliate/record-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                username: affiliateRef, affiliateId, orderId,
                clientName: form.name.trim(), clientPhone: form.phone.trim() || "",
                productTitle: product?.title || "", total: payload.paymentDetails.total,
              }),
            }).catch(() => {});
          }
        } catch {}
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="px-4 py-3">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center space-y-3">
          <div className="text-4xl">🎉</div>
          <p className="text-base font-black text-green-700">
            {cfg.successMessage || "تم استلام طلبك بنجاح!"}
          </p>
          <p className="text-sm text-green-600">سنتصل بك قريباً لتأكيد الطلب.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <style>{`@keyframes codAttn {
        0%   { box-shadow: 0 0 0 0 rgba(251,191,36,0); }
        20%  { box-shadow: 0 0 0 4px rgba(251,191,36,0.55); }
        100% { box-shadow: 0 0 0 0 rgba(251,191,36,0); }
      }`}</style>
      <div ref={cardRef} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">📦 أكمل طلبك الآن</p>
        <form onSubmit={submit} className="space-y-3" dir="rtl">
          <input ref={nameRef} required value={form.name} onChange={(e) => setF("name", e.target.value)}
            placeholder="الاسم الكامل *"
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 bg-gray-50" />
          <input required type="tel" value={form.phone} onChange={(e) => setF("phone", e.target.value)}
            placeholder="رقم الهاتف *"
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 bg-gray-50" />
          <input value={form.city} onChange={(e) => setF("city", e.target.value)}
            placeholder="المدينة"
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 bg-gray-50" />
          {cfg.showAddress !== false && (
            <input value={form.address} onChange={(e) => setF("address", e.target.value)}
              placeholder="العنوان التفصيلي"
              className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 bg-gray-50" />
          )}
          {status === "error" && (
            <p className="text-xs text-red-500 text-center">حدث خطأ، يرجى المحاولة مرة أخرى.</p>
          )}
          <button type="submit" disabled={status === "submitting"}
            className="w-full flex items-center justify-center gap-2 py-4 bg-amber-400 hover:bg-amber-500 active:scale-[0.98] text-white rounded-2xl font-black text-base transition-all shadow-lg shadow-amber-200 disabled:opacity-70">
            <Zap className="w-5 h-5" />
            {status === "submitting" ? "جارٍ الإرسال…" : (cfg.buttonText || "اطلب الآن")}
          </button>
        </form>
      </div>
    </div>
  );
}
