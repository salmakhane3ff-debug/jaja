"use client";

import { useState, useEffect, useRef } from "react";
import {
  Building2, Plus, Pencil, Trash2, X, Loader2, Save,
  CheckCircle, XCircle, ToggleLeft, ToggleRight,
  ChevronUp, ChevronDown, Upload, Info, AlertCircle,
  CreditCard, Smartphone, Eye, EyeOff, Image as ImageIcon,
  GripVertical,
} from "lucide-react";

// ── Constants & helpers ───────────────────────────────────────────────────────

const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const PAYMENT_TYPE_OPTS = [
  { value: "prepaid",     label: "Virement complet",    desc: "Paiement intégral avant livraison" },
  { value: "cod_deposit", label: "Acompte COD",         desc: "Acompte maintenant, reste à la livraison" },
  { value: "both",        label: "Les deux",            desc: "Affiché pour virement ET acompte" },
];

const EMPTY_METHOD = {
  type: "bank",
  name: "",
  accountName: "",
  accountNumber: "",
  rib: "",
  swift: "",
  logo: "",
  isActive: true,
  paymentType: "prepaid",
  showOnlyIfFullPayment: false,
  showOnlyIfDeposit: false,
  instructions: "",
  sortOrder: 0,
  enableMessageBeforePayment: false,
  whatsapp: "",
};

const PT_BADGE = {
  prepaid:     { label: "Prépayé",  cls: "bg-blue-50   text-blue-700   border-blue-200"   },
  cod_deposit: { label: "Acompte",  cls: "bg-orange-50 text-orange-700 border-orange-200" },
  both:        { label: "Les deux", cls: "bg-purple-50  text-purple-700 border-purple-200" },
};

