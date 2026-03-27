"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, Search, Edit3, Trash2, Truck, Loader2,
  CheckCircle, XCircle, X, ToggleLeft, ToggleRight, Upload, ImageOff,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const PAYMENT_TYPES = [
  { value: "cod",         label: "Cash on Delivery (COD)" },
  { value: "cod_deposit", label: "COD + Dépôt (عربون)" },
  { value: "prepaid",     label: "Prépayé (تحويل بنكي)" },
];

const PAYMENT_LABELS = {
  cod:         { label: "COD",      cls: "bg-orange-100 text-orange-700" },
  cod_deposit: { label: "عربون",    cls: "bg-yellow-100 text-yellow-700" },
  prepaid:     { label: "Prepaid",  cls: "bg-blue-100   text-blue-700"   },
};

// ── Subcomponents ─────────────────────────────────────────────────────────────

function PaymentBadge({ type }) {
  const cfg = PAYMENT_LABELS[type] || { label: type, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ active }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold
      ${active
        ? "bg-green-50 text-green-700 border border-green-200"
        : "bg-gray-100 text-gray-500 border border-gray-200"
      }`}>
      {active ? "Actif" : "Inactif"}
    </span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
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

function ShippingForm({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    name:         initial?.name         ?? "",
    logo:         initial?.logo         ?? "",
    description:  initial?.description  ?? "",
    deliveryTime: initial?.deliveryTime ?? "",
    price:        initial?.price        ?? 0,
    isFree:       initial?.isFree       ?? false,
    paymentType:  initial?.paymentType  ?? "cod",
    deposit:      initial?.deposit      ?? 0,
    sortOrder:    initial?.sortOrder    ?? 0,
    isActive:     initial?.isActive     ?? true,
  });

  const logoInputRef = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleLogoFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => set("logo", ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Logo upload */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          Logo de la société
        </label>
        <div className="flex items-center gap-3">
          {/* Preview */}
          <div className="w-14 h-14 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
            {form.logo
              ? <img src={form.logo} alt="logo" className="w-full h-full object-contain p-1.5" />
              : <Truck className="w-6 h-6 text-gray-300" />
            }
          </div>
          {/* Actions */}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              {form.logo ? "تغيير الصورة" : "رفع صورة"}
            </button>
            {form.logo && (
              <button
                type="button"
                onClick={() => { set("logo", ""); if (logoInputRef.current) logoInputRef.current.value = ""; }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              >
                <ImageOff className="w-3.5 h-3.5" />
                حذف الصورة
              </button>
            )}
          </div>
        </div>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*"
          onChange={handleLogoFile}
          className="hidden"
        />
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          Nom de la société <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="ex: DHL Express"
          required
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Description courte (optionnel)"
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
        />
      </div>

      {/* Delivery time */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Délai de livraison</label>
        <input
          type="text"
          value={form.deliveryTime}
          onChange={(e) => set("deliveryTime", e.target.value)}
          placeholder="ex: 2–3 أيام"
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
        />
      </div>

      {/* Price + isFree */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Prix (MAD)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(e) => set("price", parseFloat(e.target.value) || 0)}
            disabled={form.isFree}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400 disabled:opacity-50"
          />
        </div>
        <div className="flex flex-col justify-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isFree}
              onChange={(e) => { set("isFree", e.target.checked); if (e.target.checked) set("price", 0); }}
              className="sr-only peer"
            />
            <div className="relative w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-gray-900 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
            <span className="text-sm font-medium text-gray-700">Livraison gratuite</span>
          </label>
        </div>
      </div>

      {/* Payment type */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Type de paiement</label>
        <select
          value={form.paymentType}
          onChange={(e) => set("paymentType", e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
        >
          {PAYMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Deposit (only if cod_deposit) */}
      {form.paymentType === "cod_deposit" && (
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Montant du dépôt (MAD) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.deposit}
            onChange={(e) => set("deposit", parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
          />
        </div>
      )}

      {/* Sort order */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ordre d&apos;affichage</label>
        <input
          type="number"
          min="0"
          value={form.sortOrder}
          onChange={(e) => set("sortOrder", parseInt(e.target.value, 10) || 0)}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
        />
      </div>

      {/* Active toggle */}
      <div className="flex items-center gap-3">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-gray-900 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
        </label>
        <span className="text-sm font-medium text-gray-700">Société active</span>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-bold disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminShippingCompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [modal,     setModal]     = useState(null); // null | "create" | company obj
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/shipping-companies");
      const d = await r.json();
      setCompanies(Array.isArray(d) ? d : []);
    } catch {
      setError("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCompanies(); }, []);

  // ── Filter ─────────────────────────────────────────────────────────────────

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      c.name?.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q)
    );
  }, [companies, search]);

  // ── Save (create / update) ─────────────────────────────────────────────────

  const handleSave = async (form) => {
    setSaving(true);
    setError(null);
    try {
      const isEdit = !!modal?._id;
      const method = isEdit ? "PUT" : "POST";
      const body   = isEdit ? { ...form, id: modal._id } : form;

      const r = await fetch("/api/admin/shipping-companies", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();

      if (r.ok) {
        await fetchCompanies();
        setModal(null);
      } else {
        setError(d.error || "Erreur");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle active ──────────────────────────────────────────────────────────

  const handleToggle = async (c) => {
    try {
      await fetch("/api/admin/shipping-companies", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: c._id, isActive: !c.isActive }),
      });
      await fetchCompanies();
    } catch {
      setError("Erreur");
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id) => {
    if (!confirm("Supprimer cette société de livraison ?")) return;
    try {
      await fetch("/api/admin/shipping-companies", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id }),
      });
      await fetchCompanies();
    } catch {
      setError("Erreur suppression");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="py-6 max-w-6xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sociétés de Livraison</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {displayed.length} / {companies.length} société(s)
          </p>
        </div>
        <button
          onClick={() => setModal("create")}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" /> Nouvelle société
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="relative max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom..."
            className="w-full pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 bg-gray-50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <Truck className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">Aucune société de livraison</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["", "Nom", "Délai", "Prix", "Paiement", "Dépôt", "Ordre", "Statut", "Actions"].map((h) => (
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
                {displayed.map((c) => (
                  <tr key={c._id} className="hover:bg-gray-50 transition-colors">

                    {/* Logo */}
                    <td className="px-3 py-3">
                      <div className="w-11 h-11 rounded-xl border border-gray-100 bg-white flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                        {c.logo
                          ? <img src={c.logo} alt={c.name} className="w-full h-full object-contain p-1" />
                          : <Truck className="w-5 h-5 text-gray-300" />
                        }
                      </div>
                    </td>

                    {/* Name */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{c.name}</p>
                      {c.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{c.description}</p>
                      )}
                    </td>

                    {/* Delivery time */}
                    <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                      {c.deliveryTime || "—"}
                    </td>

                    {/* Price */}
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      {c.isFree
                        ? <span className="text-green-600 font-semibold">Gratuit</span>
                        : `${Number(c.price).toFixed(0)} MAD`
                      }
                    </td>

                    {/* Payment type */}
                    <td className="px-4 py-3">
                      <PaymentBadge type={c.paymentType} />
                    </td>

                    {/* Deposit */}
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {c.paymentType === "cod_deposit"
                        ? `${Number(c.deposit).toFixed(0)} MAD`
                        : "—"
                      }
                    </td>

                    {/* Sort order */}
                    <td className="px-4 py-3 text-gray-500 text-center">{c.sortOrder}</td>

                    {/* Status toggle */}
                    <td className="px-4 py-3">
                      <button onClick={() => handleToggle(c)}>
                        <StatusBadge active={c.isActive} />
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setModal(c)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Modifier
                        </button>
                        <button
                          onClick={() => handleDelete(c._id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Supprimer
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

      {/* Modal */}
      {modal && (
        <Modal
          title={modal === "create" ? "Nouvelle société de livraison" : `Modifier : ${modal.name}`}
          onClose={() => setModal(null)}
        >
          <ShippingForm
            initial={modal === "create" ? null : modal}
            onSave={handleSave}
            onClose={() => setModal(null)}
            saving={saving}
          />
        </Modal>
      )}
    </div>
  );
}
