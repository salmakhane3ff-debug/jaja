"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, Search, Edit3, Trash2, Users, Loader2, CheckCircle, XCircle, X } from "lucide-react";

const COMMISSION_OPTIONS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

function Badge({ active }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold
      ${active ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-500 border border-gray-200"}`}>
      {active ? "Actif" : "Inactif"}
    </span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function AffiliateForm({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    username: initial?.username || "",
    password: "",
    commissionRate: initial?.commissionRate ?? 0.5,
    isActive: initial?.isActive ?? false,
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {[
        { key: "name",     label: "Nom",              type: "text",     placeholder: "Prénom Nom",    required: false },
        { key: "username", label: "Identifiant",       type: "text",     placeholder: "mon-identifiant", required: true, disabled: !!initial },
        { key: "password", label: initial ? "Nouveau mot de passe (laisser vide)" : "Mot de passe", type: "password", placeholder: "••••••••", required: !initial },
      ].map(({ key, label, type, placeholder, required, disabled }) => (
        <div key={key}>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            {label}{required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <input
            type={type}
            value={form[key]}
            onChange={(e) => set(key, e.target.value)}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400 disabled:opacity-60"
            dir={key === "username" ? "ltr" : undefined}
          />
        </div>
      ))}

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Taux de commission</label>
        <select
          value={form.commissionRate}
          onChange={(e) => set("commissionRate", parseFloat(e.target.value))}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
        >
          {COMMISSION_OPTIONS.map((r) => (
            <option key={r} value={r}>{(r * 100).toFixed(0)}%</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-10 h-5 bg-gray-200 peer-focus:ring-0 rounded-full peer peer-checked:after:translate-x-5 peer-checked:bg-gray-900 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
        </label>
        <span className="text-sm font-medium text-gray-700">Compte actif</span>
      </div>

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

export default function AdminAffiliatesPage() {
  const [affiliates, setAffiliates] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [modal,      setModal]      = useState(null); // null | 'create' | affiliate obj
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState(null);

  const fetchAffiliates = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/affiliates");
      const d = await r.json();
      setAffiliates(Array.isArray(d) ? d : []);
    } catch {
      setError("Erreur chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAffiliates(); }, []);

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return affiliates;
    return affiliates.filter((a) =>
      a.username?.toLowerCase().includes(q) || a.name?.toLowerCase().includes(q)
    );
  }, [affiliates, search]);

  const handleSave = async (form) => {
    setSaving(true);
    setError(null);
    try {
      const isEdit = !!modal?._id;
      const url    = "/api/admin/affiliates";
      const method = isEdit ? "PUT" : "POST";
      const body   = isEdit ? { ...form, id: modal._id } : form;

      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const d = await r.json();

      if (r.ok) {
        await fetchAffiliates();
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

  const handleDelete = async (id) => {
    if (!confirm("Supprimer cet affilié ?")) return;
    try {
      await fetch("/api/admin/affiliates", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id }),
      });
      await fetchAffiliates();
    } catch {
      setError("Erreur suppression");
    }
  };

  const handleToggle = async (a) => {
    try {
      await fetch("/api/admin/affiliates", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: a._id, isActive: !a.isActive }),
      });
      await fetchAffiliates();
    } catch {
      setError("Erreur");
    }
  };

  return (
    <div className="py-6 max-w-6xl space-y-5">

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Affiliés</h1>
          <p className="text-sm text-gray-500 mt-0.5">{displayed.length} / {affiliates.length}</p>
        </div>
        <button
          onClick={() => setModal("create")}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" /> Nouvel affilié
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
          <XCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="relative max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou identifiant..."
            className="w-full pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 bg-gray-50"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <Users className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">Aucun affilié</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["Identifiant","Nom","Commission","Commandes","Équipe","Statut","Actions"].map((h) => (
                    <th key={h} className="text-right text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayed.map((a) => (
                  <tr key={a._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{a.username}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{a.name || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{((a.commissionRate || 0) * 100).toFixed(0)}%</td>
                    <td className="px-4 py-3 text-gray-600">{a.ordersCount ?? a.totalOrders ?? 0}</td>
                    <td className="px-4 py-3 text-gray-600">{a.teamCount ?? 0}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleToggle(a)}>
                        <Badge active={a.isActive} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setModal(a)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Modifier
                        </button>
                        <button
                          onClick={() => handleDelete(a._id)}
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

      {modal && (
        <Modal
          title={modal === "create" ? "Nouvel affilié" : `Modifier : ${modal.username}`}
          onClose={() => setModal(null)}
        >
          <AffiliateForm
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
