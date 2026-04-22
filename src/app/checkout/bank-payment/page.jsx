"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Building2, Upload, Shield,
  MessageCircle, CheckCircle, X, Copy, CreditCard,
} from "lucide-react";

// ── Steps bar (both step 1 and 2 done) ───────────────────────────────────────

function StepsBar() {
  const steps = ["الطلب", "التأكيد", "شكراً"];
  return (
    <div className="flex items-center justify-center mb-8 px-2">
      {steps.map((label, i, arr) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center gap-1 min-w-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0
              ${i < 2
                ? "bg-green-500 text-white"
                : "bg-gray-900 text-white shadow-md"}`}>
              {i < 2 ? "✓" : i + 1}
            </div>
            <span className={`text-[10px] font-semibold whitespace-nowrap
              ${i < 2 ? "text-green-600" : "text-gray-900"}`}>
              {label}
            </span>
          </div>
          {i < arr.length - 1 && (
            <div className={`h-0.5 flex-1 mx-2 mb-4 ${i < 2 ? "bg-green-400" : "bg-gray-200"}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-gray-700" />
      </div>
      <h2 className="font-bold text-gray-900 text-sm">{title}</h2>
    </div>
  );
}

// ── Create invoice (fire-and-forget) ─────────────────────────────────────────

async function createInvoice({
  orderId, cartItems, address, shipping,
  subtotal, shippingCost, promoDiscount, total, deposit, paymentMethod,
}) {
  try {
    const invoiceNumber = "INV-" + Date.now().toString(36).toUpperCase();
    const res = await fetch("/api/invoice", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceNumber,
        orderId,
        customerName:    address?.fullName      || "",
        customerPhone:   address?.phone         || "",
        customerCity:    address?.city          || "",
        shippingCompany: shipping?.name         || "",
        paymentMethod,
        items: cartItems.map((item) => ({
          productId:     item.productId,
          title:         item.title,
          quantity:      item.quantity,
          price:         item.price,
          originalPrice: item.originalPrice || item.price,
          image:         item.image  || "",
          variants:      item.variants || [],
        })),
        subtotal,
        shippingCost,
        promoDiscount: promoDiscount || 0,
        total,
        deposit:       deposit       || 0,
      }),
    });
    const data = await res.json();
    if (data._id) localStorage.setItem("lastInvoiceId", data._id);
  } catch {
    // Non-critical — never block the success redirect
  }
}

// ── Clear checkout localStorage ───────────────────────────────────────────────

