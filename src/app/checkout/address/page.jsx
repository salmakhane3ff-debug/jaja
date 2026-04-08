"use client";
import React, { useState, useEffect } from "react";
import { applyGiftsToItems } from "@/lib/giftUtils";
import { useRouter } from "next/navigation";
import FunnelTracker from "@/components/tracking/FunnelTracker";
import {
  User, Phone, Mail, MapPin, Truck, Package,
  Clock, ArrowRight, ShoppingBag, Home, Shield,
  Plus, Minus, Trash2, Pencil, CheckCircle,
} from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";

// ── Moroccan cities ───────────────────────────────────────────────────────────

const MOROCCAN_CITIES = [
  "Agadir","Aït Melloul","Al Hoceima","Azemmour","Azrou","Beni Mellal","Berrechid",
  "Berkane","Bouznika","Casablanca","Chefchaouen","Dakhla","El Jadida",
  "El Kelaa des Sraghna","Errachidia","Essaouira","Fes","Figuig","Guelmim",
  "Ifrane","Inezgane","Kenitra","Khemisset","Khenifra","Khouribga","Ksar el-Kebir",
  "Laayoune","Larache","Marrakech","Meknes","Midelt","Mohammedia","Nador",
  "Ouarzazate","Oujda","Rabat","Safi","Sale","Settat","Sidi Kacem","Sidi Slimane",
  "Tanger","Tan-Tan","Taounate","Taza","Tetouan","Tiznit","Youssoufia","Zagora",
].sort();

// ── Payment summary helper ────────────────────────────────────────────────────

function getPaymentSummary(selectedShipping, subtotal, promoDiscount = 0, formatPrice = (v) => `${v} MAD`, t = (k) => k) {
  if (!selectedShipping) return null;
  const shippingCost = selectedShipping.isFree ? 0 : parseFloat(selectedShipping.price) || 0;
  const total = subtotal + shippingCost - promoDiscount;
  const type  = selectedShipping.paymentType;

  if (type === "cod") {
    return {
      type, label: t("checkout_cod_label"),
      badge: { text: "COD", bg: "bg-orange-100 text-orange-700" },
      shippingCost, total, payNow: 0, payOnDelivery: total,
      rows: [{ label: t("checkout_pay_delivery_row"), value: formatPrice(total.toFixed(0)), highlight: true }],
    };
  }
  if (type === "cod_deposit") {
    const deposit   = parseFloat(selectedShipping.deposit) || 0;
    const remaining = Math.max(0, total - deposit);
    return {
      type, label: t("checkout_cod_deposit_label"),
      badge: { text: t("checkout_pay_now_chip"), bg: "bg-yellow-100 text-yellow-700" },
      shippingCost, total, payNow: deposit, payOnDelivery: remaining,
      rows: [
        { label: t("checkout_pay_now_deposit_row"), value: formatPrice(deposit.toFixed(0)), highlight: true, color: "text-orange-600" },
        { label: t("checkout_pay_delivery_row2"),   value: formatPrice(remaining.toFixed(0)), highlight: false },
      ],
    };
  }
  if (type === "prepaid") {
    return {
      type, label: t("checkout_prepaid_label"),
      badge: { text: "Prepaid", bg: "bg-blue-100 text-blue-700" },
      shippingCost, total, payNow: total, payOnDelivery: 0,
      rows: [{ label: t("checkout_pay_prepaid_row"), value: formatPrice(total.toFixed(0)), highlight: true, color: "text-blue-600" }],
    };
  }
  return null;
}

// ── Steps bar ─────────────────────────────────────────────────────────────────