const TYPE_BADGE = {
  bank:  { label: "Banque",  cls: "bg-gray-100 text-gray-700" },
  local: { label: "Local",   cls: "bg-teal-50  text-teal-700" },
};

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, type, onClose }) {
  if (!msg) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium max-w-xs
      ${type === "error" ? "bg-red-500 text-white" : "bg-green-500 text-white"}`}>
      {type === "error" ? <XCircle className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? "max-w-2xl" : "max-w-lg"} overflow-hidden max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">{children}</div>
      </div>
    </div>
  );
}

// ── Field helper ──────────────────────────────────────────────────────────────

function Field({ label, required, hint, error, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
    </div>
  );
}

const inputCls = "w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-blue-400 transition-colors";

// ── Method form (add/edit) ─────────────────────────────────────────────────────

function MethodForm({ initial, onSave, onClose, saving, nextOrder }) {
  const [form, setForm] = useState(() => ({
    id: initial?.id || genId(),
    ...EMPTY_METHOD,
    sortOrder: initial?.sortOrder ?? nextOrder,
    ...initial,
  }));
  const [errors, setErrors] = useState({});
  const logoRef = useRef(null);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: null })); };
  const isBank = form.type === "bank";

  const handleLogo = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = (e) => set("logo", e.target.result);
    r.readAsDataURL(file);
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Nom requis";
    // RIB is optional — local methods (CashPlus, WafaCash, etc.) don't need it
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = (ev) => {
    ev.preventDefault();
    if (validate()) onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Type */}
      <Field label="Type de méthode">
        <div className="flex gap-2">
          {[{ value: "bank", label: "🏦 Banque" }, { value: "local", label: "📱 Méthode locale" }].map(({ value, label }) => (
            <button key={value} type="button" onClick={() => set("type", value)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors
                ${form.type === value ? "bg-gray-900 text-white border-gray-900" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400"}`}>
              {label}
            </button>
          ))}
        </div>
      </Field>

      {/* Name */}
      <Field label="Nom affiché" required error={errors.name}>
        <input type="text" value={form.name} onChange={e => set("name", e.target.value)}
          placeholder={isBank ? "CIH Bank, Attijariwafa..." : "CashPlus, WafaCash..."}
          className={inputCls} />
      </Field>

      {/* Bank fields */}
      {isBank && (
        <div className="space-y-4">
          <Field label="Titulaire du compte">
            <input type="text" value={form.accountName} onChange={e => set("accountName", e.target.value)}
              placeholder="Prénom Nom" className={inputCls} />
          </Field>
          <Field label="Numéro de compte" hint="Optionnel — affiché dans le checkout si renseigné">
            <input type="text" value={form.accountNumber} onChange={e => set("accountNumber", e.target.value)}
              placeholder="0123456789" className={`${inputCls} font-mono text-xs`} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="RIB / IBAN" error={errors.rib}
              hint="Optionnel — laisser vide pour CashPlus, WafaCash, etc.">
              <input type="text" value={form.rib} onChange={e => set("rib", e.target.value)}
                placeholder="230000..." className={`${inputCls} font-mono text-xs`} />
            </Field>
            <Field label="SWIFT / BIC" hint="Optionnel">
              <input type="text" value={form.swift} onChange={e => set("swift", e.target.value)}
                placeholder="CIHMAMC" className={`${inputCls} font-mono`} />
            </Field>
          </div>
        </div>
      )}

      {/* Logo */}
      <Field label="Logo / Icône" hint="Image affichée dans le checkout (PNG, JPG, WEBP)">
        {form.logo ? (
          <div className="flex items-center gap-3">
            <img src={form.logo} alt="logo" className="h-12 w-auto rounded-xl border border-gray-200 bg-white object-contain p-1 max-w-[120px]" />
            <button type="button" onClick={() => set("logo", "")}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors">
              <X className="w-3.5 h-3.5" /> Supprimer
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => logoRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors w-full justify-center">
            <Upload className="w-4 h-4" /> Téléverser un logo
          </button>
        )}
        <input ref={logoRef} type="file" accept="image/*" className="hidden"
          onChange={e => handleLogo(e.target.files?.[0])} />
      </Field>

      {/* Payment type */}
      <Field label="Type de paiement">
        <div className="space-y-2">
          {PAYMENT_TYPE_OPTS.map(({ value, label, desc }) => (
            <label key={value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors
              ${form.paymentType === value ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-gray-400"}`}>
              <input type="radio" name="paymentType" value={value} checked={form.paymentType === value}
                onChange={() => set("paymentType", value)} className="accent-blue-600 w-4 h-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-gray-800">{label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
            </label>
          ))}
        </div>
      </Field>

      {/* Visibility toggles */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Visibilité conditionnelle</p>
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-gray-700">Masquer si paiement complet</p>
            <p className="text-xs text-gray-400">N&apos;affiche pas cette méthode si c&apos;est un virement total</p>
          </div>
          <button type="button" onClick={() => set("showOnlyIfFullPayment", !form.showOnlyIfFullPayment)}>
            {form.showOnlyIfFullPayment
              ? <ToggleRight className="w-7 h-7 text-blue-500" />
              : <ToggleLeft className="w-7 h-7 text-gray-300" />}
          </button>
        </label>
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-gray-700">Masquer si acompte seulement</p>
            <p className="text-xs text-gray-400">N&apos;affiche pas cette méthode pour les acomptes</p>
          </div>
          <button type="button" onClick={() => set("showOnlyIfDeposit", !form.showOnlyIfDeposit)}>
            {form.showOnlyIfDeposit
              ? <ToggleRight className="w-7 h-7 text-blue-500" />
              : <ToggleLeft className="w-7 h-7 text-gray-300" />}
          </button>
        </label>
      </div>

      {/* Message before payment (WhatsApp) */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-gray-700">Bouton WhatsApp avant paiement</p>
            <p className="text-xs text-gray-400">Affiche un bouton WhatsApp sous le bouton de confirmation</p>
          </div>
          <button type="button" onClick={() => set("enableMessageBeforePayment", !form.enableMessageBeforePayment)}>
            {form.enableMessageBeforePayment
              ? <ToggleRight className="w-7 h-7 text-green-500" />
              : <ToggleLeft className="w-7 h-7 text-gray-300" />}
          </button>
        </label>
        {form.enableMessageBeforePayment && (
          <Field label="Numéro WhatsApp" hint="Format international: 212600000000 (sans + ni espaces)">
            <input type="text" value={form.whatsapp} onChange={e => set("whatsapp", e.target.value)}
              placeholder="212600000000" className={`${inputCls} font-mono`} dir="ltr" />
          </Field>
        )}
      </div>

      {/* Instructions */}
      <Field label="Instructions pour le client" hint="Texte affiché dans le checkout lors du paiement">
        <textarea value={form.instructions} onChange={e => set("instructions", e.target.value)} rows={3}
          placeholder="Veuillez effectuer un virement sur le compte ci-dessous..."
          className={`${inputCls} resize-none`} />
      </Field>

      {/* Sort order + Active */}
      <div className="flex gap-3 items-center">
        <Field label="Ordre d'affichage" hint="Nombre — plus petit = en haut">
          <input type="number" value={form.sortOrder} onChange={e => set("sortOrder", parseInt(e.target.value) || 0)}
            min="0" step="1" className={`${inputCls} w-24`} dir="ltr" />
        </Field>
        <div className="flex items-center gap-2 mt-5">
          <span className="text-sm font-medium text-gray-700">Actif</span>
          <button type="button" onClick={() => set("isActive", !form.isActive)}>
            {form.isActive
              ? <ToggleRight className="w-8 h-8 text-green-500" />
              : <ToggleLeft className="w-8 h-8 text-gray-300" />}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} disabled={saving}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50">
          Annuler
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {initial ? "Enregistrer" : "Ajouter"}
        </button>
      </div>
    </form>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────

function ConfirmDelete({ method, onConfirm, onClose, deleting }) {
  return (
    <Modal title="Supprimer la méthode" onClose={onClose}>
      <div className="text-center space-y-4">
        <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto">
          {method.logo
            ? <img src={method.logo} alt="" className="w-10 h-10 object-contain rounded-xl" />
            : <Building2 className="w-6 h-6 text-red-500" />}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">Supprimer <strong>{method.name}</strong> ?</p>
          <p className="text-xs text-gray-400 mt-1">Cette action est irréversible.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={deleting}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-50">
            Annuler
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 disabled:opacity-60">
            {deleting && <Loader2 className="w-4 h-4 animate-spin" />} Supprimer
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Method row ────────────────────────────────────────────────────────────────

function MethodRow({ method, onEdit, onDelete, onToggle, onMoveUp, onMoveDown, isFirst, isLast, toggling }) {
  const pt = PT_BADGE[method.paymentType] || PT_BADGE.prepaid;
  const mt = TYPE_BADGE[method.type]     || TYPE_BADGE.bank;

  return (
    <tr className="hover:bg-gray-50/60 transition-colors group">
      {/* Logo */}
      <td className="px-4 py-3">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200 shrink-0">
          {method.logo
            ? <img src={method.logo} alt={method.name} className="w-full h-full object-contain p-1" />
            : <Building2 className="w-5 h-5 text-gray-400" />}
        </div>
      </td>
      {/* Name */}
      <td className="px-4 py-3">
        <p className="text-sm font-semibold text-gray-900">{method.name}</p>
        {method.rib && (
          <p className="text-xs font-mono text-gray-400 mt-0.5 truncate max-w-[140px]">{method.rib}</p>
        )}
      </td>
      {/* Type */}
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${mt.cls}`}>
          {mt.label}
        </span>
      </td>
      {/* Payment type */}
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${pt.cls}`}>
          {pt.label}
        </span>
      </td>
      {/* Visibility */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5 text-xs text-gray-400">
          {method.showOnlyIfFullPayment && <span>🚫 Si prépayé</span>}
          {method.showOnlyIfDeposit    && <span>🚫 Si acompte</span>}
          {!method.showOnlyIfFullPayment && !method.showOnlyIfDeposit && <span className="text-gray-300">—</span>}
        </div>
      </td>
      {/* Status */}
      <td className="px-4 py-3">
        <button onClick={() => onToggle(method)} disabled={toggling === method.id} title={method.isActive ? "Désactiver" : "Activer"}>
          {toggling === method.id
            ? <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
            : method.isActive
              ? <ToggleRight className="w-7 h-7 text-green-500 hover:text-green-600 transition-colors" />
              : <ToggleLeft  className="w-7 h-7 text-gray-300 hover:text-gray-500 transition-colors" />}
        </button>
      </td>
      {/* Order */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <button onClick={onMoveUp} disabled={isFirst}
            className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 transition-colors">
            <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <button onClick={onMoveDown} disabled={isLast}
            className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 transition-colors">
            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>
      </td>
      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <button onClick={() => onEdit(method)} title="Modifier"
            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(method)} title="Supprimer"
            className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BankSettingsPage() {
  const [methods,     setMethods]     = useState([]);
  const [globalData,  setGlobalData]  = useState({ depositInstructions: "" });
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [toggling,    setToggling]    = useState(null);
  const [deleting,    setDeleting]    = useState(null);
  const [toast,       setToast]       = useState({ msg: "", type: "success" });

  const [addOpen,     setAddOpen]     = useState(false);
  const [editMethod,  setEditMethod]  = useState(null);
  const [deleteMethod,setDeleteMethod]= useState(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/admin/bank-settings")
      .then(r => r.json())
      .then(data => {
        setMethods(Array.isArray(data.methods) ? [...data.methods].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)) : []);
        setGlobalData({ depositInstructions: data.depositInstructions || "" });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Toast helper ──────────────────────────────────────────────────────────

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "success" }), 3500);
  }

  // ── Save helper (sends full payload) ─────────────────────────────────────

  async function persist(updatedMethods, opts = {}) {
    const res = await fetch("/api/admin/bank-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ methods: updatedMethods, ...globalData, ...opts }),
    });
    return res;
  }

  // ── Add method ────────────────────────────────────────────────────────────

  async function handleAdd(form) {
    setSaving(true);
    const updated = [...methods, form].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    try {
      const res = await persist(updated);
      if (!res.ok) { const d = await res.json(); showToast(d.error || "Erreur", "error"); return; }
      setMethods(updated);
      setAddOpen(false);
      showToast(`${form.name} ajouté avec succès !`);
    } catch { showToast("Erreur réseau", "error"); }
    finally { setSaving(false); }
  }

  // ── Edit method ───────────────────────────────────────────────────────────

  async function handleEdit(form) {
    setSaving(true);
    const updated = methods.map(m => m.id === form.id ? form : m)
                           .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    try {
      const res = await persist(updated);
      if (!res.ok) { const d = await res.json(); showToast(d.error || "Erreur", "error"); return; }
      setMethods(updated);
      setEditMethod(null);
      showToast(`${form.name} mis à jour !`);
    } catch { showToast("Erreur réseau", "error"); }
    finally { setSaving(false); }
  }

  // ── Delete method ─────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteMethod) return;
    setDeleting(deleteMethod.id);
    const updated = methods.filter(m => m.id !== deleteMethod.id);
    try {
      const res = await persist(updated);
      if (!res.ok) { showToast("Erreur lors de la suppression", "error"); return; }
      setMethods(updated);
      setDeleteMethod(null);
      showToast(`${deleteMethod.name} supprimé.`);
    } catch { showToast("Erreur réseau", "error"); }
    finally { setDeleting(null); }
  }

  // ── Toggle active ────────────────────────────────────────────────────────

  async function handleToggle(method) {
    setToggling(method.id);
    const updated = methods.map(m => m.id === method.id ? { ...m, isActive: !m.isActive } : m);
    try {
      const res = await persist(updated);
      if (!res.ok) { showToast("Erreur", "error"); return; }
      setMethods(updated);
      showToast(method.isActive ? `${method.name} désactivé.` : `${method.name} activé !`);
    } catch { showToast("Erreur réseau", "error"); }
    finally { setToggling(null); }
  }

  // ── Reorder ───────────────────────────────────────────────────────────────

  async function handleMove(method, dir) {
    const sorted = [...methods].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const idx    = sorted.findIndex(m => m.id === method.id);
    const swap   = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= sorted.length) return;
    // Swap sortOrders
    const aOrd = sorted[idx].sortOrder ?? idx * 10;
    const bOrd = sorted[swap].sortOrder ?? swap * 10;
    const updated = methods.map(m => {
      if (m.id === sorted[idx].id) return { ...m, sortOrder: bOrd };
      if (m.id === sorted[swap].id) return { ...m, sortOrder: aOrd };
      return m;
    }).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    setMethods(updated);
    await persist(updated);
  }

  // ── Save global settings ──────────────────────────────────────────────────

  async function handleSaveGlobal() {
    setSaving(true);
    try {
      const res = await persist(methods, globalData);
      if (!res.ok) { showToast("Erreur", "error"); return; }
      showToast("Paramètres globaux enregistrés !");
    } catch { showToast("Erreur réseau", "error"); }
    finally { setSaving(false); }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  const totalActive  = methods.filter(m => m.isActive).length;
  const totalPrepaid = methods.filter(m => m.paymentType === "prepaid" || m.paymentType === "both").length;
  const totalDeposit = methods.filter(m => m.paymentType === "cod_deposit" || m.paymentType === "both").length;

  const sorted = [...methods].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const nextOrder = methods.length > 0 ? Math.max(...methods.map(m => m.sortOrder || 0)) + 10 : 0;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-2" />
        <span className="text-sm text-gray-500">Chargement...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              Paramètres Bancaires
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Gérez les méthodes de paiement affichées dans le checkout.
            </p>
          </div>
          <button onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm shrink-0">
            <Plus className="w-4 h-4" /> Nouvelle méthode
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total",          value: methods.length, color: "text-gray-700",   bg: "bg-white"       },
            { label: "Actives",        value: totalActive,    color: "text-green-600",  bg: "bg-green-50"    },
            { label: "Virement",       value: totalPrepaid,   color: "text-blue-600",   bg: "bg-blue-50"     },
            { label: "Acompte COD",    value: totalDeposit,   color: "text-orange-600", bg: "bg-orange-50"   },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl p-3 border border-gray-100 shadow-sm`}>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Methods table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-bold text-gray-700">Méthodes de paiement</h2>
            <span className="ml-auto text-xs text-gray-400">{sorted.length} méthode{sorted.length !== 1 ? "s" : ""}</span>
          </div>

          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Building2 className="w-10 h-10 mb-3 opacity-25" />
              <p className="text-sm font-medium">Aucune méthode configurée</p>
              <p className="text-xs mt-1">Ajoutez une banque ou méthode locale</p>
              <button onClick={() => setAddOpen(true)}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors">
                <Plus className="w-4 h-4" /> Ajouter une méthode
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {["Logo","Nom / RIB","Type","Paiement","Visibilité","Statut","Ordre","Actions"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sorted.map((m, idx) => (
                    <MethodRow
                      key={m.id}
                      method={m}
                      isFirst={idx === 0}
                      isLast={idx === sorted.length - 1}
                      toggling={toggling}
                      onEdit={setEditMethod}
                      onDelete={setDeleteMethod}
                      onToggle={handleToggle}
                      onMoveUp={() => handleMove(m, "up")}
                      onMoveDown={() => handleMove(m, "down")}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Global settings */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
            <Info className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-bold text-gray-700">Instructions globales</h2>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Instructions dépôt / acompte
              </label>
              <textarea
                value={globalData.depositInstructions}
                onChange={e => setGlobalData(d => ({ ...d, depositInstructions: e.target.value }))}
                rows={3}
                placeholder="Instructions affichées au client lors du paiement par acompte..."
                className={`${inputCls} resize-none`}
              />
              <p className="text-xs text-gray-400 mt-1">
                Affiché dans la page de paiement bancaire quand le type est &quot;acompte COD&quot;.
              </p>
            </div>
            <button onClick={handleSaveGlobal} disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer les instructions
            </button>
          </div>
        </div>

        {/* Info card */}
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 space-y-1">
            <p className="font-semibold">Comportement dans le checkout</p>
            <p>
              Les méthodes <strong>Prépayé</strong> s&apos;affichent quand la livraison est en mode virement bancaire.
              Les méthodes <strong>Acompte</strong> s&apos;affichent pour les livraisons avec dépôt.
              Les méthodes <strong>Les deux</strong> s&apos;affichent dans les deux cas.
            </p>
          </div>
        </div>

      </div>

      {/* Add modal */}
      {addOpen && (
        <Modal title="Nouvelle méthode de paiement" onClose={() => setAddOpen(false)} wide>
          <MethodForm
            nextOrder={nextOrder}
            onSave={handleAdd}
            onClose={() => setAddOpen(false)}
            saving={saving}
          />
        </Modal>
      )}

      {/* Edit modal */}
      {editMethod && (
        <Modal title={`Modifier — ${editMethod.name}`} onClose={() => setEditMethod(null)} wide>
          <MethodForm
            initial={editMethod}
            nextOrder={nextOrder}
            onSave={handleEdit}
            onClose={() => setEditMethod(null)}
            saving={saving}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteMethod && (
        <ConfirmDelete
          method={deleteMethod}
          onConfirm={handleDelete}
          onClose={() => setDeleteMethod(null)}
          deleting={deleting === deleteMethod.id}
        />
      )}

      <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: "", type: "success" })} />
    </div>
  );
}