function clearCheckoutStorage() {
  [
    "buyNow", "cart", "promoCode", "promoDiscount",
    "selectedShipping", "selectedPaymentMethod", "checkoutAddress",
  ].forEach((key) => {
    try { localStorage.removeItem(key); } catch {}
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BankPaymentPage() {
  const router  = useRouter();
  const fileRef = useRef(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const [address,       setAddress]       = useState(null);
  const [cartItems,     setCartItems]     = useState([]);
  const [shipping,      setShipping]      = useState(null);
  const [bankSettings,  setBankSettings]  = useState(null);
  const [promoDiscount, setPromoDiscount] = useState(0);

  const [screenshot,  setScreenshot]  = useState(null); // base64 string
  const [submitting,  setSubmitting]  = useState(false);
  const [ribCopied,   setRibCopied]   = useState(false);
  const [submitError, setSubmitError] = useState("");

  // ── Load from localStorage + fetch bank settings ──────────────────────────
  useEffect(() => {
    const addr    = localStorage.getItem("checkoutAddress");
    const ship    = localStorage.getItem("selectedShipping");
    const method  = localStorage.getItem("selectedPaymentMethod");

    // Guard — all three keys must exist
    if (!addr || !ship || !method) {
      router.push("/checkout/address");
      return;
    }

    try {
      setAddress(JSON.parse(addr));
      setShipping(JSON.parse(ship));
    } catch {
      router.push("/checkout/address");
      return;
    }

    setCartItems(JSON.parse(localStorage.getItem("buyNow") || "[]"));

    // Promo discount saved by step 1
    try {
      const pd = localStorage.getItem("promoDiscount");
      if (pd) setPromoDiscount(JSON.parse(pd).discountAmount || 0);
    } catch {}

    // Bank details — try new bank-settings key first, fall back to legacy bank-payment
    fetch("/api/setting?type=bank-settings")
      .then((r) => r.json())
      .then((data) => {
        // If the new key has data use it, otherwise fall back to old key
        if (data && (data.bankName || data.rib || data.accountName)) {
          setBankSettings(data);
        } else {
          return fetch("/api/setting?type=bank-payment")
            .then((r) => r.json())
            .then((legacy) => setBankSettings(legacy));
        }
      })
      .catch(() => {});
  }, [router]);

  // ── Derived totals ─────────────────────────────────────────────────────────
  const subtotal     = cartItems.reduce((s, i) => s + i.price * (i.quantity || 1), 0);
  const shippingCost = shipping ? (shipping.isFree ? 0 : parseFloat(shipping.price) || 0) : 0;
  const total        = subtotal + shippingCost - promoDiscount;
  const deposit      = shipping?.paymentType === "cod_deposit"
                         ? parseFloat(shipping.deposit) || 0
                         : 0;
  const remaining    = shipping?.paymentType === "cod_deposit"
                         ? Math.max(0, total - deposit)
                         : 0;
  const amountToPayNow = shipping?.paymentType === "cod_deposit" ? deposit : total;

  // ── Image upload helpers ───────────────────────────────────────────────────
  const readFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => setScreenshot(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  const copyRIB = () => {
    const rib = displayInfo?.rib;
    if (!rib) return;
    navigator.clipboard.writeText(rib).then(() => {
      setRibCopied(true);
      setTimeout(() => setRibCopied(false), 2500);
    });
  };

  // Resolve displayed bank info (supports both old flat shape and new methods[] shape)
  const bankInfo = (() => {
    if (!bankSettings) return null;
    if (Array.isArray(bankSettings.methods) && bankSettings.methods.length > 0) {
      // Use the selected payment method if stored, otherwise first enabled method
      try {
        const sel = JSON.parse(localStorage.getItem("selectedPaymentMethod") || "null");
        if (sel) {
          const match = bankSettings.methods.find((m) => m.id === sel.id);
          if (match) return match;
        }
      } catch {}
      return bankSettings.methods.find((m) => m.isActive !== false && m.enabled !== false) || bankSettings.methods[0];
    }
    // Legacy flat shape
    return bankSettings;
  })();

  // Normalize to a consistent display shape regardless of old/new format
  const displayInfo = bankInfo ? {
    id:          bankInfo.id          || null,
    bankName:    bankInfo.bankName    || bankInfo.name         || "",
    accountName: bankInfo.accountName || "",
    rib:         bankInfo.rib         || "",
    swift:       bankInfo.swift       || "",
    logo:        bankInfo.logo        || "",
    notes:       bankInfo.notes       || bankInfo.instructions || "",
    whatsapp:    bankInfo.whatsapp    || "",
  } : null;

  // ── Order submission ───────────────────────────────────────────────────────
  const handlePay = async () => {
    if (!screenshot) {
      setSubmitError("يرجى رفع صورة إثبات التحويل البنكي أولاً");
      return;
    }
    setSubmitError("");
    setSubmitting(true);

    try {
      // Read affiliate attribution from localStorage
      const affiliateId  = localStorage.getItem("affiliateId")  || null;
      const affiliateRef = localStorage.getItem("affiliateRef") || null;

      const paymentMethod = shipping?.paymentType === "cod_deposit"
        ? "cod_deposit"
        : "bank_transfer";

      const payload = {
        name:  address.fullName,
        email: address.email || "",
        phone: address.phone,
        affiliateId,
        shipping: {
          address: {
            city:     address.city,
            address1: address.address || address.city,
          },
          name:  address.fullName,
          phone: address.phone,
        },
        products: {
          items: cartItems.map((item) => ({
            productId:    item.productId,
            title:        item.title,
            quantity:     item.quantity,
            price:        item.price,
            sellingPrice: item.price,
            images:       item.image ? [item.image] : [],
          })),
        },
        paymentDetails: {
          paymentMethod,
          paymentType:         paymentMethod,
          paymentMethodId:     displayInfo?.id          || null,
          bankName:            displayInfo?.bankName    || "",
          rib:                 displayInfo?.rib         || "",
          amountPaid:          amountToPayNow,
          shippingCompany:     shipping?.name || "",
          shippingCost,
          subtotal,
          promoDiscount,
          total,
          deposit,
          remainingOnDelivery: remaining,
          bankScreenshot:      screenshot,
          status:              "pending",
          paymentStatus:       "pending",
        },
        status:    "pending",
        sessionId: Date.now().toString(),
      };

      const res = await fetch("/api/order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        setSubmitError("حدث خطأ أثناء إرسال الطلب. يرجى المحاولة مرة أخرى.");
        return;
      }

      const order = await res.json();

      // Affiliate order recording (fire-and-forget)
      try {
        if (affiliateRef || affiliateId) {
          console.log("[Affiliate] Recording order | orderId:", order._id, "| affiliateId:", affiliateId, "| ref:", affiliateRef);
          fetch("/api/affiliate/record-order", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              username:     affiliateRef,
              affiliateId,
              orderId:      order._id,
              clientName:   address.fullName,
              clientPhone:  address.phone || "",
              productTitle: cartItems[0]?.title || "",
              total,
            }),
          }).catch(() => {});
        }
      } catch {}

      // 1️⃣ Save order IDs
      localStorage.setItem("lastOrderId", order._id);
      try {
        localStorage.setItem("lastOrderData", JSON.stringify({
          _id:    order._id,
          name:   payload.name,
          phone:  payload.phone,
          status: "pending",
          paymentDetails: { ...payload.paymentDetails, bankScreenshot: undefined },
        }));
      } catch { /* storage full — omit */ }

      // 2️⃣ Spin wheel — mark promo as ordered (fire-and-forget)
      try {
        const pc = localStorage.getItem("promoCode");
        if (pc) {
          const { code } = JSON.parse(pc);
          if (code) {
            fetch("/api/spin-wheel", {
              method:  "PATCH",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ promoCode: code, orderId: order._id }),
            }).catch(() => {});
          }
        }
      } catch {}

      // 3️⃣ Create invoice
      await createInvoice({
        orderId: order._id,
        cartItems, address, shipping,
        subtotal, shippingCost, promoDiscount, total,
        deposit,
        paymentMethod,
      });

      // 4️⃣ Clear checkout storage
      clearCheckoutStorage();

      // 5️⃣ Navigate to success
      router.push(`/checkout/success?orderId=${order._id}`);
    } catch (err) {
      console.error("Bank payment order error:", err);
      setSubmitError("حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading guard ─────────────────────────────────────────────────────────
  if (!address || !shipping) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-8 h-8 border-[3px] border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push("/checkout/confirm")}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" /> رجوع
          </button>
          <span className="text-sm font-bold text-gray-900">الدفع البنكي</span>
          <div className="w-16" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        <StepsBar />

        {/* ── Amount banner ── */}
        <div className="bg-gray-900 rounded-2xl p-5 mb-5 text-white text-center shadow-lg shadow-gray-900/20">
          <p className="text-sm font-medium opacity-70 mb-1">
            {shipping.paymentType === "cod_deposit"
              ? "مبلغ العربون الواجب تحويله الآن"
              : "المبلغ الكامل الواجب تحويله"}
          </p>
          <p className="text-4xl font-black">
            {amountToPayNow.toFixed(0)} <span className="text-2xl">درهم</span>
          </p>
          {promoDiscount > 0 && (
            <p className="text-xs mt-1 opacity-70">شامل خصم {promoDiscount.toFixed(0)} درهم ✓</p>
          )}
          {shipping.paymentType === "cod_deposit" && (
            <div className="mt-3 pt-3 border-t border-white/15 text-sm text-center">
              <span className="opacity-80">
                الباقي عند الاستلام:{" "}
                <strong className="font-black opacity-100">{remaining.toFixed(0)} درهم</strong>
              </span>
            </div>
          )}
        </div>

        {/* ── Bank details card ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <SectionHeader icon={Building2} title="معلومات الحساب البنكي" />
          <div className="p-5">
            {!displayInfo ? (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-0">
                {/* Logo (if available) */}
                {displayInfo.logo && (
                  <div className="flex items-center gap-3 py-3 border-b border-gray-50">
                    <img
                      src={displayInfo.logo}
                      alt={displayInfo.bankName}
                      className="h-10 w-auto object-contain rounded-lg"
                    />
                    {displayInfo.bankName && (
                      <span className="text-sm font-bold text-gray-900">{displayInfo.bankName}</span>
                    )}
                  </div>
                )}

                {[
                  { label: "اسم البنك",      value: displayInfo.logo ? null : displayInfo.bankName },
                  { label: "صاحب الحساب",    value: displayInfo.accountName },
                ].map(({ label, value }) =>
                  value ? (
                    <div key={label} className="flex items-center justify-between py-3 border-b border-gray-50">
                      <span className="text-xs text-gray-400 font-medium">{label}</span>
                      <span className="text-sm font-bold text-gray-900">{value}</span>
                    </div>
                  ) : null,
                )}

                {/* RIB with copy button */}
                {displayInfo.rib && (
                  <div className="flex items-center justify-between py-3 border-b border-gray-50">
                    <span className="text-xs text-gray-400 font-medium">رقم الحساب / RIB</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold text-gray-900 break-all text-right max-w-[160px]">
                        {displayInfo.rib}
                      </span>
                      <button
                        onClick={copyRIB}
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-semibold transition-all shrink-0
                          ${ribCopied
                            ? "bg-green-100 text-green-600"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                        {ribCopied
                          ? <><CheckCircle className="w-3 h-3" /> تم!</>
                          : <><Copy className="w-3 h-3" /> نسخ</>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Notes / instructions — card styled like a button */}
                {displayInfo.notes && (
                  <div className="mt-3 p-3 bg-gray-900 rounded-xl border border-gray-800">
                    <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-line">{displayInfo.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── COD deposit instructions (if applicable) ── */}
        {shipping.paymentType === "cod_deposit" && bankSettings?.depositInstructions && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-4 flex gap-3">
            <div className="text-amber-600 mt-0.5 shrink-0 text-base">ℹ️</div>
            <div>
              <p className="text-xs font-bold text-amber-800 mb-1">تعليمات الدفع</p>
              <p className="text-xs text-amber-700 leading-relaxed whitespace-pre-line">
                {bankSettings.depositInstructions}
              </p>
            </div>
          </div>
        )}

        {/* ── Screenshot upload ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <SectionHeader icon={Upload} title="رفع إثبات التحويل" />
          <div className="p-5">
            {!screenshot ? (
              /* Drop zone */
              <div
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all group">
                <div className="w-12 h-12 rounded-full bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center mb-3 transition-colors">
                  <Upload className="w-5 h-5 text-gray-400 group-hover:text-gray-700 transition-colors" />
                </div>
                <p className="text-sm font-semibold text-gray-600 group-hover:text-gray-900 transition-colors">
                  اضغط لرفع صورة التحويل
                </p>
                <p className="text-xs text-gray-400 mt-1">أو اسحب الصورة هنا</p>
                <p className="text-xs text-gray-300 mt-0.5">JPG · PNG · WEBP</p>
              </div>
            ) : (
              /* Preview */
              <div className="relative rounded-2xl overflow-hidden border border-gray-200">
                <img
                  src={screenshot}
                  alt="إثبات التحويل"
                  className="w-full max-h-72 object-contain bg-gray-50"
                />
                {/* Remove button */}
                <button
                  onClick={() => { setScreenshot(null); setSubmitError(""); }}
                  className="absolute top-3 right-3 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
                {/* Uploaded badge */}
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-green-500 text-white text-xs px-2.5 py-1 rounded-full font-semibold">
                  <CheckCircle className="w-3 h-3" /> تم رفع الصورة
                </div>
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => readFile(e.target.files?.[0])}
            />
          </div>
        </div>

        {/* ── Submit error ── */}
        {submitError && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
            ⚠ {submitError}
          </div>
        )}

        {/* ── Pay now button ── */}
        <button
          onClick={handlePay}
          disabled={submitting || !screenshot}
          className="w-full bg-gray-900 hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all shadow-lg mb-3">
          {submitting ? (
            <>
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              جاري المعالجة...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" /> تأكيد الدفع الآن
            </>
          )}
        </button>

        {/* ── WhatsApp support link ── */}
        {displayInfo?.whatsapp && (
          <a
            href={`https://wa.me/${displayInfo.whatsapp.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-green-400 text-green-600 rounded-2xl font-bold text-sm hover:bg-green-50 active:scale-[0.98] transition-all mb-4">
            <MessageCircle className="w-4 h-4" /> راسلنا على واتساب قبل الدفع
          </a>
        )}

        {/* ── Security note ── */}
        <div className="flex items-center justify-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-gray-400" />
          <p className="text-center text-xs text-gray-400">معلوماتك محمية وآمنة تماماً</p>
        </div>
      </div>
    </div>
  );
}
