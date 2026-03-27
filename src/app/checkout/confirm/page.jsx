"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import {
  ArrowLeft, Building2, Copy, CheckCircle, Upload,
  X, Shield, CreditCard, Zap, MessageCircle,
} from "lucide-react";

// ── Steps bar — step 3 active ─────────────────────────────────────────────────

function StepsBar() {
  const { t } = useLanguage();
  const steps = [t("checkout_step_order"), t("checkout_step_payment"), t("checkout_step_confirm")];
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createInvoice({ orderId, cartItems, address, shipping, subtotal, shippingCost, promoDiscount, total, deposit, paymentMethod }) {
  try {
    const res = await fetch("/api/invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceNumber:   "INV-" + Date.now().toString(36).toUpperCase(),
        orderId,
        customerName:    address?.fullName || "",
        customerPhone:   address?.phone    || "",
        customerCity:    address?.city     || "",
        shippingCompany: shipping?.name    || "",
        paymentMethod,
        items: cartItems.map(item => ({
          productId:     item.productId,
          title:         item.title,
          quantity:      item.quantity,
          price:         item.price,
          originalPrice: item.originalPrice || item.price,
          image:         item.image  || "",
          color:         item.color  || "",
          size:          item.size   || "",
        })),
        subtotal, shippingCost, promoDiscount: promoDiscount || 0, total, deposit: deposit || 0,
      }),
    });
    const data = await res.json();
    if (data._id) localStorage.setItem("lastInvoiceId", data._id);
  } catch {}
}

