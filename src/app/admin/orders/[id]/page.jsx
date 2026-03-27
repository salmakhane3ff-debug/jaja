"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight, Package, User, MapPin, CreditCard,
  FileText, Loader2, CheckCircle, XCircle, ExternalLink,
} from "lucide-react";
import Link from "next/link";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = ["NEW", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"];

const STATUS_STYLES = {
  NEW:       "bg-blue-50 text-blue-700 border border-blue-200",
  CONFIRMED: "bg-green-50 text-green-700 border border-green-200",
  SHIPPED:   "bg-purple-50 text-purple-700 border border-purple-200",
  DELIVERED: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  CANCELLED: "bg-red-50 text-red-700 border border-red-200",
};

const PAY_LABELS = {
  cod:           "الدفع عند الاستلام (COD)",
  bank_transfer: "تحويل بنكي",
  prepaid:       "الدفع المسبق",
  cod_deposit:   "عربون + الباقي عند الاستلام",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-MA", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function normaliseStatus(s) {
  return (s || "NEW").toUpperCase();
}

function StatusBadge({ status }) {
  const key = normaliseStatus(status);
  const cls = STATUS_STYLES[key] || "bg-gray-50 text-gray-600 border border-gray-200";
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${cls}`}>
      {key}
    </span>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-gray-600" />
        </div>
        <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex justify-between items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm font-medium text-gray-900 text-right ${mono ? "font-mono text-xs" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  const { id }  = useParams();
  const router  = useRouter();

  const [order,       setOrder]       = useState(null);
  const [invoice,     setInvoice]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [notFound,    setNotFound]    = useState(false);

  // Status update state
  const [selStatus,   setSelStatus]   = useState("");
  const [saving,      setSaving]      = useState(false);
  const [saveResult,  setSaveResult]  = useState(null); // "ok" | "err"

  // ── Fetch order + invoice in parallel ───────────────────────────────────
  useEffect(() => {
    if (!id) return;

    Promise.all([
      fetch(`/api/order?orderId=${id}`).then((r) => r.json()),
      fetch(`/api/invoice?orderId=${id}`).then((r) => r.json()).catch(() => null),
    ])
      .then(([orderData, invoiceData]) => {
        // GET /api/order?orderId= returns array or single object
        const ord = Array.isArray(orderData)
          ? orderData.find((o) => o._id === id) || orderData[0]
          : orderData?._id
          ? orderData
          : null;

        if (!ord) { setNotFound(true); return; }

        setOrder(ord);
        setSelStatus(normaliseStatus(ord.status));

        // Invoice may return 404 (not yet created) — handle gracefully
        if (invoiceData?._id) setInvoice(invoiceData);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Status update ────────────────────────────────────────────────────────
  const handleStatusSave = async () => {
    if (!order || normaliseStatus(order.status) === selStatus) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch("/api/order", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: order._id, status: selStatus }),
      });
      if (res.ok) {
        setOrder((prev) => ({ ...prev, status: selStatus }));
        setSaveResult("ok");
      } else {
        setSaveResult("err");
      }
    } catch {
      setSaveResult("err");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveResult(null), 3000);
    }
  };

  // ── States ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="py-16 text-center">
        <p className="text-4xl mb-4">📦</p>
        <h1 className="text-lg font-bold text-gray-900 mb-2">الطلب غير موجود</h1>
        <button
          onClick={() => router.push("/admin/orders")}
          className="mt-4 text-sm text-blue-600 underline"
        >
          العودة للطلبات
        </button>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const pd      = order.paymentDetails || {};
  const addr    = order.shipping?.address || {};
  const items   = order.products?.items   || [];
  const subtotal        = pd.subtotal     ?? items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
  const shippingCost    = pd.shippingCost ?? 0;
  const promoDiscount   = pd.promoDiscount ?? 0;
  const total           = pd.total ?? subtotal + shippingCost - promoDiscount;
  const deposit         = pd.deposit ?? 0;
  const isDeposit       = pd.paymentMethod === "cod_deposit";
  const bankScreenshot  = pd.bankScreenshot || null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="py-6 max-w-3xl space-y-5">

      {/* Back button */}
      <button
        onClick={() => router.push("/admin/orders")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowRight className="w-4 h-4" />
        رجوع للطلبات
      </button>

      {/* ── 1. ORDER HEADER ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">رقم الطلب</p>
            <p className="font-mono text-sm text-gray-800 font-bold">{order._id}</p>
            <p className="text-xs text-gray-400 mt-2">{fmtDate(order.createdAt)}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>
      </div>

      {/* ── 2. CUSTOMER INFO ── */}
      <Section icon={User} title="معلومات العميل">
        <div className="space-y-0">
          <InfoRow label="الاسم"    value={order.name} />
          <InfoRow label="الهاتف"   value={order.phone} />
          <InfoRow label="المدينة"  value={addr.city} />
          <InfoRow label="العنوان"  value={addr.address1} />
          {addr.address2 && <InfoRow label="العنوان 2" value={addr.address2} />}
        </div>
      </Section>

      {/* ── 3. PRODUCTS ── */}
      <Section icon={Package} title="المنتجات">
        {items.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">لا توجد منتجات</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-right text-xs text-gray-400 font-medium pb-2">المنتج</th>
                  <th className="text-right text-xs text-gray-400 font-medium pb-2">الخيارات</th>
                  <th className="text-center text-xs text-gray-400 font-medium pb-2">الكمية</th>
                  <th className="text-right text-xs text-gray-400 font-medium pb-2">السعر</th>
                  <th className="text-right text-xs text-gray-400 font-medium pb-2">المجموع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item, i) => {
                  const unitPrice  = item.price || item.sellingPrice || 0;
                  const lineTotal  = unitPrice * (item.quantity || 1);
                  // Variant info may live in productSnapshot spread onto item
                  const color = item.color || item.selectedColor || null;
                  const size  = item.size  || item.selectedSize  || null;
                  const variantText = [color && `اللون: ${color}`, size && `المقاس: ${size}`]
                    .filter(Boolean).join(" | ") || "—";

                  return (
                    <tr key={i} className="align-top">
                      <td className="py-3 pr-0 pl-4">
                        <div className="flex items-center gap-2">
                          {item.images?.[0] && (
                            <img
                              src={item.images[0]}
                              alt={item.title}
                              className="w-10 h-10 rounded-lg object-cover border border-gray-100 shrink-0"
                            />
                          )}
                          <span className="text-xs font-medium text-gray-900 leading-snug">
                            {item.title || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-xs text-gray-500">{variantText}</td>
                      <td className="py-3 text-center text-xs font-medium text-gray-700">
                        {item.quantity || 1}
                      </td>
                      <td className="py-3 text-xs text-gray-600 whitespace-nowrap">
                        {unitPrice.toFixed(0)} MAD
                      </td>
                      <td className="py-3 text-xs font-semibold text-gray-900 whitespace-nowrap">
                        {lineTotal.toFixed(0)} MAD
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── 4. PAYMENT ── */}
      <Section icon={CreditCard} title="معلومات الدفع">
        <div className="space-y-0">
          <InfoRow
            label="طريقة الدفع"
            value={PAY_LABELS[pd.paymentMethod] || pd.paymentMethod}
          />
          {pd.shippingCompany && (
            <InfoRow label="شركة التوصيل" value={pd.shippingCompany} />
          )}
        </div>

        {/* Bank screenshot */}
        {bankScreenshot && (
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2">إيصال التحويل البنكي</p>
            <img
              src={bankScreenshot}
              alt="Bank receipt"
              className="max-w-xs w-full rounded-xl border border-gray-200 object-contain"
            />
          </div>
        )}
      </Section>

      {/* ── 5. ORDER TOTAL ── */}
      <Section icon={FileText} title="ملخص الطلب">
        <div className="space-y-0 max-w-xs ml-auto">
          <InfoRow label="المجموع الجزئي" value={`${Number(subtotal).toFixed(0)} MAD`} />
          {shippingCost > 0 && (
            <InfoRow
              label={`التوصيل${pd.shippingCompany ? ` — ${pd.shippingCompany}` : ""}`}
              value={`${Number(shippingCost).toFixed(0)} MAD`}
            />
          )}
          {promoDiscount > 0 && (
            <InfoRow
              label="خصم الكوبون"
              value={`−${Number(promoDiscount).toFixed(0)} MAD`}
            />
          )}
          <div className="flex justify-between items-center pt-3 border-t border-gray-100 mt-2">
            <span className="text-sm font-bold text-gray-900">المجموع الكلي</span>
            <span className="text-xl font-black text-amber-500">
              {Number(total).toFixed(0)} MAD
            </span>
          </div>
          {isDeposit && deposit > 0 && (
            <>
              <div className="flex justify-between text-xs text-orange-600 pt-2">
                <span>العربون المدفوع</span>
                <span className="font-bold">{Number(deposit).toFixed(0)} MAD</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>الباقي عند الاستلام</span>
                <span className="font-bold">
                  {Math.max(0, total - deposit).toFixed(0)} MAD
                </span>
              </div>
            </>
          )}
        </div>
      </Section>

      {/* ── 6. ACTIONS ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 text-sm">الإجراءات</h2>

        {/* Status update */}
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">تغيير حالة الطلب</label>
          <div className="flex items-center gap-2">
            <select
              value={selStatus}
              onChange={(e) => setSelStatus(e.target.value)}
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:border-gray-400"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={handleStatusSave}
              disabled={saving || normaliseStatus(order.status) === selStatus}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : "حفظ"}
            </button>
          </div>

          {/* Save feedback */}
          {saveResult === "ok" && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-green-600">
              <CheckCircle className="w-3.5 h-3.5" />
              تم تحديث الحالة بنجاح
            </div>
          )}
          {saveResult === "err" && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-red-500">
              <XCircle className="w-3.5 h-3.5" />
              فشل تحديث الحالة — حاول مجدداً
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
