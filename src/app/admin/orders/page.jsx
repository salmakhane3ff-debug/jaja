"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingBag, Eye, RefreshCw, Search, ChevronDown,
  ArrowUpDown, CheckCircle, XCircle, Loader2, Copy, Link2,
} from "lucide-react";

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
  cod:           "Cash on Delivery",
  bank_transfer: "تحويل بنكي",
  prepaid:       "Prepaid",
  cod_deposit:   "عربون",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-MA", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function normaliseStatus(s) {
  if (!s) return "NEW";
  return s.toUpperCase();
}

function StatusBadge({ status }) {
  const key = normaliseStatus(status);
  const cls = STATUS_STYLES[key] || "bg-gray-50 text-gray-600 border border-gray-200";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {key}
    </span>
  );
}

// ── Status update dropdown ────────────────────────────────────────────────────

function StatusDropdown({ orderId, current, onUpdated }) {
  const [open,    setOpen]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [flash,   setFlash]   = useState(null); // "ok" | "err"

  const update = async (newStatus) => {
    setOpen(false);
    if (normaliseStatus(current) === newStatus) return;
    setSaving(true);
    try {
      const res = await fetch("/api/order", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: orderId, status: newStatus }),
      });
      if (res.ok) {
        setFlash("ok");
        onUpdated(orderId, newStatus);
      } else {
        setFlash("err");
      }
    } catch {
      setFlash("err");
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 2000);
    }
  };

  return (
    <div className="relative inline-block">
      {flash === "ok"  && <CheckCircle className="w-4 h-4 text-green-500 absolute -top-1 -right-1 z-10" />}
      {flash === "err" && <XCircle     className="w-4 h-4 text-red-500   absolute -top-1 -right-1 z-10" />}

      <button
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-white border border-gray-200 hover:border-gray-400 transition-colors disabled:opacity-50"
      >
        {saving
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <RefreshCw className="w-3 h-3 text-gray-500" />}
        <span className="hidden sm:inline">تغيير</span>
        <ChevronDown className="w-3 h-3 text-gray-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[140px]">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => update(s)}
                className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 transition-colors ${
                  normaliseStatus(current) === s ? "bg-gray-50 font-bold" : ""
                }`}
              >
                <StatusBadge status={s} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Copy success-page link ────────────────────────────────────────────────────
function CopyLink({ orderId }) {
  const [copied, setCopied] = useState(false);
  if (!orderId) return null;
  const url = `${typeof window !== "undefined" ? window.location.origin : "https://proprogiftvip.com"}/checkout/success?orderId=${orderId}`;
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      title={url}
      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
        copied ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
      }`}
    >
      {copied ? <CheckCircle className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
      <span className="hidden sm:inline">{copied ? "Copié" : "Lien"}</span>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const router = useRouter();

  const [orders,      setOrders]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [statusFilter,setStatusFilter]= useState("ALL");
  const [sortDesc,    setSortDesc]    = useState(true); // newest first

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/order")
      .then((r) => r.json())
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  // ── Inline status update (optimistic) ────────────────────────────────────
  const handleStatusUpdated = (id, newStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o._id === id ? { ...o, status: newStatus } : o))
    );
  };

  // ── Filtered + sorted list ────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = [...orders];

    // Search by phone, name, or short order ID
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.phone?.includes(q) ||
          o.name?.toLowerCase().includes(q) ||
          o._id?.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== "ALL") {
      list = list.filter((o) => normaliseStatus(o.status) === statusFilter);
    }

    // Sort
    list.sort((a, b) => {
      const diff = new Date(b.createdAt) - new Date(a.createdAt);
      return sortDesc ? diff : -diff;
    });

    return list;
  }, [orders, search, statusFilter, sortDesc]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="py-6 space-y-5 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الطلبات</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {displayed.length} من {orders.length} طلب
          </p>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-xl text-sm">
          <ShoppingBag className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-blue-700">{orders.length} إجمالي</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="بحث بالهاتف أو الاسم..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 bg-gray-50"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:border-gray-400"
        >
          <option value="ALL">كل الحالات</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Sort toggle */}
        <button
          onClick={() => setSortDesc((d) => !d)}
          className="flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 hover:border-gray-400 transition-colors"
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
          {sortDesc ? "الأحدث أولاً" : "الأقدم أولاً"}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingBag className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">لا توجد طلبات</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["رقم الطلب","العميل","الهاتف","المدينة","شركة التوصيل","التوصيل","المجموع","الدفع","الحالة","التاريخ","إجراءات"].map((h) => (
                    <th
                      key={h}
                      className="text-right text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayed.map((order) => {
                  const city            = order.shipping?.address?.city || "—";
                  const total           = order.paymentDetails?.total;
                  const payMethod       = order.paymentDetails?.paymentMethod;
                  const shippingCompany = order.paymentDetails?.shippingCompany;
                  const shippingCost    = order.paymentDetails?.shippingCost;

                  return (
                    <tr key={order._id} className="hover:bg-gray-50 transition-colors">
                      {/* Order ID */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-gray-500">
                          #{order._id?.slice(-8).toUpperCase()}
                        </span>
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 whitespace-nowrap">
                          {order.name || "—"}
                        </span>
                      </td>

                      {/* Phone */}
                      <td className="px-4 py-3">
                        <span className="text-gray-600 tabular-nums">{order.phone || "—"}</span>
                      </td>

                      {/* City */}
                      <td className="px-4 py-3">
                        <span className="text-gray-600 whitespace-nowrap">{city}</span>
                      </td>

                      {/* Shipping company */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-700 whitespace-nowrap font-medium">
                          {shippingCompany || "—"}
                        </span>
                      </td>

                      {/* Shipping cost */}
                      <td className="px-4 py-3">
                        <span className="text-xs whitespace-nowrap">
                          {shippingCost != null
                            ? shippingCost === 0
                              ? <span className="text-green-600 font-semibold">مجاني</span>
                              : `${Number(shippingCost).toFixed(0)} MAD`
                            : "—"
                          }
                        </span>
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3">
                        <span className="font-semibold text-gray-900 whitespace-nowrap">
                          {total != null ? `${Number(total).toFixed(0)} MAD` : "—"}
                        </span>
                      </td>

                      {/* Payment method */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {PAY_LABELS[payMethod] || payMethod || "—"}
                        </span>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3">
                        <StatusBadge status={order.status} />
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-gray-400">{fmtDate(order.createdAt)}</span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => router.push(`/admin/orders/${order._id}`)}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            <span className="hidden sm:inline">عرض</span>
                          </button>
                          <CopyLink orderId={order._id} />
                          <StatusDropdown
                            orderId={order._id}
                            current={order.status}
                            onUpdated={handleStatusUpdated}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