function clearCheckoutStorage() {
  ["buyNow","cart","promoCode","promoDiscount","selectedShipping","selectedPaymentMethod","checkoutAddress"].forEach(k => {
    try { localStorage.removeItem(k); } catch {}
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ConfirmPage() {
  const router  = useRouter();
  const fileRef = useRef(null);
  const { t, formatPrice } = useLanguage();

  // ── State ──────────────────────────────────────────────────────────────────
  const [address,      setAddress]      = useState(null);
  const [cartItems,    setCartItems]    = useState([]);
  const [shipping,     setShipping]     = useState(null);
  const [promoDiscount,setPromoDiscount]= useState(0);

  const [bankInfo,     setBankInfo]     = useState(null);  // resolved method from DB
  const [screenshot,   setScreenshot]   = useState(null);
  const [isInstant,    setIsInstant]    = useState(false);
  const [ribCopied,    setRibCopied]    = useState(false);
  const [acctCopied,   setAcctCopied]   = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState("");

  // ── Load + resolve bank info ───────────────────────────────────────────────
  useEffect(() => {
    const addr  = localStorage.getItem("checkoutAddress");
    const ship  = localStorage.getItem("selectedShipping");
    const selPM = localStorage.getItem("selectedPaymentMethod");

    if (!addr || !ship) { router.replace("/checkout/address"); return; }
    if (!selPM)         { router.replace("/checkout/payment"); return; }

    let parsedAddr, parsedShip, parsedMethod;
    try {
      parsedAddr   = JSON.parse(addr);
      parsedShip   = JSON.parse(ship);
      parsedMethod = JSON.parse(selPM);
    } catch {
      router.replace("/checkout/address"); return;
    }

    setAddress(parsedAddr);
    setShipping(parsedShip);
    setCartItems(JSON.parse(localStorage.getItem("buyNow") || "[]"));

    try {
      const pd = localStorage.getItem("promoDiscount");
      if (pd) setPromoDiscount(JSON.parse(pd).discountAmount || 0);
    } catch {}

    // ── Fetch fresh bank data from DB using paymentMethodId ──────────────────
    // This fixes the bug where bank data from admin was not displayed.
    fetch("/api/setting?type=bank-settings")
      .then(r => r.json())
      .then(data => {
        const methods = Array.isArray(data?.methods) ? data.methods : [];
        // Find by id — the source of truth is the DB, not localStorage
        const found = parsedMethod?.id
          ? methods.find(m => m.id === parsedMethod.id)
          : null;
        // Use DB data if found; fall back to localStorage data
        setBankInfo(found || parsedMethod || null);
      })
      .catch(() => {
        setBankInfo(parsedMethod || null);
      });
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
  const amountNow    = shipping?.paymentType === "cod_deposit" ? deposit : total;

  // ── Copy RIB ──────────────────────────────────────────────────────────────
  const copyRIB = () => {
    if (!bankInfo?.rib) return;
    navigator.clipboard.writeText(bankInfo.rib).then(() => {
      setRibCopied(true);
      setTimeout(() => setRibCopied(false), 2500);
    });
  };

  // ── Copy Account Number ───────────────────────────────────────────────────
  const copyAcct = () => {
    if (!bankInfo?.accountNumber) return;
    navigator.clipboard.writeText(bankInfo.accountNumber).then(() => {
      setAcctCopied(true);
      setTimeout(() => setAcctCopied(false), 2500);
    });
  };

  // ── Screenshot upload ─────────────────────────────────────────────────────
  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => setScreenshot(e.target.result);
    reader.readAsDataURL(file);
  };

  // ── Submit order ──────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!screenshot) {
      setSubmitError(t("checkout_upload_required"));
      return;
    }
    setSubmitError("");
    setSubmitting(true);

    try {
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
          address: { city: address.city, address1: address.address || address.city },
          name:  address.fullName,
          phone: address.phone,
        },
        products: {
          items: cartItems.map(item => ({
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
          paymentMethodId:     bankInfo?.id          || null,
          bankName:            bankInfo?.name        || bankInfo?.bankName || "",
          rib:                 bankInfo?.rib          || "",
          amountPaid:          amountNow,
          isInstantTransfer:   isInstant,
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setSubmitError(t("checkout_error_submit"));
        return;
      }

      const order = await res.json();

      // Click tracking — last-click attribution conversion (fire-and-forget)
      try {
        const _gc = (n) => document.cookie.split(";").map(c => c.trim())
          .find(c => c.startsWith(n + "="))?.split("=")[1];
        // last_click_id = last-click attribution (always wins)
        const _cid =
          localStorage.getItem("last_click_id") || _gc("last_click_id") ||
          localStorage.getItem("click_id")       || _gc("click_id");
        if (_cid) {
          fetch("/api/tracking/conversion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clickId: _cid, orderId: order._id, revenue: total }),
          }).catch(() => {});
        }
      } catch {}

      // Affiliate (fire-and-forget)
      try {
        if (affiliateRef || affiliateId) {
          fetch("/api/affiliate/record-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: affiliateRef, affiliateId, orderId: order._id,
              clientName: address.fullName, clientPhone: address.phone || "",
              productTitle: cartItems[0]?.title || "", total,
            }),
          }).catch(() => {});
        }
      } catch {}

      // Spin wheel (fire-and-forget)
      try {
        const pc = localStorage.getItem("promoCode");
        if (pc) {
          const { code } = JSON.parse(pc);
          if (code) fetch("/api/spin-wheel", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ promoCode: code, orderId: order._id }),
          }).catch(() => {});
        }
      } catch {}

      localStorage.setItem("lastOrderId", order._id);
      try {
        localStorage.setItem("lastOrderData", JSON.stringify({
          _id: order._id, name: payload.name, phone: payload.phone,
          status: "pending",
          paymentDetails: { ...payload.paymentDetails, bankScreenshot: undefined },
        }));
      } catch {}

      await createInvoice({
        orderId: order._id, cartItems, address, shipping,
        subtotal, shippingCost, promoDiscount, total, deposit, paymentMethod,
      });

      clearCheckoutStorage();
      router.push(`/checkout/success?orderId=${order._id}`);
    } catch (err) {
      console.error("Confirm payment error:", err);
      setSubmitError(t("checkout_error_unexpected"));
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

      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push("/checkout/payment")}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t("checkout_back")}
          </button>
          <span className="text-sm font-bold text-gray-900">{t("checkout_confirm_title")}</span>
          <div className="w-16" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <StepsBar />

        {/* ── Amount banner ── */}
        <div className="bg-gray-900 rounded-2xl p-5 text-white text-center shadow-lg shadow-gray-900/20">
          <p className="text-xs font-medium opacity-60 mb-1">
            {shipping.paymentType === "cod_deposit" ? t("checkout_deposit_amount_label") : t("checkout_full_transfer_label")}
          </p>
          <p className="text-4xl font-black">{formatPrice(amountNow.toFixed(0))}</p>
          {promoDiscount > 0 && (
            <p className="text-xs mt-1 opacity-70">{t("checkout_discount_included")} {formatPrice(promoDiscount.toFixed(0))} ✓</p>
          )}
          {shipping.paymentType === "cod_deposit" && (
            <div className="mt-3 pt-3 border-t border-white/15 text-sm">
              <span className="opacity-80">{t("checkout_remaining_delivery2")} </span>
              <strong className="font-black">{formatPrice(remaining.toFixed(0))}</strong>
            </div>
          )}
        </div>

        {/* ── Bank details card ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
              <Building2 className="w-3.5 h-3.5 text-gray-700" />
            </div>
            <h2 className="font-bold text-gray-900 text-sm">{t("checkout_bank_info")}</h2>
          </div>

          <div className="p-5">
            {!bankInfo ? (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-gray-200 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-0">
                {/* Logo row */}
                {bankInfo.logo && (
                  <div className="flex items-center gap-3 pb-3 mb-1 border-b border-gray-50">
                    <img
                      src={bankInfo.logo}
                      alt={bankInfo.name || bankInfo.bankName}
                      className="h-10 w-auto max-w-[100px] object-contain rounded-lg"
                    />
                    <span className="text-sm font-bold text-gray-900">
                      {bankInfo.name || bankInfo.bankName}
                    </span>
                  </div>
                )}

                {/* Fields */}
                {[
                  {
                    label: t("checkout_bank_name"),
                    value: bankInfo.logo ? null : (bankInfo.name || bankInfo.bankName),
                  },
                  {
                    label: t("checkout_account_holder"),
                    value: bankInfo.accountName,
                  },
                ].map(({ label, value }) =>
                  value ? (
                    <div key={label} dir="rtl" className="flex items-center justify-between py-3 border-b border-gray-50">
                      <span className="text-xs text-gray-400 font-medium">{label}</span>
                      <span className="text-sm font-bold text-gray-900">{value}</span>
                    </div>
                  ) : null
                )}

                {/* RIB with copy */}
                {bankInfo.rib && (
                  <div dir="rtl" className="flex items-center justify-between gap-2 py-3 border-b border-gray-50">
                    {/* RIGHT: label + copy button */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-gray-400 font-medium">RIB</span>
                      <button
                        onClick={copyRIB}
                        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-semibold transition-all
                          ${ribCopied
                            ? "bg-green-100 text-green-600"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                        {ribCopied
                          ? <><CheckCircle className="w-3 h-3" /> {t("checkout_copied")}</>
                          : <><Copy className="w-3 h-3" /> {t("checkout_copy")}</>}
                      </button>
                    </div>
                    {/* LEFT: value */}
                    <span className="text-sm font-mono font-bold text-gray-900 flex-1 text-left leading-relaxed" style={{ wordBreak: "break-all" }}>
                      {bankInfo.rib}
                    </span>
                  </div>
                )}

                {/* Account Number with copy */}
                {bankInfo.accountNumber && (
                  <div dir="rtl" className="flex items-center justify-between gap-2 py-3 border-b border-gray-50">
                    {/* RIGHT: label + copy button */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-gray-400 font-medium">{t("checkout_account_number")}</span>
                      <button
                        onClick={copyAcct}
                        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-semibold transition-all
                          ${acctCopied
                            ? "bg-green-100 text-green-600"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                        {acctCopied
                          ? <><CheckCircle className="w-3 h-3" /> {t("checkout_copied")}</>
                          : <><Copy className="w-3 h-3" /> {t("checkout_copy")}</>}
                      </button>
                    </div>
                    {/* LEFT: value */}
                    <span className="text-sm font-mono font-bold text-gray-900 flex-1 text-left leading-relaxed" style={{ wordBreak: "break-all" }}>
                      {bankInfo.accountNumber}
                    </span>
                  </div>
                )}

                {/* SWIFT */}
                {bankInfo.swift && (
                  <div dir="rtl" className="flex items-center justify-between py-3">
                    <span className="text-xs text-gray-400 font-medium">SWIFT / BIC</span>
                    <span className="text-sm font-mono font-bold text-gray-900">{bankInfo.swift}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Instructions — card styled like a button ── */}
        {bankInfo?.instructions && (
          <div className="bg-gray-900 rounded-2xl px-5 py-4 border border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t("checkout_payment_instructions")}</p>
            </div>
            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">
              {bankInfo.instructions}
            </p>
          </div>
        )}

        {/* Global deposit instructions (from bank-settings, only for cod_deposit) */}
        {shipping.paymentType === "cod_deposit" && bankInfo?.depositInstructions && (
          <div className="bg-gray-900 rounded-2xl px-5 py-4 border border-gray-800">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{t("checkout_deposit_instructions")}</p>
            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">
              {bankInfo.depositInstructions}
            </p>
          </div>
        )}

        {/* ── Instant transfer checkbox ── */}
        <button
          onClick={() => setIsInstant(v => !v)}
          className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all text-right
            ${isInstant
              ? "border-gray-900 bg-gray-900 text-white"
              : "border-gray-100 bg-white hover:border-gray-200 text-gray-700"}`}>
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all
            ${isInstant ? "border-white bg-white" : "border-gray-300"}`}>
            {isInstant && <CheckCircle className="w-3.5 h-3.5 text-gray-900" />}
          </div>
          <Zap className={`w-4 h-4 shrink-0 ${isInstant ? "text-yellow-400" : "text-gray-400"}`} />
          <span className="font-bold text-sm">{t("checkout_instant_transfer")}</span>
          <span className={`text-xs mr-auto ${isInstant ? "text-white/60" : "text-gray-400"}`}>
            {t("checkout_instant_fast")}
          </span>
        </button>

        {/* ── Upload receipt ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
              <Upload className="w-3.5 h-3.5 text-gray-700" />
            </div>
            <h2 className="font-bold text-gray-900 text-sm">{t("checkout_upload_proof")}</h2>
          </div>
          <div className="p-5">
            {!screenshot ? (
              <div
                onClick={() => fileRef.current?.click()}
                onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
                onDragOver={e => e.preventDefault()}
                className="flex flex-col items-center justify-center h-36 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all group">
                <div className="w-12 h-12 rounded-full bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center mb-2.5 transition-colors">
                  <Upload className="w-5 h-5 text-gray-400 group-hover:text-gray-700 transition-colors" />
                </div>
                <p className="text-sm font-semibold text-gray-600 group-hover:text-gray-900 transition-colors">
                  {t("checkout_upload_click")}
                </p>
                <p className="text-xs text-gray-400 mt-1">{t("checkout_upload_drag")}</p>
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden border border-gray-200">
                <img src={screenshot} alt="إثبات التحويل" className="w-full max-h-64 object-contain bg-gray-50" />
                <button
                  onClick={() => { setScreenshot(null); setSubmitError(""); }}
                  className="absolute top-3 right-3 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-green-500 text-white text-xs px-2.5 py-1 rounded-full font-semibold">
                  <CheckCircle className="w-3 h-3" /> {t("checkout_uploaded")}
                </div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0])}
            />
          </div>
        </div>

        {/* Submit error */}
        {submitError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
            ⚠ {submitError}
          </div>
        )}

        {/* ── Submit button ── */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !screenshot}
          className="w-full bg-gray-900 hover:bg-gray-800 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all shadow-lg">
          {submitting ? (
            <>
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {t("checkout_processing")}
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" /> {t("checkout_confirm_payment_btn")}
            </>
          )}
        </button>

        {/* WhatsApp message button — only if admin enabled it */}
        {bankInfo?.enableMessageBeforePayment && bankInfo?.whatsapp && (
          <a
            href={`https://wa.me/${bankInfo.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("أريد تأكيد معلومات الدفع")}`}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-2 py-4 border-2 border-green-400 text-green-600 rounded-2xl font-black text-base hover:bg-green-50 active:scale-[0.98] transition-all">
            <MessageCircle className="w-5 h-5" /> {t("checkout_whatsapp_btn")}
          </a>
        )}

        {/* Security note */}
        <div className="flex items-center justify-center gap-1.5 pb-4">
          <Shield className="w-3.5 h-3.5 text-gray-400" />
          <p className="text-xs text-gray-400">{t("checkout_security")}</p>
        </div>
      </div>
    </div>
  );
}