function StepsBar() {
  const { t } = useLanguage();
  const steps = [t("checkout_step_order"), t("checkout_step_payment"), t("checkout_step_thanks")];
  return (
    <div className="flex items-center justify-center mb-8 px-2">
      {steps.map((label, i, arr) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center gap-1 min-w-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0
              ${i === 0 ? "bg-gray-900 text-white shadow-md" : "bg-gray-100 text-gray-400"}`}>
              {i + 1}
            </div>
            <span className={`text-[10px] font-semibold whitespace-nowrap
              ${i === 0 ? "text-gray-900" : "text-gray-400"}`}>{label}</span>
          </div>
          {i < arr.length - 1 && (
            <div className="h-0.5 flex-1 mx-2 mb-4 bg-gray-200" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Customer summary card (info locked / soft-guard) ─────────────────────────

function CustomerSummaryCard({ form, onEdit, t }) {
  const rows = [
    { label: t("checkout_name_label"),    value: form.fullName },
    { label: t("checkout_phone_label"),   value: form.phone },
    ...(form.email   ? [{ label: t("checkout_email_label"),   value: form.email }]   : []),
    { label: t("checkout_city_label"),    value: form.city },
    ...(form.address ? [{ label: t("checkout_address_label"), value: form.address }] : []),
  ];
  return (
    <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span className="text-sm font-bold text-green-800">{t("checkout_info_saved")}</span>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 hover:text-gray-700 transition-colors bg-white border border-gray-900/30 rounded-lg px-3 py-1.5">
          <Pencil className="w-3 h-3" /> {t("checkout_edit")}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex flex-col">
            <span className="text-[10px] text-green-600 font-medium">{label}</span>
            <span className="text-xs font-semibold text-gray-900 truncate">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cart item card ────────────────────────────────────────────────────────────

function CartItemCard({ item, onQtyChange, onRemove, formatPrice = (v) => `${v} MAD`, t = (k) => k }) {
  // Free gift item
  if (item.isFreeGift) {
    return (
      <div className="flex gap-3 p-3 bg-green-50 border border-green-200 rounded-xl sm:rounded-2xl">
        <div className="flex-shrink-0">
          <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-white border border-green-200">
            {item.image
              ? <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center bg-gray-100"><Package className="w-6 h-6 text-gray-300" /></div>}
            <div className="absolute inset-x-0 bottom-0 bg-green-500 text-white text-[9px] font-black text-center py-0.5">
              {t("checkout_free_badge")}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-full mb-1 border border-green-200">
            {t("checkout_free_gift_tag")}
          </div>
          <h4 className="text-xs sm:text-sm font-medium text-gray-900 line-clamp-2 leading-tight">{item.title}</h4>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-sm font-black text-green-600">{t("checkout_free_word")}</span>
            <span className="text-[10px] text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">
              {t("checkout_qty_label").replace("{n}", item.quantity)}
            </span>
          </div>
        </div>
        <div className="flex-shrink-0 flex items-start pt-1">
          <span className="text-sm font-black text-green-600">{formatPrice(0)}</span>
        </div>
      </div>
    );
  }

  // Normal item
  return (
    <div className="flex gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-50 rounded-xl sm:rounded-2xl hover:bg-gray-100 transition-colors">
      <div className="flex-shrink-0">
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg sm:rounded-xl overflow-hidden bg-white">
          {item.image
            ? <img src={item.image} alt={item.title} className="w-full h-full object-cover hover:scale-105 transition-transform" />
            : <div className="w-full h-full flex items-center justify-center bg-gray-100"><Package className="w-6 h-6 text-gray-300" /></div>}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-xs sm:text-sm font-medium text-gray-900 line-clamp-2 leading-tight">{item.title}</h4>
        {(item.color || item.size) && (
          <p className="text-[10px] text-gray-400 mt-0.5">
            {item.color && <span>{t("checkout_color_label").replace("{c}", item.color)}</span>}
            {item.color && item.size && " · "}
            {item.size && <span>{t("checkout_size_label").replace("{s}", item.size)}</span>}
          </p>
        )}
        <div className="mt-2 sm:mt-3 space-y-2 sm:space-y-0">
          <div className="text-sm sm:text-base font-semibold text-gray-900">{formatPrice(item.price)}</div>
          <div className="flex items-center justify-between sm:justify-start sm:gap-4 mt-2">
            {/* Quantity controls */}
            <div className="flex items-center bg-white rounded-lg sm:rounded-xl border border-gray-200">
              <button
                type="button"
                onClick={() => onQtyChange(item.quantity - 1)}
                disabled={item.quantity <= 1}
                className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-l-lg sm:rounded-l-xl transition-colors disabled:opacity-40">
                <Minus className="w-3 h-3 text-gray-600" />
              </button>
              <span className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-900 min-w-[2rem] sm:min-w-[3rem] text-center">
                {item.quantity}
              </span>
              <button
                type="button"
                onClick={() => onQtyChange(item.quantity + 1)}
                className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-r-lg sm:rounded-r-xl transition-colors">
                <Plus className="w-3 h-3 text-gray-600" />
              </button>
            </div>
            {/* Remove */}
            <button
              type="button"
              onClick={onRemove}
              className="p-2 text-red-500 hover:bg-red-50 rounded-lg sm:rounded-xl transition-colors"
              title={t("checkout_remove_title")}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      {/* Line total */}
      <div className="flex-shrink-0 flex items-start pt-1">
        <span className="text-sm font-bold text-gray-900">{formatPrice((item.price * item.quantity).toFixed(0))}</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CheckoutAddressPage() {
  const router = useRouter();

  // ── Form state ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", city: "", address: "" });
  const [errors, setErrors] = useState({});
  const [infoLocked, setInfoLocked] = useState(false);
  const [navigating, setNavigating] = useState(false);

  // ── Cart ──────────────────────────────────────────────────────────────────
  const [cartItems, setCartItems] = useState([]);

  // ── Shipping ──────────────────────────────────────────────────────────────
  const [companies, setCompanies]         = useState([]);
  const [selectedShipping, setSelectedShipping] = useState(null);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  // ── Promo ─────────────────────────────────────────────────────────────────
  const [promoInput,   setPromoInput]   = useState("");
  const [promoData,    setPromoData]    = useState(null);
  const [promoError,   setPromoError]   = useState("");
  const [promoLoading, setPromoLoading] = useState(false);

  // ── Initialise from localStorage ──────────────────────────────────────────
  useEffect(() => {
    // Restore saved address
    try {
      const saved = JSON.parse(localStorage.getItem("checkoutAddress") || "null");
      if (saved) {
        setForm(saved);
        if (saved.fullName && saved.phone && saved.city) setInfoLocked(true);
      }
    } catch {}

    // Validate and load cart items
    const rawItems = JSON.parse(localStorage.getItem("buyNow") || "[]");
    const baseValid = rawItems.filter(
      (item) => item && item.productId && item.price !== undefined && item.title,
    );
    // Validate free-gift minOrderAmount against non-gift subtotal
    const nonGiftSubtotal = baseValid.reduce(
      (sum, i) => (i.isFreeGift ? sum : sum + (i.price || 0) * (i.quantity || 1)),
      0,
    );
    const validItems = baseValid.filter(
      (item) =>
        !item.isFreeGift ||
        (item.minOrderAmount || 0) <= 0 ||
        nonGiftSubtotal >= (item.minOrderAmount || 0),
    );
    if (validItems.length !== rawItems.length) {
      localStorage.setItem("buyNow", JSON.stringify(validItems));
    }
    setCartItems(validItems);

    // Safety net: recalculate gift eligibility for the Buy Now flow.
    // When the user skips the cart (Buy Now on product page), gifts may
    // not have been applied yet. Strip any stale gifts first, then
    // re-apply so the same rules fire here as in the cart flow.
    (async () => {
      const nonGiftOnly = validItems.filter((i) => !i.isFreeGift);
      const withGifts = await applyGiftsToItems(nonGiftOnly);
      // Only update if eligibility changed (avoids unnecessary re-render)
      const newGiftIds  = withGifts.filter((i) => i.isFreeGift).map((i) => i._giftId).sort().join(",");
      const prevGiftIds = validItems.filter((i) => i.isFreeGift).map((i) => i._giftId).sort().join(",");
      if (newGiftIds !== prevGiftIds) {
        setCartItems(withGifts);
        localStorage.setItem("buyNow", JSON.stringify(withGifts));
      }
    })();

    // Restore saved promo (client-only to avoid hydration mismatch)
    try {
      const savedPromo = JSON.parse(localStorage.getItem("promoCode") || "null");
      if (savedPromo) {
        setPromoData(savedPromo);
        setPromoInput(savedPromo.code || "");
      }
    } catch {}
  }, []);

  // Fetch shipping companies
  useEffect(() => {
    fetch("/api/shipping-companies")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setCompanies(list);

        // Restore previously selected shipping (only if address was already saved)
        try {
          const hasAddress = localStorage.getItem("checkoutAddress");
          if (hasAddress) {
            const saved = JSON.parse(localStorage.getItem("selectedShipping") || "null");
            if (saved && list.find((c) => c._id === saved._id)) {
              setSelectedShipping(saved);
            }
          }
        } catch {}
      })
      .catch(() => {})
      .finally(() => setLoadingCompanies(false));
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────────
  const subtotal = cartItems.reduce((s, i) => s + i.price * (i.quantity || 1), 0);

  // Block cod_deposit if any product disallows it
  const anyProductNoDeposit = cartItems.some(
    (item) => item.allowDeposit === false || item.allowDeposit === "false",
  );

  // Promo discount calculation
  const promoDiscount = (() => {
    if (!promoData) return 0;
    if (promoData.minOrder > 0 && subtotal < promoData.minOrder) return 0;
    return promoData.type === "percent"
      ? Math.round(subtotal * promoData.value / 100)
      : Math.min(promoData.value, subtotal);
  })();

  const { formatPrice, t, mounted } = useLanguage();
  const summary = getPaymentSummary(selectedShipping, subtotal, promoDiscount, formatPrice, t);

  // Don't render until the client has resolved the correct language.
  // Because LanguageContext uses a lazy initializer fed by the inline script,
  // this guard is only a safety net — in practice it resolves in the same frame.
  if (!mounted) return <div className="min-h-screen bg-gray-50" aria-hidden="true" />;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: null }));
  };

  // ── Shared helper: persist items to buyNow + sync non-gift items to cart ──
  const persistItems = (items) => {
    localStorage.setItem("buyNow", JSON.stringify(items));
    // Keep cart key in sync so back-navigation shows the correct state
    const nonGift = items.filter((i) => !i.isFreeGift);
    localStorage.setItem("cart", JSON.stringify(nonGift));
    window.dispatchEvent(new Event("cartUpdated"));
  };

  // ── Shared helper: recalculate gifts after a paid-item mutation ────────────
  const recalcGifts = async (paidItems) => {
    const withGifts = await applyGiftsToItems(paidItems);
    const newGiftIds  = withGifts.filter((i) => i.isFreeGift).map((i) => i._giftId).sort().join(",");
    const prevGiftIds = cartItems.filter((i) => i.isFreeGift).map((i) => i._giftId).sort().join(",");
    if (newGiftIds !== prevGiftIds) {
      setCartItems(withGifts);
      persistItems(withGifts);
    }
  };

  const updateQty = (index, newQty) => {
    if (newQty < 1) return;
    if (cartItems[index]?.isFreeGift) return;
    const updated = cartItems.map((item, i) => (i === index ? { ...item, quantity: newQty } : item));
    setCartItems(updated);
    persistItems(updated);
    // Re-evaluate gift eligibility (subtotal changed)
    recalcGifts(updated.filter((i) => !i.isFreeGift));
  };

  const removeItem = (index) => {
    const removedItem = cartItems[index];
    // Never allow removing a free-gift item directly
    if (removedItem?.isFreeGift) return;
    const afterRemoval = cartItems.filter((_, i) => i !== index);
    const paidRemaining = afterRemoval.filter((i) => !i.isFreeGift);
    // If no paid items remain, strip all gifts immediately — cannot order gifts alone
    const safeItems = paidRemaining.length > 0 ? afterRemoval : [];
    setCartItems(safeItems);
    persistItems(safeItems);
    // Re-evaluate gift eligibility only when paid items still exist
    if (paidRemaining.length > 0) {
      recalcGifts(paidRemaining);
    }
  };

  const handleShippingSelect = (company) => {
    if (anyProductNoDeposit && company.paymentType === "cod_deposit") return;
    setSelectedShipping(company);
    if (errors.shipping) setErrors((e) => ({ ...e, shipping: null }));
    // Auto-save address if required fields are filled
    if (form.fullName.trim() && form.phone.trim() && form.city.trim()) {
      localStorage.setItem("checkoutAddress", JSON.stringify(form));
      setInfoLocked(true);
    }
  };

  // ── Promo ──────────────────────────────────────────────────────────────────
  const applyPromo = async () => {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    setPromoError("");
    setPromoData(null);
    try {
      const res  = await fetch(`/api/promo?code=${encodeURIComponent(promoInput.trim())}`);
      const data = await res.json();
      if (!res.ok || data.valid === false) {
        setPromoError(data.error || t("checkout_promo_error_invalid"));
      } else {
        setPromoData(data);
        localStorage.setItem("promoCode", JSON.stringify(data));
      }
    } catch {
      setPromoError(t("checkout_promo_error_server"));
    } finally {
      setPromoLoading(false);
    }
  };

  const removePromo = () => {
    setPromoData(null);
    setPromoInput("");
    setPromoError("");
    localStorage.removeItem("promoCode");
    localStorage.removeItem("promoDiscount");
  };

  // ── Validation + navigation ────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.fullName.trim())                                   e.fullName = t("checkout_name_error");
    if (!form.phone.trim() || form.phone.replace(/\D/g, "").length < 9)
                                                                  e.phone    = t("checkout_phone_error");
    if (!form.city.trim())                                       e.city     = t("checkout_city_error");
    if (!selectedShipping)                                       e.shipping = t("checkout_shipping_error");
    if (cartItems.filter((i) => !i.isFreeGift).length === 0)    e.cart     = t("checkout_cart_error");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleContinue = () => {
    if (!validate()) {
      setTimeout(() => {
        const el = document.querySelector(".border-red-300, .text-red-400");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }
    setNavigating(true);

    localStorage.setItem("checkoutAddress", JSON.stringify(form));
    localStorage.setItem("selectedShipping", JSON.stringify(selectedShipping));
    localStorage.setItem("checkoutBillingDetails", JSON.stringify({
      customer: { fullName: form.fullName, phone: form.phone, email: form.email },
      address:  { city: form.city, address1: form.address || "", address2: "", state: "", zip: "" },
    }));

    // Save promo discount for the next steps
    if (promoData && promoDiscount > 0) {
      localStorage.setItem("promoDiscount", JSON.stringify({ ...promoData, discountAmount: promoDiscount }));
    } else {
      localStorage.removeItem("promoDiscount");
    }

    router.push("/checkout/payment");
  };

  // ── Input style helper ─────────────────────────────────────────────────────
  const inp = (err) =>
    `w-full px-4 py-3 border rounded-xl text-sm focus:outline-none transition-all ${
      err ? "border-red-300 bg-red-50" : "border-gray-200 focus:border-gray-900 bg-white"
    }`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <FunnelTracker event="checkout_start" />


      <div className="max-w-lg mx-auto px-4 py-6">
        <StepsBar />

        {/* ── 1. Customer information ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-gray-900" />
            </div>
            <h2 className="font-bold text-gray-900 text-sm">{t("checkout_customer_info")}</h2>
          </div>
          <div className="p-5">
            {infoLocked ? (
              <CustomerSummaryCard form={form} onEdit={() => setInfoLocked(false)} t={t} />
            ) : (
              <div className="space-y-3">
                {/* Full name */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
                    {t("checkout_full_name")} <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                    <input
                      value={form.fullName}
                      onChange={(e) => setField("fullName", e.target.value)}
                      placeholder={t("checkout_full_name_placeholder")}
                      className={`${inp(errors.fullName)} pl-10`}
                    />
                  </div>
                  {errors.fullName && <p className="text-red-400 text-xs mt-1">⚠ {errors.fullName}</p>}
                </div>

                {/* Phone */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
                    {t("checkout_phone")} <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                    <input
                      value={form.phone}
                      onChange={(e) => setField("phone", e.target.value)}
                      type="tel"
                      placeholder="06XXXXXXXX"
                      className={`${inp(errors.phone)} pl-10`}
                    />
                  </div>
                  {errors.phone && <p className="text-red-400 text-xs mt-1">⚠ {errors.phone}</p>}
                </div>

                {/* Email (optional) */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
                    {t("checkout_email_optional")}{" "}
                    <span className="text-gray-400 font-normal">({t("checkout_email_optional_hint")})</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                    <input
                      value={form.email}
                      onChange={(e) => setField("email", e.target.value)}
                      type="email"
                      placeholder={t("checkout_optional_placeholder")}
                      className={`${inp(false)} pl-10`}
                    />
                  </div>
                </div>

                {/* City */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
                    {t("checkout_city")} <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none z-10" />
                    <input
                      value={form.city}
                      onChange={(e) => setField("city", e.target.value)}
                      placeholder={t("checkout_city_placeholder")}
                      list="moroccan-cities"
                      className={`${inp(errors.city)} pl-10`}
                      dir="auto"
                    />
                    <datalist id="moroccan-cities">
                      {MOROCCAN_CITIES.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  {errors.city && <p className="text-red-400 text-xs mt-1">⚠ {errors.city}</p>}
                </div>

                {/* Address (optional) */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
                    {t("checkout_address_detail")}{" "}
                    <span className="text-gray-400 font-normal">({t("checkout_address_detail_hint")})</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3.5 w-4 h-4 text-gray-300 pointer-events-none" />
                    <textarea
                      value={form.address}
                      onChange={(e) => setField("address", e.target.value)}
                      placeholder={t("checkout_address_placeholder")}
                      rows={2}
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-900 bg-white resize-none transition-all"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 2. Shipping companies ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
              <Truck className="w-3.5 h-3.5 text-gray-900" />
            </div>
            <h2 className="font-bold text-gray-900 text-sm">{t("checkout_select_shipping")}</h2>
          </div>
          <div className="p-5">
            {errors.shipping && (
              <p className="text-red-400 text-xs mb-3">⚠ {errors.shipping}</p>
            )}

            {loadingCompanies ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-[3px] border-gray-900 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : companies.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">{t("checkout_no_shipping")}</p>
            ) : (
              <div className="space-y-3">
                {companies.map((company) => {
                  const isSelected        = selectedShipping?._id === company._id;
                  const shippingCostNow   = company.isFree ? 0 : parseFloat(company.price) || 0;
                  const depositNow        = company.paymentType === "cod_deposit" ? parseFloat(company.deposit) || 0 : 0;
                  const isDepositDisabled = anyProductNoDeposit && company.paymentType === "cod_deposit";

                  return (
                    <div
                      key={company._id}
                      onClick={() => !isDepositDisabled && handleShippingSelect(company)}
                      title={isDepositDisabled ? "هذا المنتج لا يدعم الدفع بالعربون" : ""}
                      className={`relative rounded-2xl border-2 transition-all select-none overflow-hidden
                        ${isDepositDisabled
                          ? "opacity-50 cursor-not-allowed grayscale"
                          : isSelected
                            ? "border-gray-900 shadow-md shadow-gray-900/10 cursor-pointer"
                            : "border-gray-200 hover:border-gray-300 bg-white cursor-pointer"
                        }`}
                    >
                      {/* Deposit-disabled overlay */}
                      {isDepositDisabled && (
                        <div className="absolute inset-0 bg-white/90 z-10 flex flex-col items-center justify-center rounded-2xl px-4 text-center gap-2">
                          <span className="text-xl">🚫</span>
                          <p className="text-xs font-black text-red-600">{t("checkout_no_deposit_warning")}</p>
                          <p className="text-[11px] text-gray-500 leading-snug">
                            {t("checkout_choose_another")}
                          </p>
                        </div>
                      )}

                      {isSelected && <div className="absolute inset-0 bg-gray-50 pointer-events-none" />}

                      <div className="relative p-4">
                        <div className="flex items-start gap-3 mb-3">
                          {/* Logo */}
                          <div className="w-11 h-11 rounded-xl border border-gray-100 bg-white flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                            {company.logo
                              ? <img src={company.logo} alt={company.name} className="w-full h-full object-contain p-1" />
                              : <Truck className="w-5 h-5 text-gray-400" />}
                          </div>

                          {/* Name + badges */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-gray-900 text-sm">{company.name}</span>
                              {company.paymentType === "cod" && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-orange-100 text-orange-600">الدفع عند الاستلام</span>
                              )}
                              {company.paymentType === "cod_deposit" && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700">عربون + الباقي عند الاستلام</span>
                              )}
                              {company.paymentType === "prepaid" && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-600">الدفع المسبق</span>
                              )}
                            </div>
                            {company.description && (
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{company.description}</p>
                            )}
                          </div>

                          {/* Radio dot */}
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all
                            ${isSelected ? "border-gray-900 bg-gray-900" : "border-gray-300 bg-white"}`}>
                            {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                          </div>
                        </div>

                        {/* Detail chips */}
                        <div className="flex flex-wrap gap-2">
                          <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-2.5 py-1.5">
                            <span className="text-xs">📦</span>
                            <span className="text-xs font-semibold text-gray-700">
                              {company.isFree ? t("checkout_free_delivery") : `${t("checkout_delivery_fee")}: ${formatPrice(shippingCostNow)}`}
                            </span>
                          </div>

                          {company.paymentType === "cod_deposit" && depositNow > 0 && (
                            <div className="flex items-center gap-1.5 bg-orange-100 rounded-lg px-2.5 py-1.5">
                              <span className="text-xs">💳</span>
                              <span className="text-xs font-semibold text-orange-700">{t("checkout_pay_now_chip")}: {formatPrice(depositNow)}</span>
                            </div>
                          )}
                          {company.paymentType === "prepaid" && (
                            <div className="flex items-center gap-1.5 bg-blue-100 rounded-lg px-2.5 py-1.5">
                              <span className="text-xs">💳</span>
                              <span className="text-xs font-semibold text-blue-700">{t("checkout_prepaid_chip")}</span>
                            </div>
                          )}
                          {company.paymentType === "cod" && (
                            <div className="flex items-center gap-1.5 bg-orange-50 rounded-lg px-2.5 py-1.5">
                              <span className="text-xs">💵</span>
                              <span className="text-xs font-semibold text-orange-600">{t("checkout_pay_on_delivery_chip")}</span>
                            </div>
                          )}
                          {company.paymentType === "cod_deposit" && (
                            <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-2.5 py-1.5">
                              <span className="text-xs">📦</span>
                              <span className="text-xs font-semibold text-gray-600">{t("checkout_remaining_delivery")}</span>
                            </div>
                          )}
                          {company.deliveryTime && (
                            <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-2.5 py-1.5">
                              <Clock className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                              <span className="text-xs font-semibold text-gray-600">{company.deliveryTime}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── 3. Order summary ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
              <Package className="w-3.5 h-3.5 text-gray-900" />
            </div>
            <h2 className="font-bold text-gray-900 text-sm">{t("checkout_order_title")}</h2>
            <span className="ml-auto text-xs text-gray-400">{cartItems.length} {t("checkout_products_label")}</span>
          </div>
          <div className="p-4 sm:p-5">
            {cartItems.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingBag className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">{t("checkout_cart_empty_msg")}</p>
                <Link href="/products" className="mt-3 inline-block text-gray-900 text-sm font-semibold hover:underline">
                  {t("checkout_browse_products")}
                </Link>
              </div>
            ) : (
              <>
                <div className="space-y-3 sm:space-y-4 mb-4">
                  {cartItems.map((item, i) => (
                    <CartItemCard
                      key={i}
                      item={item}
                      onQtyChange={(newQty) => updateQty(i, newQty)}
                      onRemove={() => removeItem(i)}
                      formatPrice={formatPrice}
                      t={t}
                    />
                  ))}
                </div>

                {/* Price breakdown */}
                <div className="border-t border-gray-100 pt-4 space-y-2">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>{t("checkout_subtotal_label")}</span>
                    <span>{formatPrice(subtotal.toFixed(0))}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>{t("checkout_delivery_label")}</span>
                    <span className={summary?.shippingCost === 0 && selectedShipping?.isFree ? "text-green-600 font-semibold" : ""}>
                      {!summary ? "—" : summary.shippingCost === 0 ? t("checkout_free_label") : formatPrice(summary.shippingCost)}
                    </span>
                  </div>
                  {promoDiscount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>{t("checkout_coupon_label")} ({promoData?.code})</span>
                      <span>− {formatPrice(promoDiscount)}</span>
                    </div>
                  )}

                  {/* Grand total */}
                  <div className="flex justify-between items-center py-2 border-t border-gray-100 mt-1">
                    <span className="font-bold text-gray-900">{t("checkout_grand_total")}</span>
                    <div className="text-right">
                      {promoDiscount > 0 && (
                        <span className="text-sm line-through text-gray-400 block">
                          {formatPrice((summary ? summary.total + promoDiscount : subtotal).toFixed(0))}
                        </span>
                      )}
                      <span className="text-xl font-black text-gray-900">
                        {formatPrice(summary ? summary.total.toFixed(0) : (subtotal - promoDiscount).toFixed(0))}
                      </span>
                    </div>
                  </div>

                  {/* Payment breakdown box */}
                  {summary && (
                    <div className={`mt-3 rounded-xl p-3.5 space-y-2 border
                      ${summary.type === "cod_deposit" ? "bg-orange-50 border-orange-200"
                        : summary.type === "prepaid"   ? "bg-blue-50 border-blue-200"
                        : "bg-gray-50 border-gray-200"}`}>
                      <p className="text-xs font-bold text-gray-600 mb-2">{t("checkout_payment_details")}</p>
                      {summary.rows.map((row, idx) => (
                        <div key={idx} className="flex justify-between items-center">
                          <span className="text-xs text-gray-600">{row.label}</span>
                          <span className={`text-sm font-black ${row.color || "text-gray-900"}`}>{row.value}</span>
                        </div>
                      ))}
                      {summary.type === "cod_deposit" && (
                        <p className="text-xs text-orange-600 mt-1 pt-2 border-t border-orange-200">
                          {t("checkout_deposit_warning_msg")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── 4. Promo code ── */}
        <div className="mb-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs font-bold text-gray-500 mb-2">{t("checkout_promo_title")}</p>
          {!promoData ? (
            <div className="flex gap-2">
              <input
                value={promoInput}
                onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoError(""); }}
                onKeyDown={(e) => e.key === "Enter" && applyPromo()}
                placeholder={t("checkout_promo_placeholder")}
                className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-gray-900 bg-white"
              />
              <button
                onClick={applyPromo}
                disabled={promoLoading || !promoInput.trim()}
                className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-xl disabled:opacity-50 transition-colors shrink-0">
                {promoLoading ? "..." : t("checkout_promo_apply")}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
              <div>
                <p className="text-xs font-black text-green-700">{promoData.code} ✓</p>
                <p className="text-xs text-green-600">
                  {promoData.type === "percent"
                    ? t("checkout_promo_percent").replace("{pct}", promoData.value)
                    : `${t("checkout_coupon_label")} ${formatPrice(promoData.value)}`}
                  {promoDiscount > 0 && ` ${t("checkout_promo_saving").replace("{amount}", formatPrice(promoDiscount))}`}
                </p>
              </div>
              <button onClick={removePromo} className="text-xs text-red-500 hover:text-red-700 font-semibold">
                {t("checkout_promo_remove")}
              </button>
            </div>
          )}
          {promoError && <p className="text-xs text-red-500 mt-1.5">{promoError}</p>}
        </div>

        {/* ── 5. Warranty notice ── */}
        {cartItems.some((i) => i.warranty) && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl mt-0.5">🛡️</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-green-800 mb-1">{t("checkout_warranty_title")}</p>
                <div className="space-y-1">
                  {cartItems.filter((i) => i.warranty).map((item, idx) => (
                    <p key={idx} className="text-xs text-green-700">
                      <span className="font-semibold">{item.title}</span> — {t("checkout_warranty_label")} {item.warranty}
                    </p>
                  ))}
                </div>
                <a href="/warranty" target="_blank"
                  className="inline-block mt-2 text-xs font-semibold text-green-700 underline underline-offset-2 hover:text-green-900 transition-colors">
                  {t("checkout_warranty_link")}
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ── Validation error summary ── */}
        {Object.keys(errors).length > 0 && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
            ⚠ {errors.fullName || errors.phone || errors.city || errors.shipping || errors.cart}
          </div>
        )}

        {/* ── Continue button ── */}
        <button
          onClick={handleContinue}
          disabled={navigating}
          className="w-full bg-gray-900 hover:bg-gray-800 active:scale-[0.98] text-white py-2.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-80">
          {navigating ? (
            <>
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {t("checkout_redirecting")}
            </>
          ) : (
            <>{t("checkout_continue_btn")} <ArrowRight className="w-5 h-5" /></>
          )}
        </button>

        <div className="flex items-center justify-center gap-1.5 mt-3">
          <Shield className="w-3.5 h-3.5 text-gray-400" />
          <p className="text-center text-xs text-gray-400">{t("checkout_security")}</p>
        </div>
      </div>
    </div>
  );
}
