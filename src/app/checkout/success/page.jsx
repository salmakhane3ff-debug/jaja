"use client";
import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, Home, MessageCircle, Printer, Clock, AlertCircle, CreditCard } from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAY_LABELS = {
  ar: {
    bank_transfer: "تحويل بنكي",
    cod:           "الدفع عند الاستلام",
    cod_deposit:   "عربون + الباقي عند الاستلام",
    prepaid:       "الدفع المسبق",
  },
  fr: {
    bank_transfer: "Virement bancaire",
    cod:           "Paiement à la livraison",
    cod_deposit:   "Acompte + reste à la livraison",
    prepaid:       "Paiement anticipé",
  },
};

function payLabel(method, lang, bankMethods = []) {
  if (!method) return "—";
  // Known static keys first
  if (PAY_LABELS[lang]?.[method]) return PAY_LABELS[lang][method];
  if (PAY_LABELS.ar[method])      return PAY_LABELS.ar[method];
  // Resolve dynamic bank method ID → name
  const found = bankMethods.find((m) => m.id === method);
  if (found?.name) return found.name;
  // Last resort: return raw value (better than ID)
  return method;
}

function buildWhatsAppMsg(order, lang) {
  if (!order) return "";
  const items = order.products?.items || [];
  const pd    = order.paymentDetails || {};
  const lines = items
    .map((i) => `  • ${i.title} × ${i.quantity} — ${(i.price * i.quantity).toFixed(0)} MAD`)
    .join("\n");

  const isAr = lang === "ar";

  return encodeURIComponent(
    [
      isAr ? "🛍️ *طلب جديد*" : "🛍️ *Nouvelle commande*",
      "",
      `👤 *${isAr ? "الاسم" : "Nom"}:* ${order.name || ""}`,
      `📞 *${isAr ? "الهاتف" : "Tél"}:* ${order.phone || ""}`,
      `📍 *${isAr ? "المدينة" : "Ville"}:* ${order.shipping?.address?.city || ""}`,
      "",
      `📦 *${isAr ? "المنتجات" : "Produits"}:*`,
      lines,
      "",
      `🚚 *${isAr ? "التوصيل" : "Livraison"}:* ${pd.shippingCompany || ""} — ${pd.shippingCost || 0} MAD`,
      `💰 *${isAr ? "المجموع" : "Total"}:* ${(pd.total || 0).toFixed(0)} MAD`,
      `💳 *${isAr ? "نوع الدفع" : "Paiement"}:* ${payLabel(pd.paymentMethod, lang, [])}`,
      "",
      `🔖 *${isAr ? "رقم الطلب" : "N° commande"}:* ${order._id || ""}`,
    ].join("\n"),
  );
}

// ── Resolve a product image to a plain URL string ─────────────────────────────
// productSnapshot stores images as either string[] or {url:string}[] — handle both.
// Falls back to /empty.svg (already in /public) when no image is available.
const PLACEHOLDER = "/empty.svg";
function resolveImg(item) {
  const raw = item.image ?? item.images?.[0] ?? null;
  if (!raw) return PLACEHOLDER;
  return (typeof raw === "string" ? raw : (raw?.url || null)) || PLACEHOLDER;
}

// ── Main content ──────────────────────────────────────────────────────────────

function SuccessContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const { t, lang }  = useLanguage();

  const [order,         setOrder]         = useState(null);
  const [storeSettings, setStoreSettings] = useState(null);
  const [bankMethods,   setBankMethods]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const orderIdRef = useRef(null); // stable ref so polling closure always has latest orderId

  useEffect(() => {
    const orderId =
      searchParams.get("orderId") || localStorage.getItem("lastOrderId");

    const fetchAll = async () => {
      try {
        const r = await fetch("/api/setting?type=store");
        if (r.ok) setStoreSettings(await r.json());
      } catch {}

      // Fetch bank methods so we can resolve payment method IDs to readable names
      try {
        const r = await fetch("/api/setting?type=bank-settings");
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d?.methods)) setBankMethods(d.methods);
        }
      } catch {}

      if (orderId) {
        orderIdRef.current = orderId;
        try {
          // Use the public status endpoint — no admin auth required
          const r = await fetch(`/api/order/status?orderId=${orderId}`);
          const d = await r.json();
          if (d?._id) { setOrder(d); setLoading(false); return; }
        } catch {}
      }

      try {
        const stored = localStorage.getItem("lastOrderData");
        if (stored) setOrder(JSON.parse(stored));
      } catch {}

      setLoading(false);
    };

    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Facebook Pixel + Conversions API — Purchase event ────────────────────
  useEffect(() => {
    if (!order?._id) return;
    const flag = `fb_purchase_${order._id}`;
    try { if (localStorage.getItem(flag)) return; } catch {}
    try { localStorage.setItem(flag, '1'); } catch {}

    const _pd    = order.paymentDetails || {};
    const _items = order.products?.items || [];
    const _total = _pd.total ?? _items.reduce((s, i) => s + i.price * (i.quantity || 1), 0);
    const _ids   = _items.map(i => String(i.productId || i._id || i.title || '')).filter(Boolean);
    const _count = _items.reduce((s, i) => s + (i.quantity || 1), 0);
    const eventId = `purchase_${order._id}`;

    try {
      if (typeof window.fbq === 'function') {
        window.fbq('track', 'Purchase',
          { value: _total, currency: 'MAD', content_ids: _ids, content_type: 'product', num_items: _count },
          { eventID: eventId },
        );
      }
    } catch {}

    try {
      const getCookie = (name) => {
        const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : null;
      };
      const contents = _items.map(i => ({ id: String(i.productId || i._id || ''), quantity: i.quantity || 1, item_price: i.price, title: i.title || '' }));
      fetch('/api/facebook/capi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_name: 'Purchase', event_id: eventId, event_source_url: window.location.href, fbp: getCookie('_fbp'), fbc: getCookie('_fbc'), user_agent: navigator.userAgent, value: _total, currency: 'MAD', content_ids: _ids, contents, num_items: _count, order_id: order._id, phone: order.phone, city: order.shipping?.address?.city }),
      }).catch(() => {});
    } catch {}
  }, [order?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live polling — re-fetch order every 8 s until confirmed ─────────────────
  // Stops automatically when order.status === "confirmed" or paymentStatus === "success"
  // so we never keep polling a done order.
  useEffect(() => {
    const oid = orderIdRef.current || order?._id;
    if (!oid) return;

    // Already confirmed / paid — no need to poll
    if (order?.status === "confirmed" || order?.paymentStatus === "success") return;

    const tick = async () => {
      try {
        const r = await fetch(`/api/order/status?orderId=${oid}`);
        if (!r.ok) return;
        const fresh = await r.json();
        if (fresh?._id) setOrder(fresh);
      } catch {}
    };

    const id = setInterval(tick, 8_000);
    return () => clearInterval(id);
  }, [order?._id, order?.status, order?.paymentStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── "Complete Payment" — reconstruct checkout state then go to confirm page ──
  const handleCompletePayment = () => {
    if (!order) return;
    const pd = order.paymentDetails || {};
    try {
      // Mark the existing order so confirm page updates it instead of creating a new one
      localStorage.setItem("pendingOrderId", order._id);

      // Rebuild address from order data
      localStorage.setItem("checkoutAddress", JSON.stringify({
        fullName: order.name  || "",
        phone:    order.phone || "",
        email:    order.email || order.customerEmail || "",
        city:     order.shipping?.address?.city     || "",
        address:  order.shipping?.address?.address1 || "",
      }));

      // Rebuild shipping object (confirm page uses paymentType + price)
      localStorage.setItem("selectedShipping", JSON.stringify({
        name:        pd.shippingCompany || "",
        price:       pd.shippingCost    || 0,
        isFree:      !pd.shippingCost,
        paymentType: pd.paymentMethod === "cod_deposit" ? "cod_deposit" : "prepaid",
        deposit:     pd.deposit || 0,
      }));

      // Rebuild payment method (confirm page uses .id to look up fresh bank info)
      localStorage.setItem("selectedPaymentMethod", JSON.stringify({
        id:       pd.paymentMethodId || null,
        name:     pd.bankName        || "",
        bankName: pd.bankName        || "",
      }));

      // Rebuild buyNow so confirm page can show the order summary
      const buyNow = (order.products?.items || []).map(item => ({
        productId:  item.productId,
        title:      item.title    || "",
        price:      item.price    || 0,
        quantity:   item.quantity || 1,
        images:     Array.isArray(item.images) ? item.images : [],
        isFreeGift: item.isFreeGift || item._isGift || false,
        _giftId:    item._giftId   || undefined,
      }));
      localStorage.setItem("buyNow", JSON.stringify(buyNow));
    } catch {}

    router.push("/checkout/confirm");
  };

  // ── Derived values ───────────────────────────────────────────────────────
  const pd        = order?.paymentDetails || {};
  const items     = order?.products?.items || [];
  const subtotal  = pd.subtotal    ?? items.reduce((s, i) => s + i.price * (i.quantity || 1), 0);
  const shipping  = pd.shippingCost  || 0;
  const discount  = pd.promoDiscount || 0;
  const total     = pd.total ?? subtotal;
  const isDeposit = pd.paymentMethod === "cod_deposit";
  const isPrepaid = pd.paymentMethod === "bank_transfer" || pd.paymentMethod === "prepaid";

  // Status detection
  const isBankTransfer = pd.paymentMethod === "bank_transfer" || pd.paymentMethod === "cod_deposit";
  const isPending      = order?.status === "pending" && order?.paymentStatus !== "success";
  const hasReceipt     = !!pd.bankScreenshot;
  const underReview    = isPending && hasReceipt;                  // receipt submitted, waiting admin
  const needsPayment   = isPending && isBankTransfer && !hasReceipt; // still needs to pay (no receipt yet)

  const whatsappNumber = storeSettings?.whatsappNumber || "";
  const whatsappUrl    = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${buildWhatsAppMsg(order, lang)}`
    : null;

  const dateLocale = lang === "fr" ? "fr-MA" : "ar-MA";
  const orderDate  = order?.createdAt ? new Date(order.createdAt) : null;
  const fmtDate    = orderDate?.toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" }) || "";
  const fmtTime    = orderDate?.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" }) || "";

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-8 h-8 border-[3px] border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Page ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto">

        {/* ── Action bar (top) ── */}
        <div className="flex items-center justify-between mb-5 print:hidden">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-semibold transition-colors"
          >
            <Home className="w-4 h-4" />
            {t("success_back_home")}
          </Link>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <Printer className="w-4 h-4" />
            {t("success_print")}
          </button>
        </div>

        {/* ── Status banner ── */}
        {underReview ? (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 flex items-center gap-4 mb-5 print:hidden">
            <Clock className="w-9 h-9 text-blue-500 flex-shrink-0" />
            <div>
              <p className="font-black text-blue-800 text-base">
                {lang === "ar" ? "الوصل قيد المراجعة" : "Reçu envoyé — en attente de validation"}
              </p>
              <p className="text-sm text-blue-600 mt-0.5">
                {lang === "ar"
                  ? "تم استلام إثبات الدفع. سنؤكد طلبك قريباً."
                  : "Votre reçu a été reçu. Nous confirmerons votre commande très bientôt."}
              </p>
            </div>
          </div>
        ) : needsPayment ? (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4 flex items-center gap-4 mb-5 print:hidden">
            <AlertCircle className="w-9 h-9 text-orange-500 flex-shrink-0" />
            <div>
              <p className="font-black text-orange-800 text-base">
                {lang === "ar" ? "في انتظار الدفع" : "Commande en attente de paiement"}
              </p>
              <p className="text-sm text-orange-600 mt-0.5">
                {lang === "ar"
                  ? "يرجى إتمام الدفع لتأكيد طلبك."
                  : "Veuillez finaliser le paiement pour confirmer votre commande."}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 flex items-center gap-4 mb-5 print:hidden">
            <CheckCircle className="w-9 h-9 text-green-500 flex-shrink-0" />
            <div>
              <p className="font-black text-green-800 text-base">{t("success_confirmed")}</p>
              <p className="text-sm text-green-600 mt-0.5">{t("success_confirmed_sub")}</p>
            </div>
          </div>
        )}

        {/* ── "Complete Payment" button — only for pending bank-transfer orders ── */}
        {needsPayment && (
          <button
            onClick={handleCompletePayment}
            className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-800 active:scale-[0.98] text-white py-4 rounded-2xl font-black text-base transition-all shadow-lg mb-5 print:hidden"
          >
            <CreditCard className="w-5 h-5" />
            {lang === "ar" ? "إتمام الدفع الآن" : "Finaliser le paiement"}
          </button>
        )}

        {/* ── WhatsApp CTA ── */}
        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#1ebe59] active:scale-[0.98] text-white py-4 rounded-2xl font-black text-base transition-all shadow-lg shadow-green-200 mb-5 print:hidden"
          >
            <MessageCircle className="w-5 h-5" />
            {t("success_whatsapp")}
          </a>
        )}

        {/* ── Invoice card ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden print:shadow-none print:border-none">

          {/* Header */}
          <div className="bg-gray-900 px-6 py-6 text-white">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-black tracking-tight">{t("success_order_title")}</h1>
                <p className="text-gray-400 text-sm mt-0.5">{t("success_order_subtitle")}</p>
              </div>
              {order?._id && (
                <div className="text-right">
                  <p className="text-xs text-gray-400">{t("success_order_number")}</p>
                  <p className="text-lg font-black">#{order._id.slice(-6).toUpperCase()}</p>
                </div>
              )}
            </div>
            {orderDate && (
              <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-gray-400 text-xs">{t("success_date")}</p>
                  <p className="font-semibold">{fmtDate}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">{t("success_time")}</p>
                  <p className="font-semibold">{fmtTime}</p>
                </div>
                {pd.paymentMethod && (
                  <div>
                    <p className="text-gray-400 text-xs">{t("success_payment_method")}</p>
                    <p className="font-semibold">{payLabel(pd.paymentMethod, lang, bankMethods)}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Customer info */}
          {order && (
            <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/50">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">{t("success_customer_info")}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: t("success_name"),             value: order.name },
                  { label: t("success_phone"),            value: order.phone },
                  { label: t("success_city"),             value: order.shipping?.address?.city },
                  { label: t("success_address"),          value: order.shipping?.address?.address1 },
                  { label: t("success_shipping_company"), value: pd.shippingCompany },
                ].map(({ label, value }) =>
                  value ? (
                    <div key={label}>
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className="font-semibold text-gray-900">{value}</p>
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          )}

          {/* Products */}
          {items.length > 0 && (
            <div className="px-6 py-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">{t("success_products")}</p>
              <div className="space-y-3">
                {items.map((item, i) => {
                  const img = resolveImg(item);
                  return (
                    <div key={i} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
                      <img
                        src={img}
                        alt={item.title}
                        className="w-12 h-12 object-cover rounded-xl border border-gray-100 flex-shrink-0"
                        onError={(e) => { e.currentTarget.src = PLACEHOLDER; }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{item.title}</p>
                        {Array.isArray(item.variants) && item.variants.map(v => (
                          <p key={v.name} className="text-xs text-gray-400">{v.name}: {v.value}</p>
                        ))}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500">{item.quantity} ×</span>
                          <span className="text-xs font-bold text-gray-700">{item.price} MAD</span>
                          {item.originalPrice && item.originalPrice > item.price && (
                            <span className="text-xs text-gray-400 line-through">{item.originalPrice} MAD</span>
                          )}
                        </div>
                      </div>
                      <p className="font-black text-gray-900 text-sm flex-shrink-0">
                        {(item.price * (item.quantity || 1)).toFixed(0)} MAD
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100">
            <div className="space-y-2 max-w-xs ml-auto text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{t("success_subtotal")}</span>
                <span className="font-semibold">{subtotal.toFixed(0)} MAD</span>
              </div>
              {shipping > 0 ? (
                <div className="flex justify-between">
                  <span className="text-gray-500">
                    {t("success_shipping")}{pd.shippingCompany ? ` — ${pd.shippingCompany}` : ""}
                  </span>
                  <span className="font-semibold">{shipping.toFixed(0)} MAD</span>
                </div>
              ) : (
                <div className="flex justify-between text-green-600">
                  <span>{t("success_free_shipping")}</span>
                  <span className="font-semibold">{t("success_free_shipping_val")}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>{t("success_discount")}</span>
                  <span className="font-semibold">−{discount.toFixed(0)} MAD</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
                <span className="font-black text-gray-900 text-base">{t("success_total")}</span>
                <span className="font-black text-gray-900 text-base">{total.toFixed(0)} MAD</span>
              </div>
              {isDeposit && pd.deposit > 0 && (
                <>
                  <div className="flex justify-between text-orange-600">
                    <span>{t("success_deposit")}</span>
                    <span className="font-bold">{pd.deposit.toFixed(0)} MAD</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>{t("success_remaining")}</span>
                    <span className="font-bold">{Math.max(0, total - pd.deposit).toFixed(0)} MAD</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Payment badge */}
          {pd.paymentMethod && (
            <div className="px-6 py-3 border-t border-gray-100 flex justify-end items-center gap-2">
              <span className={`text-xs px-3 py-1.5 rounded-full font-bold
                ${isPrepaid  ? "bg-blue-50 text-blue-600"
                : isDeposit  ? "bg-orange-50 text-orange-600"
                : "bg-gray-100 text-gray-600"}`}>
                {isPrepaid ? "💳 " : isDeposit ? "💰 " : "💵 "}
                {payLabel(pd.paymentMethod, lang, bankMethods)}
              </span>
              {isPending && (
                <span className="text-xs px-3 py-1.5 rounded-full font-bold bg-orange-50 text-orange-600">
                  {underReview ? "🔄 En vérification" : "⏳ En attente"}
                </span>
              )}
            </div>
          )}

          {/* Payment receipt screenshot — shown when customer already uploaded one */}
          {hasReceipt && (
            <div className="px-6 py-4 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
                {lang === "ar" ? "إثبات الدفع المرسل" : "Reçu de paiement envoyé"}
              </p>
              <div className="rounded-2xl overflow-hidden border border-gray-200 bg-gray-50">
                <img
                  src={pd.bankScreenshot}
                  alt="receipt"
                  className="w-full max-h-72 object-contain"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              </div>
              {pd.receiptUploadedAt && (
                <p className="text-xs text-gray-400 mt-2 text-center">
                  {lang === "ar" ? "تم الإرسال" : "Envoyé le"}{" "}
                  {new Date(pd.receiptUploadedAt).toLocaleString(
                    lang === "fr" ? "fr-MA" : "ar-MA",
                    { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
                  )}
                </p>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 text-center border-t border-gray-100">
            <p className="text-xs text-gray-400">{t("success_thank_you")}</p>
            {order?._id && <p className="text-xs text-gray-300 mt-1">{order._id}</p>}
          </div>
        </div>

        {/* ── Feedback banner ── */}
        <Link
          href="/feedback"
          className="mt-5 flex items-center gap-4 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 hover:bg-amber-100 active:scale-[0.99] transition-all cursor-pointer print:hidden group"
        >
          <span className="text-2xl flex-shrink-0">⭐</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-amber-900 text-sm">{t("success_feedback_title")}</p>
            <p className="text-xs text-amber-700 mt-0.5">{t("success_feedback_sub")}</p>
          </div>
          <span className="text-xs font-bold text-amber-800 bg-amber-200 group-hover:bg-amber-300 px-3 py-1.5 rounded-full transition-colors flex-shrink-0">
            {t("success_feedback_btn")}
          </span>
        </Link>

        {/* ── Bottom actions ── */}
        <div className="mt-3 flex flex-col sm:flex-row gap-3 print:hidden">
          <Link
            href="/"
            className="flex-1 flex items-center justify-center gap-2 py-3.5 border border-gray-200 text-gray-700 rounded-2xl font-semibold text-sm hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            <Home className="w-4 h-4" />
            {t("success_back_home")}
          </Link>
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-[#25D366] text-white rounded-2xl font-semibold text-sm hover:bg-[#1ebe59] active:scale-[0.98] transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              {t("success_whatsapp_short")}
            </a>
          )}
        </div>

      </div>

      <style>{`
        @media print {
          body { background: white; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="w-8 h-8 border-[3px] border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
