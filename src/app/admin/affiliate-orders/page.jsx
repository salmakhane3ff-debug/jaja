"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, ShoppingBag, Loader2, ChevronDown, AlertTriangle, Shield, XCircle } from "lucide-react";

const STATUSES = ["all", "pending", "confirmed", "shipped", "delivered", "cancelled"];

const STATUS_CONFIG = {
  pending:   { label: "En attente",   cls: "bg-yellow-100 text-yellow-700" },
  confirmed: { label: "Confirmée",    cls: "bg-blue-100   text-blue-700"   },
  shipped:   { label: "En livraison", cls: "bg-purple-100 text-purple-700" },
  delivered: { label: "Livrée",       cls: "bg-green-100  text-green-700"  },
  cancelled: { label: "Annulée",      cls: "bg-red-100    text-red-700"    },
};

function StatusBadge({ status }) {
  const c = STATUS_CONFIG[status] || { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${c.cls}`}>{c.label}</span>;
}

function SuspiciousBadge({ reason }) {
  return (
    <span
      title={reason || "Activité suspecte"}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 cursor-help"
    >
      <AlertTriangle className="w-3 h-3" />
      Suspect
    </span>
  );
}

function fmtMoney(n) { return n != null ? `${Number(n).toFixed(0)} MAD` : "—"; }
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function productPreview(order) {
  const items = order.orderItems;
  if (!items || items.length === 0) return order.productTitle || '—';
  if (items.length === 1) {
    const { productName, quantity } = items[0];
    return quantity > 1 ? `${productName} ×${quantity}` : (productName || order.productTitle || '—');
  }
  const { productName, quantity } = items[0];
  const rest = items.length - 1;
  return `${productName} ×${quantity} + ${rest} autre${rest > 1 ? 's' : ''}`;
}

function formatPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('212')) return '+' + digits;
  if (digits.startsWith('0'))   return '+212' + digits.slice(1);
  return '+212' + digits;
}

function OrderDetailsModal({ order, onClose }) {
  if (!order) return null;

  // shippingAddress shape: { name, phone, address: { city, address1 } }
  const shipping  = (order.shippingAddress && typeof order.shippingAddress === 'object')
    ? order.shippingAddress : {};
  const addrObj   = (shipping.address && typeof shipping.address === 'object')
    ? shipping.address : shipping;
  const phone     = formatPhone(order.clientPhone || shipping.phone);
  const waPhone   = phone?.replace('+', '') || null;
  const city      = addrObj.city  || addrObj.state  || null;
  const addrLine  = [addrObj.address1, addrObj.address2].filter(Boolean).join(', ') || null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Détails de la commande</h3>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              {order.orderId ? `#${order.orderId.slice(0, 8).toUpperCase()}` : 'ID non lié'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <XCircle className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
        {/* Client + address + phone */}
        <div className="px-5 py-4 border-b border-gray-100 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <p className="text-sm font-bold text-gray-900">{order.clientName || '—'}</p>
              {city     && <p className="text-xs text-gray-500">📍 {city}</p>}
              {addrLine && <p className="text-xs text-gray-400">{addrLine}</p>}
              <p className="text-xs text-gray-400 font-mono">@{order.affiliateUsername || '—'}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <StatusBadge status={order.status} />
              <span className="text-[10px] text-gray-400">{fmtDate(order.createdAt)}</span>
            </div>
          </div>
          {phone && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg">{phone}</span>
              <a
                href={`tel:${phone}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors"
              >
                📞 Appeler
              </a>
              <a
                href={`https://wa.me/${waPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-xl transition-colors"
              >
                💬 WhatsApp
              </a>
            </div>
          )}
        </div>

        {/* Products list */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
            📦 المنتجات
          </p>
          <div className="space-y-2">
            {order.orderItems && order.orderItems.length > 0 ? (
              order.orderItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 px-3 bg-gray-50 rounded-xl">
                  {/* Product image */}
                  {item.productImage ? (
                    <img
                      src={item.productImage}
                      alt={item.productName}
                      className="w-12 h-12 rounded-xl object-cover shrink-0 border border-gray-200"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gray-200 flex items-center justify-center shrink-0">
                      <ShoppingBag className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  {/* Name + qty */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-snug">
                      {item.productName}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      ×{item.quantity} — {fmtMoney(item.price)} / u
                    </p>
                  </div>
                  {/* Subtotal */}
                  <p className="text-sm font-bold text-gray-800 whitespace-nowrap shrink-0">
                    {fmtMoney(item.price * item.quantity)}
                  </p>
                </div>
              ))
            ) : (
              <div className="py-2.5 px-3 bg-gray-50 rounded-xl text-sm text-gray-700">
                {order.productTitle || '—'}
              </div>
            )}
          </div>
        </div>

        {/* Totals */}
        <div className="px-5 py-4 border-t border-gray-100 mt-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900">Total commande</span>
            <span className="text-base font-black text-gray-900">{fmtMoney(order.total)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Commission affilié</span>
            <span className="text-sm font-bold text-green-700">{fmtMoney(order.commissionAmount)}</span>
          </div>
        </div>
        </div>{/* end scrollable */}
      </div>
    </div>
  );
}

export default function AdminAffiliateOrdersPage() {
  const [orders,       setOrders]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSusp,   setFilterSusp]   = useState(false);
  const [updatingId,   setUpdatingId]   = useState(null);
  const [detailsOrder, setDetailsOrder] = useState(null);

  useEffect(() => {
    fetch("/api/admin/affiliate-orders")
      .then((r) => r.json())
      .then((d) => setOrders(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const displayed = useMemo(() => {
    let list = orders;
    if (filterStatus !== "all") list = list.filter((o) => o.status === filterStatus);
    if (filterSusp)             list = list.filter((o) => o.isSuspicious);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((o) =>
      o.clientName?.toLowerCase().includes(q) ||
      o.clientPhone?.includes(q) ||
      o.affiliateUsername?.toLowerCase().includes(q) ||
      o.affiliateName?.toLowerCase().includes(q) ||
      o.ipAddress?.includes(q)
    );
    return list;
  }, [orders, filterStatus, filterSusp, search]);

  const suspCount = orders.filter((o) => o.isSuspicious).length;

  const handleStatusChange = async (id, status) => {
    setUpdatingId(id);
    try {
      const r = await fetch("/api/admin/affiliate-orders", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id, status }),
      });
      if (r.ok) {
        setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status } : o));
      }
    } catch {}
    setUpdatingId(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="py-6 max-w-7xl space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commandes affiliés</h1>
          <p className="text-sm text-gray-500 mt-0.5">{displayed.length} / {orders.length} commande(s)</p>
        </div>
        {suspCount > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-bold text-red-700">{suspCount} commande(s) suspecte(s)</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Client, téléphone, affilié, IP..."
            className="w-full pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 bg-gray-50"
          />
        </div>
        <div className="relative">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 bg-gray-50 appearance-none"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "Tous les statuts" : STATUS_CONFIG[s]?.label || s}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
        <button
          onClick={() => setFilterSusp((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl transition-colors
            ${filterSusp
              ? "bg-red-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-700"}`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          {filterSusp ? "Suspects uniquement" : "Tous"}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <ShoppingBag className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">Aucune commande</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["ID Cmd","Affilié","Client","Téléphone","IP","Nb articles","Produit","Statut","Total","Commission","Date","Alerte","Voir","Action"].map((h) => (
                    <th key={h} className="text-right text-xs font-semibold text-gray-500 px-3 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayed.map((o) => (
                  <tr
                    key={o.id}
                    className={`transition-colors ${
                      o.isSuspicious
                        ? "bg-red-50 hover:bg-red-100"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-3 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                      {o.orderId ? `#${o.orderId.slice(0, 8).toUpperCase()}` : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-gray-800 text-xs">{o.affiliateName || o.affiliateUsername || "—"}</p>
                      <p className="text-xs text-gray-400 font-mono">@{o.affiliateUsername}</p>
                    </td>
                    <td className="px-3 py-3 text-gray-800 font-medium whitespace-nowrap">{o.clientName || "—"}</td>
                    <td className="px-3 py-3 text-gray-600 font-mono text-xs whitespace-nowrap">{o.clientPhone || "—"}</td>
                    <td className="px-3 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">{o.ipAddress || "—"}</td>
                    <td className="px-3 py-3 text-right">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                        {o.totalItems > 0 ? o.totalItems : 1}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-600 max-w-[130px] truncate text-xs">{productPreview(o)}</td>
                    <td className="px-3 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-3 py-3 font-semibold whitespace-nowrap">{fmtMoney(o.total)}</td>
                    <td className="px-3 py-3 text-green-700 font-semibold whitespace-nowrap">{fmtMoney(o.commissionAmount)}</td>
                    <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(o.createdAt)}</td>
                    <td className="px-3 py-3">
                      {o.isSuspicious ? (
                        <SuspiciousBadge reason={o.suspicionReason} />
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-300">
                          <Shield className="w-3 h-3" />
                          OK
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() => setDetailsOrder(o)}
                        className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                      >
                        Voir
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="relative">
                        <select
                          value={o.status}
                          disabled={updatingId === o.id}
                          onChange={(e) => handleStatusChange(o.id, e.target.value)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-gray-400 disabled:opacity-50"
                        >
                          {STATUSES.filter((s) => s !== "all").map((s) => (
                            <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OrderDetailsModal order={detailsOrder} onClose={() => setDetailsOrder(null)} />
    </div>
  );
}
