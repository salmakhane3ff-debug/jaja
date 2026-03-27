"use client";
import React, { useEffect, useState } from "react";
import { Percent, Plus, Trash2, ToggleLeft, ToggleRight, Edit2, Check, X, Tag, ShoppingBag, Layers } from "lucide-react";

const API = "/api/setting?type=discount_rules";

let _seq = 0;
const uid = () => `r_${Date.now()}_${++_seq}`;

const SCOPE_OPTS = [
  { value: "all",        label: "All Products",      icon: ShoppingBag },
  { value: "collection", label: "Specific Collection", icon: Layers },
];

const PRESET_DISCOUNTS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70];

function empty() {
  return { id: uid(), label: "", percentage: 10, scope: "all", collectionTitle: "", active: true };
}

export default function DiscountManagement() {
  const [rules,       setRules]       = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [form,        setForm]        = useState(null);   // null = closed
  const [editId,      setEditId]      = useState(null);   // null = new rule

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch(API, { cache: "no-store" }).then(r => r.ok ? r.json() : {}),
      fetch("/api/collection",           { cache: "no-store" }).then(r => r.ok ? r.json() : []),
    ]).then(([settings, cols]) => {
      setRules(Array.isArray(settings?.rules) ? settings.rules : []);
      setCollections(Array.isArray(cols) ? cols : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────
  const persist = async (newRules) => {
    setSaving(true);
    try {
      await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: newRules }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const saveRules = (newRules) => { setRules(newRules); persist(newRules); };

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const openNew  = ()   => { setEditId(null); setForm(empty()); };
  const openEdit = (r)  => { setEditId(r.id); setForm({ ...r }); };
  const closeForm= ()   => setForm(null);

  const submitForm = () => {
    if (!form.percentage || Number(form.percentage) <= 0) return;
    if (form.scope === "collection" && !form.collectionTitle) return;
    const updated = editId
      ? rules.map(r => r.id === editId ? { ...form } : r)
      : [...rules, { ...form, id: uid() }];
    saveRules(updated);
    setForm(null);
  };

  const toggle  = (id) => saveRules(rules.map(r => r.id === id ? { ...r, active: !r.active } : r));
  const remove  = (id) => saveRules(rules.filter(r => r.id !== id));

  // ── Stats ─────────────────────────────────────────────────────────────────
  const activeCount = rules.filter(r => r.active).length;

  if (loading) return (
    <div className="flex items-center justify-center h-60 text-gray-400 text-sm">Loading…</div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
            <Percent size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Discount Management</h1>
            <p className="text-xs text-gray-500">{activeCount} active rule{activeCount !== 1 ? "s" : ""} · applied automatically at checkout</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><Check size={13} /> Saved</span>}
          <button onClick={openNew}
            className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors">
            <Plus size={15} /> Add Rule
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Rules",   value: rules.length,   color: "from-blue-500 to-indigo-600" },
            { label: "Active",        value: activeCount,    color: "from-green-500 to-emerald-600" },
            { label: "Inactive",      value: rules.length - activeCount, color: "from-gray-400 to-gray-600" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center`}>
                <span className="text-white font-black text-sm">{s.value}</span>
              </div>
              <p className="text-sm font-semibold text-gray-700">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Add/Edit form */}
        {form && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">{editId ? "Edit Rule" : "New Discount Rule"}</h2>
              <button onClick={closeForm} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={15} /></button>
            </div>

            <div className="space-y-4">
              {/* Label */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Rule Name (optional)</label>
                <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-400"
                  placeholder="e.g. Summer Sale, Ramadan Promo…"
                  value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
              </div>

              {/* Percentage */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Discount Percentage</label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {PRESET_DISCOUNTS.map(p => (
                    <button key={p} onClick={() => setForm({ ...form, percentage: p })}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${form.percentage === p ? "bg-black text-white border-black" : "bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-400"}`}>
                      {p}%
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} max={99} className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-400"
                    value={form.percentage} onChange={e => setForm({ ...form, percentage: Number(e.target.value) })} />
                  <span className="text-sm text-gray-500">% off regular price</span>
                </div>
              </div>

              {/* Scope */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Apply To</label>
                <div className="flex gap-2">
                  {SCOPE_OPTS.map(opt => (
                    <button key={opt.value} onClick={() => setForm({ ...form, scope: opt.value, collectionTitle: "" })}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${form.scope === opt.value ? "bg-black text-white border-black" : "bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-400"}`}>
                      <opt.icon size={14} /> {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Collection picker */}
              {form.scope === "collection" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Select Collection</label>
                  <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-400"
                    value={form.collectionTitle}
                    onChange={e => setForm({ ...form, collectionTitle: e.target.value })}>
                    <option value="">— Choose a collection —</option>
                    {collections.map(c => (
                      <option key={c._id || c.id} value={c.title}>{c.title}</option>
                    ))}
                  </select>
                  {!form.collectionTitle && <p className="text-xs text-red-400 mt-1">Please select a collection</p>}
                </div>
              )}

              {/* Active toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 accent-black" />
                <span className="text-sm font-semibold text-gray-700">Active (apply immediately)</span>
              </label>

              {/* Preview */}
              {form.percentage > 0 && (
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                  <p className="text-xs text-orange-700 font-semibold">Preview</p>
                  <p className="text-sm text-gray-700 mt-1">
                    A product at <strong>100 DH</strong> will show as{" "}
                    <strong className="text-green-700">{100 - form.percentage} DH</strong>{" "}
                    with <span className="line-through text-gray-400">100 DH</span>
                    {" "}<span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded ml-1">{form.percentage}% OFF</span>
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={submitForm}
                  disabled={!form.percentage || (form.scope === "collection" && !form.collectionTitle)}
                  className="flex-1 bg-black text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-800 disabled:opacity-40 transition-colors">
                  {saving ? "Saving…" : editId ? "Update Rule" : "Create Rule"}
                </button>
                <button onClick={closeForm} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Rules list */}
        {rules.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-200">
            <Percent className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="text-gray-500 font-semibold">No discount rules yet</p>
            <p className="text-gray-400 text-sm mt-1">Click "Add Rule" to create your first discount</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">Rules</h2>
            {rules.map(rule => {
              const ScopeIcon = rule.scope === "all" ? ShoppingBag : Layers;
              return (
                <div key={rule.id}
                  className={`bg-white rounded-2xl border shadow-sm transition-all ${rule.active ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
                  <div className="flex items-center gap-4 px-5 py-4">
                    {/* Badge */}
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex flex-col items-center justify-center shrink-0">
                      <span className="text-white font-black text-xl leading-none">{rule.percentage}%</span>
                      <span className="text-white/80 text-[9px] font-semibold uppercase tracking-wide">OFF</span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 truncate">
                        {rule.label || `${rule.percentage}% Discount`}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <ScopeIcon size={11} className="text-gray-400 shrink-0" />
                        <p className="text-xs text-gray-500 truncate">
                          {rule.scope === "all" ? "Applied to all products" : `Applied to collection: ${rule.collectionTitle}`}
                        </p>
                      </div>
                    </div>

                    {/* Status badge */}
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold shrink-0 ${rule.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {rule.active ? "ACTIVE" : "OFF"}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggle(rule.id)} title={rule.active ? "Deactivate" : "Activate"}
                        className={`p-2 rounded-lg transition-colors ${rule.active ? "text-green-600 hover:bg-green-50" : "text-gray-400 hover:bg-gray-50"}`}>
                        {rule.active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      </button>
                      <button onClick={() => openEdit(rule)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors">
                        <Edit2 size={15} />
                      </button>
                      <button onClick={() => remove(rule.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">How it works</p>
          <ul className="space-y-1 text-xs text-blue-700 list-disc list-inside">
            <li>Rules are applied automatically to product prices across the whole site</li>
            <li>Collection-specific rules take priority over "All Products" rules</li>
            <li>If a product already has a better sale price, the rule is skipped</li>
            <li>Multiple active rules: the most specific (collection) wins</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
