"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Tag,
  Plus,
  Search,
  Edit3,
  Trash2,
  X,
  Loader2,
  CheckCircle,
  XCircle,
  ToggleLeft,
  ToggleRight,
  Percent,
  DollarSign,
  Calendar,
  Hash,
  AlertCircle,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPromoStatus(promo) {
  const now = new Date();
  if (promo.expiresAt && new Date(promo.expiresAt) < now) return "expired";
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return "limit";
  if (!promo.isActive) return "inactive";
  return "active";
}

function StatusBadge({ promo }) {
  const status = getPromoStatus(promo);
  const map = {
    active:   { label: "Actif",           cls: "bg-green-50 text-green-700 border-green-200" },
    inactive: { label: "Inactif",         cls: "bg-gray-100 text-gray-500 border-gray-200" },
    expired:  { label: "Expiré",          cls: "bg-red-50 text-red-600 border-red-200" },
    limit:    { label: "Limite atteinte", cls: "bg-orange-50 text-orange-600 border-orange-200" },
  };
  const { label, cls } = map[status] || map.inactive;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function TypeBadge({ type }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
      type === "percent"
        ? "bg-purple-50 text-purple-700 border-purple-200"
        : "bg-blue-50 text-blue-700 border-blue-200"
    }`}>
      {type === "percent" ? <Percent className="w-3 h-3" /> : <DollarSign className="w-3 h-3" />}
      {type === "percent" ? "Pourcentage" : "Fixe"}
    </span>
  );
}

function formatDate(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ── Promo Form ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  code: "",
  type: "percent",
  value: "",
  minOrder: "",
  maxUses: "",
  expiresAt: "",
  isActive: true,
};

function PromoForm({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    ...(initial
      ? {
          code: initial.code || "",
          type: initial.type || "percent",
          value: initial.value !== undefined ? String(initial.value) : "",
          minOrder: initial.minOrder ? String(initial.minOrder) : "",
          maxUses: initial.maxUses !== null && initial.maxUses !== undefined ? String(initial.maxUses) : "",
          expiresAt: initial.expiresAt
            ? new Date(initial.expiresAt).toISOString().slice(0, 10)
            : "",
          isActive: initial.isActive !== undefined ? initial.isActive : true,
        }
      : {}),
  }));

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      code: form.code.trim().toUpperCase(),
      value: parseFloat(form.value) || 0,
      minOrder: form.minOrder ? parseFloat(form.minOrder) : 0,
      maxUses: form.maxUses ? parseInt(form.maxUses, 10) : null,
      expiresAt: form.expiresAt || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Code */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          Code promo <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.code}
          onChange={(e) => set("code", e.target.value.toUpperCase())}
          placeholder="EX: SUMMER20"
          required
          disabled={!!initial}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-blue-400 uppercase tracking-widest disabled:opacity-50"
          dir="ltr"
        />
        {!!initial && (
          <p className="text-xs text-gray-400 mt-1">Le code ne peut pas être modifié après création.</p>
        )}
      </div>

      {/* Type + Value */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Type <span className="text-red-500">*</span>
          </label>
          <select
            value={form.type}
            onChange={(e) => set("type", e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-blue-400"
          >
            <option value="percent">Pourcentage (%)</option>
            <option value="fixed">Montant fixe (MAD)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Valeur <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              value={form.value}
              onChange={(e) => set("value", e.target.value)}
              placeholder={form.type === "percent" ? "20" : "50"}
              required
              min="0"
              step="any"
              className="w-full pl-3 pr-10 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-blue-400"
              dir="ltr"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
              {form.type === "percent" ? "%" : "MAD"}
            </span>
          </div>
        </div>
      </div>

      {/* Min Order + Max Uses */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Commande minimum (MAD)</label>
          <input
            type="number"
            value={form.minOrder}
            onChange={(e) => set("minOrder", e.target.value)}
            placeholder="0"
            min="0"
            step="any"
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-blue-400"
            dir="ltr"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Utilisations max</label>
          <input
            type="number"
            value={form.maxUses}
            onChange={(e) => set("maxUses", e.target.value)}
            placeholder="Illimité"
            min="1"
            step="1"
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-blue-400"
            dir="ltr"
          />
        </div>
      </div>

      {/* Expiration */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date d&apos;expiration</label>
        <input
          type="date"
          value={form.expiresAt}
          onChange={(e) => set("expiresAt", e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* Active toggle */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
        <span className="text-sm font-medium text-gray-700">Code actif</span>
        <button
          type="button"
          onClick={() => set("isActive", !form.isActive)}
          className="transition-colors"
        >
          {form.isActive ? (
            <ToggleRight className="w-7 h-7 text-green-500" />
          ) : (
            <ToggleLeft className="w-7 h-7 text-gray-400" />
          )}
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {initial ? "Enregistrer" : "Créer le code"}
        </button>
      </div>
    </form>
  );
}

// ── Confirm Delete Modal ──────────────────────────────────────────────────────

function ConfirmDelete({ promo, onConfirm, onClose, deleting }) {
  return (
    <Modal title="Supprimer le code promo" onClose={onClose}>
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mx-auto">
          <AlertCircle className="w-6 h-6 text-red-500" />
        </div>
        <div>
          <p className="text-sm text-gray-700">
            Voulez-vous supprimer le code{" "}
            <span className="font-bold text-gray-900 tracking-wider">{promo.code}</span> ?
          </p>
          <p className="text-xs text-gray-400 mt-1">Cette action est irréversible.</p>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors disabled:opacity-60"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Supprimer
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, type }) {
  if (!msg) return null;
  const isError = type === "error";
  return (
    <div
      className={`fixed bottom-6 right-6 z-[999] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
        isError ? "bg-red-500 text-white" : "bg-green-500 text-white"
      }`}
    >
      {isError ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminPromoPage() {
  const [promos, setPromos]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [createOpen, setCreateOpen]   = useState(false);
  const [editPromo, setEditPromo]     = useState(null);
  const [deletePromo, setDeletePromo] = useState(null);

  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [togglingId, setTogglingId]   = useState(null);

  const [toast, setToast]             = useState({ msg: "", type: "success" });

  // ── Data fetching ────────────────────────────────────────────────────────────

  async function loadPromos() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/promo");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setPromos(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPromos(); }, []);

  // ── Toast helper ─────────────────────────────────────────────────────────────

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "success" }), 3500);
  }

  // ── CRUD actions ─────────────────────────────────────────────────────────────

  async function handleCreate(data) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erreur");
      setPromos((prev) => [result, ...prev]);
      setCreateOpen(false);
      showToast("Code promo créé avec succès !");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(data) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/promo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, _id: editPromo._id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erreur");
      setPromos((prev) => prev.map((p) => (p._id === result._id ? result : p)));
      setEditPromo(null);
      showToast("Code promo mis à jour !");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/promo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: deletePromo._id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erreur");
      setPromos((prev) => prev.filter((p) => p._id !== deletePromo._id));
      setDeletePromo(null);
      showToast("Code promo supprimé.");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleActive(promo) {
    setTogglingId(promo._id);
    try {
      const res = await fetch("/api/admin/promo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: promo._id, isActive: !promo.isActive }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erreur");
      setPromos((prev) => prev.map((p) => (p._id === result._id ? result : p)));
      showToast(result.isActive ? "Code activé !" : "Code désactivé.");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setTogglingId(null);
    }
  }

  // ── Stats ────────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total    = promos.length;
    const active   = promos.filter((p) => getPromoStatus(p) === "active").length;
    const expired  = promos.filter((p) => getPromoStatus(p) === "expired").length;
    const limit    = promos.filter((p) => getPromoStatus(p) === "limit").length;
    const used     = promos.reduce((s, p) => s + (p.usedCount || 0), 0);
    return { total, active, expired, limit, used };
  }, [promos]);

  // ── Filtered list ────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = promos;
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter((p) => p.code.includes(q));
    }
    if (filterStatus !== "all") {
      list = list.filter((p) => getPromoStatus(p) === filterStatus);
    }
    return list;
  }, [promos, search, filterStatus]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Tag className="w-5 h-5 text-blue-600" />
              Codes Promo
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{stats.total} code{stats.total !== 1 ? "s" : ""} au total</p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nouveau code
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total",            value: stats.total,   color: "text-gray-700",  bg: "bg-white" },
            { label: "Actifs",           value: stats.active,  color: "text-green-600", bg: "bg-green-50" },
            { label: "Expirés",          value: stats.expired, color: "text-red-500",   bg: "bg-red-50" },
            { label: "Limite atteinte",  value: stats.limit,   color: "text-orange-500",bg: "bg-orange-50" },
            { label: "Utilisations",     value: stats.used,    color: "text-blue-600",  bg: "bg-blue-50" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl p-3 border border-gray-100 shadow-sm`}>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un code..."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {["all", "active", "inactive", "expired", "limit"].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  filterStatus === s
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {s === "all" ? "Tous" : s === "active" ? "Actifs" : s === "inactive" ? "Inactifs" : s === "expired" ? "Expirés" : "Limite"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="ml-2 text-sm text-gray-500">Chargement...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Tag className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Aucun code promo</p>
              <p className="text-xs mt-1">Créez votre premier code promo</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {["Code", "Type", "Valeur", "Min. commande", "Utilisations", "Expiration", "Statut", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((promo) => (
                    <tr key={promo._id} className="hover:bg-gray-50/50 transition-colors">
                      {/* Code */}
                      <td className="px-4 py-3">
                        <span className="font-bold tracking-widest text-gray-900 text-xs bg-gray-100 px-2 py-1 rounded-lg">
                          {promo.code}
                        </span>
                      </td>
                      {/* Type */}
                      <td className="px-4 py-3">
                        <TypeBadge type={promo.type} />
                      </td>
                      {/* Valeur */}
                      <td className="px-4 py-3 font-semibold text-gray-800">
                        {promo.type === "percent" ? `${promo.value}%` : `${promo.value} MAD`}
                      </td>
                      {/* Min commande */}
                      <td className="px-4 py-3 text-gray-600">
                        {promo.minOrder > 0 ? `${promo.minOrder} MAD` : "—"}
                      </td>
                      {/* Utilisations */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-gray-600">
                          <Hash className="w-3 h-3 text-gray-400" />
                          <span>{promo.usedCount}</span>
                          {promo.maxUses !== null && (
                            <span className="text-gray-400">/ {promo.maxUses}</span>
                          )}
                        </div>
                      </td>
                      {/* Expiration */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-gray-600">
                          <Calendar className="w-3 h-3 text-gray-400" />
                          {formatDate(promo.expiresAt)}
                        </div>
                      </td>
                      {/* Statut */}
                      <td className="px-4 py-3">
                        <StatusBadge promo={promo} />
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {/* Toggle active */}
                          <button
                            onClick={() => handleToggleActive(promo)}
                            disabled={togglingId === promo._id}
                            title={promo.isActive ? "Désactiver" : "Activer"}
                            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                          >
                            {togglingId === promo._id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                            ) : promo.isActive ? (
                              <ToggleRight className="w-4 h-4 text-green-500" />
                            ) : (
                              <ToggleLeft className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                          {/* Edit */}
                          <button
                            onClick={() => setEditPromo(promo)}
                            title="Modifier"
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {/* Delete */}
                          <button
                            onClick={() => setDeletePromo(promo)}
                            title="Supprimer"
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {createOpen && (
        <Modal title="Nouveau code promo" onClose={() => setCreateOpen(false)}>
          <PromoForm
            onSave={handleCreate}
            onClose={() => setCreateOpen(false)}
            saving={saving}
          />
        </Modal>
      )}

      {/* Edit Modal */}
      {editPromo && (
        <Modal title={`Modifier — ${editPromo.code}`} onClose={() => setEditPromo(null)}>
          <PromoForm
            initial={editPromo}
            onSave={handleEdit}
            onClose={() => setEditPromo(null)}
            saving={saving}
          />
        </Modal>
      )}

      {/* Confirm Delete */}
      {deletePromo && (
        <ConfirmDelete
          promo={deletePromo}
          onConfirm={handleDelete}
          onClose={() => setDeletePromo(null)}
          deleting={deleting}
        />
      )}

      {/* Toast */}
      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
}
