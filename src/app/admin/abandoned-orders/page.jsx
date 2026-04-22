"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShoppingCart, Phone, User, MapPin, Clock,
  Trash2, RefreshCw, CheckCircle, Filter, Package,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m    = Math.floor(diff / 60000);
  const h    = Math.floor(m / 60);
  const d    = Math.floor(h / 24);
  if (d > 0)  return `${d}j`;
  if (h > 0)  return `${h}h`;
  if (m > 0)  return `${m}min`;
  return "maintenant";
}

function formatMAD(n) {
  return `${parseFloat(n || 0).toFixed(0)} MAD`;
}

// ── Cart Items Popover ────────────────────────────────────────────────────────
function ItemsTooltip({ items }) {
  const [open, setOpen] = useState(false);
  const paid = (items || []).filter((i) => !i.isFreeGift);
  if (paid.length === 0) return <span className="text-gray-400 text-xs">—</span>;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        <Package className="w-3.5 h-3.5" />
        {paid.length} article{paid.length > 1 ? "s" : ""}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-6 left-0 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
            {paid.map((item, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                {item.images?.[0] && (
                  <img
                    src={typeof item.images[0] === "string" ? item.images[0] : item.images[0]?.url || ""}
                    alt=""
                    className="w-8 h-8 object-cover rounded-md border border-gray-100 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-gray-800 truncate">{item.title}</div>
                  <div className="text-gray-500">×{item.quantity} — {formatMAD(item.price * item.quantity)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AbandonedOrdersPage() {
  const [carts,    setCarts]    = useState([]);
  const [total,    setTotal]    = useState(0);
  const [pages,    setPages]    = useState(1);
  const [page,     setPage]     = useState(1);
  const [showAll,  setShowAll]  = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [deleting, setDeleting] = useState(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/abandoned-carts?page=${page}${showAll ? "&all=1" : ""}`);
      const data = await res.json();
      setCarts(data.carts  || []);
      setTotal(data.total  || 0);
      setPages(data.pages  || 1);
    } catch {
      setCarts([]);
    } finally {
      setLoading(false);
    }
  }, [page, showAll]);

  useEffect(() => { load(); }, [load]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!confirm("Supprimer ce panier abandonné ?")) return;
    setDeleting(id);
    try {
      await fetch(`/api/abandoned-carts?id=${id}`, { method: "DELETE" });
      setCarts((prev) => prev.filter((c) => c.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch {}
    setDeleting(null);
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const activeCount    = carts.filter((c) => !c.recovered).length;
  const recoveredCount = carts.filter((c) => c.recovered).length;
  const totalValue     = carts.filter((c) => !c.recovered).reduce((s, c) => s + (c.cartTotal || 0), 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-orange-500" />
            Paniers Abandonnés
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Clients qui ont commencé le checkout mais n&apos;ont pas finalisé leur commande
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
          <div className="text-2xl font-bold text-orange-600">{total}</div>
          <div className="text-xs text-orange-700 mt-1">
            {showAll ? "Total" : "Non récupérés"}
          </div>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <div className="text-2xl font-bold text-red-600">{formatMAD(totalValue)}</div>
          <div className="text-xs text-red-700 mt-1">Valeur perdue (page actuelle)</div>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
          <div className="text-2xl font-bold text-green-600">{recoveredCount}</div>
          <div className="text-xs text-green-700 mt-1">Récupérés (page actuelle)</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-gray-400" />
        <button
          onClick={() => { setShowAll(false); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            !showAll ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Non récupérés
        </button>
        <button
          onClick={() => { setShowAll(true); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            showAll ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Tous
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Chargement…
          </div>
        ) : carts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <ShoppingCart className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Aucun panier abandonné</p>
            <p className="text-xs mt-1">Les paniers apparaissent dès qu&apos;un client entre son numéro de téléphone au checkout.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Client</th>
                  <th className="px-4 py-3 text-left">Ville</th>
                  <th className="px-4 py-3 text-left">Articles</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-center">Statut</th>
                  <th className="px-4 py-3 text-center">Quand</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {carts.map((cart) => (
                  <tr key={cart.id} className={`hover:bg-gray-50 transition-colors ${cart.recovered ? "opacity-60" : ""}`}>
                    {/* Client */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {cart.fullName && (
                          <span className="flex items-center gap-1 font-semibold text-gray-900">
                            <User className="w-3 h-3 text-gray-400 shrink-0" />
                            {cart.fullName}
                          </span>
                        )}
                        <a
                          href={`https://wa.me/${cart.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-green-700 hover:text-green-900 font-medium"
                        >
                          <Phone className="w-3 h-3 shrink-0" />
                          {cart.phone}
                        </a>
                        {cart.email && (
                          <span className="text-xs text-gray-400">{cart.email}</span>
                        )}
                      </div>
                    </td>
                    {/* Ville */}
                    <td className="px-4 py-3">
                      {cart.city ? (
                        <span className="flex items-center gap-1 text-gray-700">
                          <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                          {cart.city}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {/* Articles */}
                    <td className="px-4 py-3">
                      <ItemsTooltip items={Array.isArray(cart.items) ? cart.items : []} />
                    </td>
                    {/* Total */}
                    <td className="px-4 py-3 text-right font-bold text-gray-900">
                      {formatMAD(cart.cartTotal)}
                    </td>
                    {/* Statut */}
                    <td className="px-4 py-3 text-center">
                      {cart.recovered ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                          <CheckCircle className="w-3 h-3" />
                          Récupéré
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
                          <Clock className="w-3 h-3" />
                          Abandonné
                        </span>
                      )}
                    </td>
                    {/* Quand */}
                    <td className="px-4 py-3 text-center text-gray-400 text-xs">
                      {timeAgo(cart.createdAt)}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(cart.id)}
                        disabled={deleting === cart.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            ← Précédent
          </button>
          <span className="text-sm text-gray-500">Page {page} / {pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
            className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            Suivant →
          </button>
        </div>
      )}

      {/* Help note */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-xs text-blue-700">
        <strong>Comment fonctionne la capture ?</strong><br />
        Dès qu&apos;un client entre son numéro de téléphone sur la page checkout, son panier est automatiquement enregistré ici.
        Si le client finalise sa commande, son panier passe en statut &quot;Récupéré&quot; automatiquement.
        Le numéro de téléphone est cliquable pour ouvrir WhatsApp directement.
      </div>
    </div>
  );
}
