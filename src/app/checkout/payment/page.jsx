"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import FunnelTracker from "@/components/tracking/FunnelTracker";
import { useLanguage } from "@/context/LanguageContext";
import {
  ArrowLeft, Building2, Package, CheckCircle,
  Shield, ChevronLeft, Loader2, Ban, AlertTriangle, CreditCard,
} from "lucide-react";

// ── Steps bar — step 2 active ─────────────────────────────────────────────────

function StepsBar() {
  const { t } = useLanguage();
  const steps = [t("checkout_step_order"), t("checkout_step_payment"), t("checkout_step_thanks")];
  return (
    <div className="flex items-center justify-center mb-8 px-2">
      {steps.map((label, i, arr) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center gap-1 min-w-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0
              ${i === 0
                ? "bg-green-500 text-white"
                : i === 1
                  ? "bg-gray-900 text-white shadow-md"
                  : "bg-gray-100 text-gray-400"}`}>
              {i === 0 ? "✓" : i + 1}
            </div>
            <span className={`text-[10px] font-semibold whitespace-nowrap
              ${i === 0 ? "text-green-600" : i === 1 ? "text-gray-900" : "text-gray-400"}`}>
              {label}
            </span>
          </div>
          {i < arr.length - 1 && (
            <div className={`h-0.5 flex-1 mx-2 mb-4 ${i < 1 ? "bg-green-400" : "bg-gray-200"}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Payment method card — supports disabled state ─────────────────────────────

function MethodCard({ method, selected, onClick, disabled }) {
  const isSelected = !disabled && selected?.id === method.id;

  return (
    <div className={`transition-opacity duration-150 ${disabled ? "opacity-40" : ""}`}>
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border-2 transition-all duration-150
          ${disabled
            ? "cursor-not-allowed border-gray-100 bg-white"
            : isSelected
              ? "border-gray-900 bg-gray-900 shadow-lg"
              : "border-gray-100 bg-white hover:border-gray-300 hover:shadow-md shadow-sm cursor-pointer"
          }`}
      >
        <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden
          ${isSelected ? "bg-white/15" : "bg-gray-50 border border-gray-100"}`}>
          {method.logo ? (
            <img src={method.logo} alt={method.name} className="w-full h-full object-contain p-1.5" />
          ) : (
            <Building2 className={`w-5 h-5 ${isSelected ? "text-white" : "text-gray-400"}`} />
          )}
        </div>
        <span className={`flex-1 text-right font-bold text-base ${isSelected ? "text-white" : "text-gray-900"}`}>
          {method.name}
        </span>
        <div className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all
          ${isSelected ? "border-white bg-white" : "border-gray-200 bg-transparent"}`}>
          {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-gray-900" />}
        </div>
      </button>

      {/* Unavailable label — shown only when disabled */}
      {disabled && (
        <p className="text-center text-xs text-gray-400 mt-1.5 flex items-center justify-center gap-1">
          <Ban className="w-3 h-3" />
          {/* rendered by parent */}
          غير متوفر
        </p>
      )}
    </div>
  );
}

// ── Payment restriction badge ─────────────────────────────────────────────────
// Shows when a product in cart only supports one payment method.
// type: "prepaid-only" | "cod-only" | null

function PaymentRestrictionBadge({ type }) {
  const { t } = useLanguage();
  if (!type) return null;
  const isPrepaidOnly = type === "prepaid-only";
  return (
    <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-300 rounded-2xl px-4 py-3.5 mb-5">
      <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-yellow-800">
          {isPrepaidOnly ? t("checkout_prepaid_only") : t("checkout_cod_only")}
        </p>
        <p className="text-xs text-yellow-700 mt-0.5 opacity-80">
          {isPrepaidOnly ? t("checkout_prepaid_only_sub") : t("checkout_cod_only_sub")}
        </p>
      </div>
      <CreditCard className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function filterMethods(methods, payType) {
  return methods
    .filter(m => {
      if (!m.isActive) return false;
      if (payType === "prepaid") {
        return (m.paymentType === "prepaid" || m.paymentType === "both") && !m.showOnlyIfDeposit;
      }
      if (payType === "cod_deposit") {
        return (m.paymentType === "cod_deposit" || m.paymentType === "both") && !m.showOnlyIfFullPayment;
      }
      return false;
    })
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

async function createInvoice({ orderId, cartItems, address, shipping, subtotal, shippingCost, promoDiscount, total, paymentMethod }) {
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
        subtotal, shippingCost, promoDiscount: promoDiscount || 0, total, deposit: 0,
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

export default function PaymentPage() {
  const router = useRouter();
  const { t, formatPrice } = useLanguage();

  const [address,        setAddress]        = useState(null);
  const [cartItems,      setCartItems]      = useState([]);
  const [shipping,       setShipping]       = useState(null);
  const [promoDiscount,  setPromoDiscount]  = useState(0);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [placing,        setPlacing]        = useState(false);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [validating,     setValidating]     = useState(false);

  // null = still loading, true/false after product fetch
  const [codAllowed,     setCodAllowed]     = useState(null);
  const [prepaidAllowed, setPrepaidAllowed] = useState(null);

  // FIX #3: isHydrated distinguishes "not yet read localStorage" (show spinner,
  // no redirect) from "read localStorage, data is valid" (show UI).
  // Previously the guard was `!address || !shipping`, which is identical in both
  // states — so a redirect could fire before the effect even ran.
  const [isHydrated, setIsHydrated] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────
  // FIX #2: dependency array changed from [router] to [].
  // This effect must run exactly once on mount. Using [router] caused it to
  // re-run whenever Next.js 15 App Router updated the router reference during
  // a navigation transition (React 19 concurrent rendering), which could hit
  // the redirect guard on a second execution when the checkout state was
  // already cleared by a prior session's clearCheckoutStorage().
  useEffect(() => {
    const addr = localStorage.getItem("checkoutAddress");
    const ship = localStorage.getItem("selectedShipping");

    if (!addr || !ship) { router.replace("/checkout/address"); return; }

    let parsedAddr, parsedShip;
    try {
      parsedAddr = JSON.parse(addr);
      parsedShip = JSON.parse(ship);
    } catch {
      router.replace("/checkout/address"); return;
    }

    // FIX #4: JSON.stringify(null) === "null" is truthy, so !addr / !ship
    // pass the check above, but JSON.parse("null") === null. Explicitly guard
    // against null/non-object values to avoid an infinite spinner.
    if (!parsedAddr || typeof parsedAddr !== "object" ||
        !parsedShip || typeof parsedShip !== "object") {
      router.replace("/checkout/address"); return;
    }

    setAddress(parsedAddr);
    setShipping(parsedShip);

    const items = JSON.parse(localStorage.getItem("buyNow") || "[]");
    setCartItems(items);

    try {
      const pd = localStorage.getItem("promoDiscount");
      if (pd) setPromoDiscount(JSON.parse(pd).discountAmount || 0);
    } catch {}

    try {
      const prev = localStorage.getItem("selectedPaymentMethod");
      if (prev) setSelectedMethod(JSON.parse(prev));
    } catch {}

    // Mark hydration complete — UI can now render safely.
    setIsHydrated(true);

    // ── Fetch product payment rules ──────────────────────────────────────────
    const productIds = [...new Set(items.map(i => i.productId).filter(Boolean))];
    if (productIds.length > 0) {
      fetch("/api/products?status=all")
        .then(r => r.json())
        .then(allProducts => {
          const cartProds = Array.isArray(allProducts)
            ? allProducts.filter(p => productIds.includes(p._id || p.id))
            : [];

          if (cartProds.length === 0) {
            setCodAllowed(true);
            setPrepaidAllowed(true);
            return;
          }

          setCodAllowed(cartProds.every(p => p.allowCOD     !== false));
          setPrepaidAllowed(cartProds.every(p => p.allowPrepaid !== false));
        })
        .catch(() => {
          setCodAllowed(true);
          setPrepaidAllowed(true);
        });
    } else {
      setCodAllowed(true);
      setPrepaidAllowed(true);
    }

    // ── Fetch bank methods (prepaid / cod_deposit) ──────────────────────────
    const payType = parsedShip?.paymentType;
    if (payType === "prepaid" || payType === "cod_deposit") {
      setLoadingMethods(true);
      fetch("/api/setting?type=bank-settings")
        .then(r => r.json())
        .then(data => {
          const all      = Array.isArray(data?.methods) ? data.methods : [];
          const filtered = filterMethods(all, payType);
          setPaymentMethods(filtered);
        })
        .catch(() => {})
        .finally(() => setLoadingMethods(false));
    } else {
      setLoadingMethods(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-switch: if selected method becomes invalid, clear it ──────────────
  useEffect(() => {
    if (codAllowed === null || prepaidAllowed === null) return;

    const shippingType = shipping?.paymentType;

    // COD shipping + COD not allowed → clear any stored selection
    if (shippingType === "cod" && codAllowed === false) {
      setSelectedMethod(null);
    }

    // Prepaid shipping + prepaid not allowed → clear selected bank method
    if ((shippingType === "prepaid" || shippingType === "cod_deposit") && prepaidAllowed === false) {
      setSelectedMethod(null);
    }
  }, [codAllowed, prepaidAllowed, shipping]);

  // ── Derived totals ─────────────────────────────────────────────────────────
  const subtotal     = cartItems.reduce((s, i) => s + i.price * (i.quantity || 1), 0);
  const shippingCost = shipping ? (shipping.isFree ? 0 : parseFloat(shipping.price) || 0) : 0;
  const total        = subtotal + shippingCost - promoDiscount;
  const deposit      = shipping?.paymentType === "cod_deposit"
                         ? parseFloat(shipping.deposit) || 0 : 0;
  const remaining    = shipping?.paymentType === "cod_deposit"
                         ? Math.max(0, total - deposit) : 0;

  const shippingIsCOD    = shipping?.paymentType === "cod";
  const codBlockedByRule = shippingIsCOD && codAllowed === false;

  // Badge: only shown when exactly one method is allowed
  const restrictionType =
    codAllowed === false && prepaidAllowed !== false ? "prepaid-only" :
    prepaidAllowed === false && codAllowed !== false ? "cod-only"     : null;

  // ── Select method (guard: no-op if disabled) ───────────────────────────────
  const handleSelectMethod = (method) => {
    if (prepaidAllowed === false) return;
    setSelectedMethod(method);
  };

  // ── Silent server-side validation ─────────────────────────────────────────
  // Returns false if blocked — errors are not displayed (visual lock handles UX)
  const validateWithServer = async (payMethod) => {
    const productIds = [...new Set(cartItems.map(i => i.productId).filter(Boolean))];
    if (!productIds.length) return true;

    setValidating(true);
    try {
      const res = await fetch("/api/checkout/validate-payment", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ productIds, paymentMethod: payMethod }),
      });
      const data = await res.json();
      return !!data.ok;
    } catch {
      return true; // server unreachable — allow (non-blocking)
    } finally {
      setValidating(false);
    }
  };

  // ── Continue (prepaid / cod_deposit) ──────────────────────────────────────
  const handleContinue = async () => {
    if (!selectedMethod || prepaidAllowed === false) return;
    // Guard: cart must contain at least one non-gift item.
    // We do NOT check client-side price > 0 here — the server recalculates
    // every price from the DB anyway, so a display price of 0 or undefined
    // in localStorage would cause a false redirect for legitimate products.
    const hasPaidItem = cartItems.some((i) => !i.isFreeGift);
    if (!hasPaidItem || cartItems.length === 0) {
      router.replace("/checkout/address");
      return;
    }
    const payMethod = shipping?.paymentType || "prepaid";
    const valid     = await validateWithServer(payMethod);
    if (!valid) return;
    localStorage.setItem("selectedPaymentMethod", JSON.stringify(selectedMethod));
    router.push("/checkout/confirm");
  };

  // ── COD order creation ─────────────────────────────────────────────────────
  const handleCOD = async () => {
    if (codBlockedByRule) return; // double-guard (UI already disabled)
    // Guard: cart must contain at least one non-gift item.
    // Same reasoning as handleContinue — don't check client-side price.
    const hasPaidItem = cartItems.some((i) => !i.isFreeGift);
    if (!hasPaidItem || cartItems.length === 0) {
      router.replace("/checkout/address");
      return;
    }
    const valid = await validateWithServer("cod");
    if (!valid) return;

    setPlacing(true);
    try {
      const affiliateId  = localStorage.getItem("affiliateId")  || null;
      const affiliateRef = localStorage.getItem("affiliateRef") || null;

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
            // Pass gift fields so the server can skip DB price lookup for free items
            isFreeGift:   item.isFreeGift || false,
            giftId:       item._giftId    || item.giftId || undefined,
          })),
        },
        paymentDetails: {
          paymentMethod:       "cod",
          paymentType:         "cod",
          shippingCompany:     shipping?.name || "",
          shippingCost,
          subtotal,
          total,
          promoDiscount,
          deposit:             0,
          remainingOnDelivery: total,
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
      if (!res.ok) throw new Error("failed");
      const order = await res.json();
      localStorage.setItem("lastOrderId", order._id);

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
              username: affiliateRef, affiliateId,
              orderId: order._id, clientName: address.fullName,
              clientPhone: address.phone || "", productTitle: cartItems[0]?.title || "", total,
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

      try {
        localStorage.setItem("lastOrderData", JSON.stringify({
          _id: order._id, name: payload.name, phone: payload.phone,
          status: "pending", paymentDetails: payload.paymentDetails,
        }));
      } catch {}

      await createInvoice({
        orderId: order._id, cartItems, address, shipping,
        subtotal, shippingCost, promoDiscount, total, paymentMethod: "cod",
      });

      clearCheckoutStorage();
      router.push(`/checkout/success?orderId=${order._id}`);
    } catch (err) {
      console.error("COD order error:", err);
    } finally {
      setPlacing(false);
    }
  };

  // ── Loading guard ─────────────────────────────────────────────────────────
  // FIX #3: use isHydrated (set only after localStorage is read and state is
  // populated) so the spinner appears during the brief window before the effect
  // fires rather than relying on address/shipping being null — those are null
  // both before and after a failed localStorage read, making the two cases
  // indistinguishable and causing a flash-of-spinner before redirect.
  if (!isHydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-8 h-8 border-[3px] border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const needsBankSelection =
    shipping.paymentType === "prepaid" || shipping.paymentType === "cod_deposit";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <FunnelTracker event="payment_selected" />

      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push("/checkout/address")}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t("checkout_back")}
          </button>
          <span className="text-sm font-bold text-gray-900">{t("checkout_payment_page_title")}</span>
          <div className="w-16" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        <StepsBar />

        {/* Amount banner */}
        <div className="bg-gray-900 rounded-2xl p-5 mb-6 text-white text-center shadow-lg shadow-gray-900/20">
          {shipping.paymentType === "cod_deposit" ? (
            <>
              <p className="text-xs font-medium opacity-60 mb-1">{t("checkout_pay_now_deposit")}</p>
              <p className="text-4xl font-black">{formatPrice(deposit.toFixed(0))}</p>
              <div className="mt-2.5 pt-2.5 border-t border-white/15 text-xs">
                <span className="opacity-70">{t("checkout_remaining_on_delivery")} </span>
                <strong className="font-black">{formatPrice(remaining.toFixed(0))}</strong>
              </div>
            </>
          ) : shipping.paymentType === "prepaid" ? (
            <>
              <p className="text-xs font-medium opacity-60 mb-1">{t("checkout_full_amount")}</p>
              <p className="text-4xl font-black">{formatPrice(total.toFixed(0))}</p>
              {promoDiscount > 0 && (
                <p className="text-xs text-green-400 mt-1.5 opacity-90">{t("checkout_includes_discount")} {formatPrice(promoDiscount)}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs font-medium opacity-60 mb-1">{t("checkout_grand_total_label")}</p>
              <p className="text-4xl font-black">{formatPrice(total.toFixed(0))}</p>
              {promoDiscount > 0 && (
                <p className="text-xs text-green-400 mt-1.5 opacity-90">{t("checkout_includes_discount")} {formatPrice(promoDiscount)}</p>
              )}
              <p className="text-xs opacity-50 mt-1.5">{t("checkout_pay_on_delivery")}</p>
            </>
          )}
        </div>

        {/* ── Payment restriction badge ── */}
        <PaymentRestrictionBadge type={restrictionType} />

        {/* ── Bank method cards (prepaid / cod_deposit) ── */}
        {needsBankSelection && (
          <div className="space-y-3 mb-5">
            <p className="text-xs font-semibold text-gray-500 px-0.5">{t("checkout_select_method")}</p>

            {loadingMethods ? (
              <div className="flex items-center justify-center py-8 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : paymentMethods.length === 0 ? (
              <MethodCard
                method={{ id: "bank-transfer", name: "Virement Bancaire", logo: "", isActive: true }}
                selected={selectedMethod}
                onClick={() => handleSelectMethod({ id: "bank-transfer", name: "Virement Bancaire" })}
                disabled={prepaidAllowed === false}
              />
            ) : (
              paymentMethods.map(method => (
                <MethodCard
                  key={method.id}
                  method={method}
                  selected={selectedMethod}
                  onClick={() => handleSelectMethod(method)}
                  disabled={prepaidAllowed === false}
                />
              ))
            )}

            {/* Continue button */}
            <button
              onClick={handleContinue}
              disabled={!selectedMethod || validating || prepaidAllowed === false}
              className={`w-full mt-2 py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all
                ${selectedMethod && !validating && prepaidAllowed !== false
                  ? "bg-gray-900 hover:bg-gray-800 text-white shadow-lg active:scale-[0.99]"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              {validating
                ? <><Loader2 className="w-5 h-5 animate-spin" /> {t("checkout_validating")}</>
                : <><span>{t("checkout_continue")}</span><ChevronLeft className="w-5 h-5" /></>
              }
            </button>
          </div>
        )}

        {/* ── COD confirm — always rendered, disabled when blocked ── */}
        {shippingIsCOD && (
          <div className={`transition-opacity duration-150 ${codBlockedByRule ? "opacity-40" : ""}`}>
            <button
              onClick={codBlockedByRule ? undefined : handleCOD}
              disabled={placing || validating || codBlockedByRule}
              className={`w-full group relative bg-white rounded-2xl border border-gray-200 shadow-md transition-all duration-200 overflow-hidden
                ${codBlockedByRule
                  ? "cursor-not-allowed"
                  : "hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                }`}
            >
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-900 rounded-t-2xl" />
              <div className="flex items-center gap-5 px-6 py-5">
                <div className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm
                  ${codBlockedByRule ? "bg-gray-300" : "bg-gray-900 group-hover:bg-gray-800 transition-colors"}`}>
                  <Package className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1 text-right">
                  <p className="text-xs font-semibold text-gray-400 mb-0.5 uppercase tracking-wide">{t("checkout_payment_type_label")}</p>
                  <p className="text-xl font-black text-gray-900">{t("checkout_cod_name")}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{t("checkout_pay_on_delivery")}</p>
                </div>
                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors
                  ${codBlockedByRule ? "bg-gray-100" : "bg-gray-100 group-hover:bg-gray-900"}`}>
                  {(placing || validating)
                    ? <Loader2 className="w-4 h-4 text-gray-400 group-hover:text-white animate-spin" />
                    : <CheckCircle className={`w-4 h-4 transition-colors ${codBlockedByRule ? "text-gray-300" : "text-gray-500 group-hover:text-white"}`} />
                  }
                </div>
              </div>
              <div className="bg-gray-50 border-t border-gray-100 px-6 py-2 flex items-center justify-center">
                <p className="text-[11px] text-gray-400 font-medium">
                  {validating ? t("checkout_validating") : placing ? t("checkout_processing") : t("checkout_press_confirm")}
                </p>
              </div>
            </button>

            {/* Unavailable label — only when blocked by product rule */}
            {codBlockedByRule && (
              <p className="text-center text-xs text-gray-400 mt-2 flex items-center justify-center gap-1">
                <Ban className="w-3 h-3" />
                {t("checkout_not_available")}
              </p>
            )}
          </div>
        )}

        {/* Security note */}
        <div className="flex items-center justify-center gap-1.5 mt-8">
          <Shield className="w-3.5 h-3.5 text-gray-400" />
          <p className="text-xs text-gray-400">{t("checkout_security")}</p>
        </div>
      </div>
    </div>
  );
}
