"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Search, Edit3, Trash2, Users, Loader2, CheckCircle, XCircle, X, Settings, Award, Percent, Trophy, Play, RefreshCw, ToggleLeft, ToggleRight, Zap, Upload, Image as ImageIcon } from "lucide-react";

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

function AffiliateForm({ initial, onSave, onClose, saving, affiliates = [] }) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    username: initial?.username || "",
    password: "",
    commissionRate: initial?.commissionRate ?? 0.5,
    isActive: initial?.isActive ?? false,
    parentId: "",
    goalOrders: initial?.goalOrders ?? "",
    goalValidReferrals: initial?.goalValidReferrals ?? "",
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

      {/* Parent affiliate — create only. Empty = standalone (unchanged behavior). */}
      {!initial && (
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Affilié parent</label>
          <select
            value={form.parentId}
            onChange={(e) => set("parentId", e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
          >
            <option value="">Aucun (None)</option>
            {affiliates.map((a) => (
              <option key={a._id} value={a._id}>{a.username}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">Place ce nouvel affilié dans l'équipe du parent sélectionné</p>
        </div>
      )}

      {/* Per-affiliate objectives — shown on create AND edit. Empty = dashboard fallback. */}
      <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Objectif commandes</label>
            <input
              type="number"
              min={0}
              value={form.goalOrders}
              onChange={(e) => set("goalOrders", e.target.value)}
              placeholder="5"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Objectif parrainages valides</label>
            <input
              type="number"
              min={0}
              value={form.goalValidReferrals}
              onChange={(e) => set("goalValidReferrals", e.target.value)}
              placeholder="auto"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
            />
          </div>
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

const DEFAULT_TIERS = [
  { minDelivered: 0, maxDelivered: 2,    commissionPct: 5  },
  { minDelivered: 3, maxDelivered: 5,    commissionPct: 7  },
  { minDelivered: 6, maxDelivered: null, commissionPct: 10 },
];

function TeamBonusConfigPanel() {
  const [cfg,        setCfg]        = useState(null);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [savingCfg,  setSavingCfg]  = useState(false);
  const [cfgMsg,     setCfgMsg]     = useState(null);

  const fetchConfig = async () => {
    setLoadingCfg(true);
    try {
      const r = await fetch("/api/admin/team-bonus-config");
      const d = await r.json();
      setCfg(d);
    } catch {
      setCfg({ requiredActiveAffiliates: 10, bonusAmount: 2000, ugcGoal: 5, commissionTiers: DEFAULT_TIERS });
    } finally {
      setLoadingCfg(false);
    }
  };

  useEffect(() => { fetchConfig(); }, []);

  const setField = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  const setTier = (i, k, v) => setCfg((c) => {
    const tiers = [...c.commissionTiers];
    tiers[i] = { ...tiers[i], [k]: v === "" ? null : Number(v) };
    return { ...c, commissionTiers: tiers };
  });

  const addTier = () => setCfg((c) => ({
    ...c,
    commissionTiers: [...c.commissionTiers, { minDelivered: 0, maxDelivered: null, commissionPct: 5 }],
  }));

  const removeTier = (i) => setCfg((c) => ({
    ...c,
    commissionTiers: c.commissionTiers.filter((_, idx) => idx !== i),
  }));

  const handleSaveCfg = async (e) => {
    e.preventDefault();
    setSavingCfg(true);
    setCfgMsg(null);
    try {
      const r = await fetch("/api/admin/team-bonus-config", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          requiredActiveAffiliates: Number(cfg.requiredActiveAffiliates),
          bonusAmount:              Number(cfg.bonusAmount),
          commissionTiers:          cfg.commissionTiers,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        setCfg(d);
        setCfgMsg({ type: "ok", text: "Configuration sauvegardée" });
      } else {
        setCfgMsg({ type: "err", text: d.error || "Erreur" });
      }
    } catch {
      setCfgMsg({ type: "err", text: "Erreur réseau" });
    } finally {
      setSavingCfg(false);
      setTimeout(() => setCfgMsg(null), 3500);
    }
  };

  if (loadingCfg) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-amber-50">
        <Award className="w-5 h-5 text-amber-600" />
        <div>
          <h2 className="text-sm font-bold text-gray-900">Configuration Bonus Équipe</h2>
          <p className="text-xs text-gray-500">Définissez les conditions de déblocage et les paliers de commission</p>
        </div>
      </div>

      <form onSubmit={handleSaveCfg} className="p-5 space-y-6">

        {/* Bonus unlock conditions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Affiliés actifs requis
            </label>
            <input
              type="number"
              min={1}
              value={cfg.requiredActiveAffiliates}
              onChange={(e) => setField("requiredActiveAffiliates", e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
            />
            <p className="text-xs text-gray-400 mt-1">Nombre d'affiliés avec ≥1 commande livrée</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Montant du bonus (MAD)
            </label>
            <input
              type="number"
              min={0}
              value={cfg.bonusAmount}
              onChange={(e) => setField("bonusAmount", e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
            />
            <p className="text-xs text-gray-400 mt-1">Crédité sur le solde de l'affilié</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Objectif UGC
            </label>
            <input
              type="number"
              min={1}
              value={cfg.ugcGoal ?? 5}
              onChange={(e) => setField("ugcGoal", e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
            />
            <p className="text-xs text-gray-400 mt-1">Vidéos UGC validées visées (progression affilié)</p>
          </div>
        </div>

        {/* Commission tiers */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-semibold text-gray-700">Paliers de commission dynamique</span>
            </div>
            <button
              type="button"
              onClick={addTier}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2.5">Min livraisons</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2.5">Max livraisons</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2.5">Commission %</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cfg.commissionTiers.map((tier, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={tier.minDelivered}
                        onChange={(e) => setTier(i, "minDelivered", e.target.value)}
                        className="w-24 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-400"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={tier.maxDelivered ?? ""}
                        onChange={(e) => setTier(i, "maxDelivered", e.target.value)}
                        placeholder="∞"
                        className="w-24 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-400"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={tier.commissionPct}
                          onChange={(e) => setTier(i, "commissionPct", e.target.value)}
                          className="w-20 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-400"
                        />
                        <span className="text-xs text-gray-500">%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {cfg.commissionTiers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTier(i)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Laisser "Max livraisons" vide = palier sans limite supérieure
          </p>
        </div>

        {/* Save */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={savingCfg}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors"
          >
            {savingCfg ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {savingCfg ? "Enregistrement..." : "Sauvegarder"}
          </button>
          {cfgMsg && (
            <span className={`text-sm font-medium ${cfgMsg.type === "ok" ? "text-green-600" : "text-red-600"}`}>
              {cfgMsg.text}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Demo Management Panel ─────────────────────────────────────────────────────

const SPEED_OPTIONS = [
  { value: 'slow',   label: 'Lent',   desc: '×0.4 — croissance douce'  },
  { value: 'medium', label: 'Moyen',  desc: '×1 — vitesse standard'    },
  { value: 'fast',   label: 'Rapide', desc: '×2.8 — croissance intense' },
];

function DemoManagementPanel() {
  const [info,        setInfo]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [genCount,    setGenCount]    = useState(60);
  const [genMode,     setGenMode]     = useState('mixed'); // 'men' | 'women' | 'mixed'
  const [busy,        setBusy]        = useState(null); // 'generate'|'simulate'|'reset'|'save'
  const [msg,         setMsg]         = useState(null);

  const fetchInfo = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/demo');
      const d = await r.json();
      setInfo(d);
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { fetchInfo(); }, []);

  const post = async (url, body, busyKey) => {
    setBusy(busyKey);
    setMsg(null);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      if (!r.ok) { setMsg({ type: 'err', text: d.error || 'Erreur' }); return; }
      setMsg({ type: 'ok', text: busyKey === 'generate' ? `${d.generated} affiliés générés ✓`
                                : busyKey === 'simulate' ? `Simulation effectuée (${d.simulated} affiliés) ✓`
                                : 'Compétition réinitialisée ✓' });
      await fetchInfo();
    } catch { setMsg({ type: 'err', text: 'Erreur réseau' }); }
    finally { setBusy(null); setTimeout(() => setMsg(null), 3500); }
  };

  const saveSettings = async (patch) => {
    if (!info) return;
    const next = { ...info.settings, ...patch };
    setBusy('save');
    try {
      const r = await fetch('/api/admin/demo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: next.isEnabled, simulationSpeed: next.simulationSpeed }),
      });
      if (r.ok) setInfo((prev) => ({ ...prev, settings: next }));
    } catch { } finally { setBusy(null); }
  };

  const s   = info?.settings;
  const c   = info?.competition;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-indigo-50">
        <Trophy className="w-5 h-5 text-indigo-600" />
        <div>
          <h2 className="text-sm font-bold text-gray-900">Système de Compétition Démo</h2>
          <p className="text-xs text-gray-500">Gérez les affiliés fictifs et les cycles de compétition</p>
        </div>
        {s && (
          <button
            type="button"
            onClick={() => saveSettings({ isEnabled: !s.isEnabled })}
            className="ml-auto flex items-center gap-1.5 text-xs font-bold"
            disabled={busy === 'save'}
          >
            {s.isEnabled
              ? <ToggleRight className="w-7 h-7 text-green-500" />
              : <ToggleLeft  className="w-7 h-7 text-gray-400"  />}
            <span className={s.isEnabled ? 'text-green-600' : 'text-gray-400'}>
              {s.isEnabled ? 'Activé' : 'Désactivé'}
            </span>
          </button>
        )}
      </div>

      <div className="p-5 space-y-5">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : (
          <>
            {/* Status row */}
            {c && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Cycle',          value: `#${c.cycleNum}` },
                  { label: 'Jours restants', value: `${c.daysLeft}j` },
                  { label: 'Participants',   value: c.totalParticipants },
                ].map((st) => (
                  <div key={st.label} className="text-center bg-gray-50 rounded-xl border border-gray-100 py-3 px-2">
                    <p className="text-xl font-black text-gray-800">{st.value}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{st.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Simulation speed */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">
                Vitesse de simulation
              </label>
              <div className="grid grid-cols-3 gap-2">
                {SPEED_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => saveSettings({ simulationSpeed: opt.value })}
                    className={`py-2.5 px-3 rounded-xl border text-left transition-colors
                      ${s?.simulationSpeed === opt.value
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                  >
                    <p className="text-xs font-bold">{opt.label}</p>
                    <p className={`text-[10px] mt-0.5 ${s?.simulationSpeed === opt.value ? 'text-indigo-200' : 'text-gray-400'}`}>
                      {opt.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">

              {/* Generate */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600">Générer des affiliés</label>
                <div className="flex gap-2">
                  <input
                    type="number" min={10} max={100}
                    value={genCount}
                    onChange={(e) => setGenCount(parseInt(e.target.value) || 60)}
                    className="w-16 px-2 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
                  />
                  <select
                    value={genMode}
                    onChange={(e) => setGenMode(e.target.value)}
                    className="w-24 px-2 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
                    title="Mode d'avatars/prénoms"
                  >
                    <option value="mixed">Mixte</option>
                    <option value="men">Hommes</option>
                    <option value="women">Femmes</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => post('/api/admin/demo', { count: genCount, mode: genMode }, 'generate')}
                    disabled={!!busy}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl disabled:opacity-50 transition-colors"
                  >
                    {busy === 'generate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                    Générer
                  </button>
                </div>
              </div>

              {/* Simulate */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600">Simuler un tick</label>
                <button
                  type="button"
                  onClick={() => post('/api/admin/demo/simulate', null, 'simulate')}
                  disabled={!!busy}
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl disabled:opacity-50 transition-colors"
                >
                  {busy === 'simulate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Simuler activité
                </button>
                {s?.lastSimAt && (
                  <p className="text-[10px] text-gray-400">
                    Dernière : {new Date(s.lastSimAt).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                  </p>
                )}
              </div>

              {/* Reset */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600">Réinitialiser</label>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm('Réinitialiser toute la compétition ? Les stats seront remises à zéro.')) return;
                    post('/api/admin/demo/reset', null, 'reset');
                  }}
                  disabled={!!busy}
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl disabled:opacity-50 transition-colors"
                >
                  {busy === 'reset' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Nouveau cycle
                </button>
              </div>
            </div>

            {/* Feedback */}
            {msg && (
              <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold
                ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {msg.type === 'ok' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                {msg.text}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Demo Affiliate Avatars ─────────────────────────────────────────────────────
function AvatarUploader({ gender, label, avatars, onUploaded, onDelete }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);
  const inputRef = useRef(null);

  const upload = async (files) => {
    const list = Array.from(files || []);
    if (list.length === 0) return;
    if (list.length > 20) { setErr("Maximum 20 images par envoi."); return; }
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append("gender", gender);
      for (const f of list) fd.append("images", f);
      const r = await fetch("/api/admin/demo/avatars", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || "Échec de l'envoi."); return; }
      await onUploaded();
    } catch { setErr("Erreur réseau."); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-gray-700">{label} <span className="text-gray-400 font-medium">({avatars.length})</span></h4>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Ajouter
        </button>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
          onChange={(e) => upload(e.target.files)} />
      </div>
      {err && <p className="text-[11px] text-red-600">{err}</p>}
      {avatars.length === 0 ? (
        <p className="text-[11px] text-gray-400">Aucun avatar. JPG / PNG / WEBP, max 20 par envoi.</p>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {avatars.map((a) => (
            <div key={a.id} className="relative group aspect-square rounded-xl overflow-hidden ring-1 ring-gray-200">
              <img src={a.url} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => onDelete(a.id)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                title="Supprimer">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DemoAvatarLibrary() {
  const [avatars, setAvatars] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/demo/avatars");
      const d = await r.json().catch(() => ({}));
      setAvatars(Array.isArray(d.avatars) ? d.avatars : []);
    } catch { setAvatars([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!confirm("Supprimer cet avatar de la bibliothèque ?")) return;
    setAvatars((prev) => prev.filter((a) => a.id !== id)); // optimistic
    try { await fetch(`/api/admin/demo/avatars/${id}`, { method: "DELETE" }); } catch {}
    load();
  };

  const men   = avatars.filter((a) => a.gender === "men");
  const women = avatars.filter((a) => a.gender === "women");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-indigo-50">
        <ImageIcon className="w-5 h-5 text-indigo-600" />
        <div>
          <h2 className="text-sm font-bold text-gray-900">Demo Affiliate Avatars</h2>
          <p className="text-[11px] text-gray-500">Bibliothèque permanente — utilisée à la génération. Supprimée uniquement manuellement.</p>
        </div>
      </div>
      <div className="p-5">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AvatarUploader gender="men"   label="Hommes" avatars={men}   onUploaded={load} onDelete={remove} />
            <AvatarUploader gender="women" label="Femmes" avatars={women} onUploaded={load} onDelete={remove} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── 🎭 Fake Orders Engine ──────────────────────────────────────────────────────
const WEEKDAYS = [
  { n: 1, l: "Lun" }, { n: 2, l: "Mar" }, { n: 3, l: "Mer" }, { n: 4, l: "Jeu" },
  { n: 5, l: "Ven" }, { n: 6, l: "Sam" }, { n: 0, l: "Dim" },
];

const BLANK_FAKE_FORM = {
  affiliateIds: [], enabled: true,
  ordersPerMinute: "", ordersPerHour: "2", ordersPerDay: "20",
  minDelaySec: "60", maxDelaySec: "600",
  workingHourStart: "9", workingHourEnd: "22",
  workingDays: "0,1,2,3,4,5,6",
  productMode: "all", productIds: [],
};

function FakeOrdersPanel() {
  const [data,    setData]    = useState({ configs: [], affiliates: [], products: [] });
  const [loading, setLoading] = useState(true);
  const [form,    setForm]    = useState(BLANK_FAKE_FORM);
  const [busy,    setBusy]    = useState(null); // 'save' | 'tick' | id
  const [msg,     setMsg]     = useState(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/fake-orders")
      .then((r) => r.json())
      .then((d) => setData({ configs: d.configs || [], affiliates: d.affiliates || [], products: d.products || [] }))
      .catch(() => setData({ configs: [], affiliates: [], products: [] }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleDay = (n) => {
    const days = form.workingDays.split(",").filter(Boolean).map(Number);
    const next = days.includes(n) ? days.filter((d) => d !== n) : [...days, n];
    set("workingDays", next.sort().join(","));
  };
  const toggleAffiliate = (id) => {
    setForm((f) => ({
      ...f,
      affiliateIds: f.affiliateIds.includes(id)
        ? f.affiliateIds.filter((a) => a !== id)
        : [...f.affiliateIds, id],
    }));
  };

  const save = async () => {
    if (!form.affiliateIds.length) { setMsg({ type: "err", text: "Sélectionnez au moins un affilié." }); return; }
    setBusy("save"); setMsg(null);
    try {
      const payload = {
        enabled: form.enabled,
        ordersPerMinute: form.ordersPerMinute === "" ? null : form.ordersPerMinute,
        ordersPerHour:   form.ordersPerHour   === "" ? null : form.ordersPerHour,
        ordersPerDay:    form.ordersPerDay    === "" ? null : form.ordersPerDay,
        minDelaySec: form.minDelaySec, maxDelaySec: form.maxDelaySec,
        workingHourStart: form.workingHourStart, workingHourEnd: form.workingHourEnd,
        workingDays: form.workingDays,
        productMode: form.productMode, productIds: form.productIds,
      };
      // Apply the same config to every selected affiliate (one or many).
      for (const affiliateId of form.affiliateIds) {
        const res = await fetch("/api/admin/fake-orders", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ affiliateId, ...payload }),
        });
        if (!res.ok) throw new Error("save failed");
      }
      setMsg({ type: "ok", text: `Configuration enregistrée pour ${form.affiliateIds.length} affilié(s).` });
      setForm(BLANK_FAKE_FORM);
      load();
    } catch {
      setMsg({ type: "err", text: "Échec de l'enregistrement." });
    } finally { setBusy(null); }
  };

  const toggleEnabled = async (cfg) => {
    setBusy(cfg.affiliateId);
    try {
      await fetch("/api/admin/fake-orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ affiliateId: cfg.affiliateId, enabled: !cfg.enabled }),
      });
      load();
    } finally { setBusy(null); }
  };

  const remove = async (cfg) => {
    setBusy(cfg.affiliateId);
    try {
      await fetch(`/api/admin/fake-orders?affiliateId=${encodeURIComponent(cfg.affiliateId)}`, { method: "DELETE" });
      load();
    } finally { setBusy(null); }
  };

  const runTick = async () => {
    setBusy("tick"); setMsg(null);
    try {
      const res = await fetch("/api/admin/fake-orders/tick", { method: "POST" });
      const d = await res.json();
      setMsg({ type: "ok", text: `Tick exécuté — ${d.emitted ?? 0} commande(s) fictive(s) générée(s).` });
      load();
    } catch {
      setMsg({ type: "err", text: "Échec du tick." });
    } finally { setBusy(null); }
  };

  const nameFor = (id) => {
    const a = data.affiliates.find((x) => x.id === id);
    return a ? (a.name || a.username) : id.slice(0, 8);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mt-6">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 bg-fuchsia-50">
        <div className="flex items-center gap-3">
          <span className="text-lg">🎭</span>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Fake Orders</h2>
            <p className="text-[11px] text-gray-500">
              Commandes fictives (motivation). Invisibles pour l'affilié · exclues de toute intégration externe.
            </p>
          </div>
        </div>
        <button
          onClick={runTick}
          disabled={busy === "tick"}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-fuchsia-600 text-white hover:bg-fuchsia-700 disabled:opacity-50"
        >
          {busy === "tick" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          Lancer un tick
        </button>
      </div>

      <div className="p-5 space-y-6">
        {msg && (
          <div className={`text-xs px-3 py-2 rounded-lg ${msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {msg.text}
          </div>
        )}

        {/* ── Configuration form ─────────────────────────────────────────── */}
        <div className="border border-gray-100 rounded-xl p-4 space-y-4">
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Nouvelle configuration</h3>

          {/* Affiliate multi-select */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Affiliés (un ou plusieurs)</label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {data.affiliates.map((a) => (
                <button
                  key={a.id}
                  onClick={() => toggleAffiliate(a.id)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    form.affiliateIds.includes(a.id)
                      ? "bg-fuchsia-600 text-white border-fuchsia-600"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:border-fuchsia-300"
                  }`}
                >
                  {a.name || a.username}
                </button>
              ))}
              {!data.affiliates.length && <span className="text-xs text-gray-400">Aucun affilié actif.</span>}
            </div>
          </div>

          {/* Rate limits */}
          <div className="grid grid-cols-3 gap-3">
            <NumField label="Commandes / minute" value={form.ordersPerMinute} onChange={(v) => set("ordersPerMinute", v)} placeholder="∞" />
            <NumField label="Commandes / heure"  value={form.ordersPerHour}   onChange={(v) => set("ordersPerHour", v)}   placeholder="∞" />
            <NumField label="Commandes / jour"   value={form.ordersPerDay}    onChange={(v) => set("ordersPerDay", v)}    placeholder="∞" />
          </div>

          {/* Delay + hours */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <NumField label="Délai min (s)" value={form.minDelaySec} onChange={(v) => set("minDelaySec", v)} />
            <NumField label="Délai max (s)" value={form.maxDelaySec} onChange={(v) => set("maxDelaySec", v)} />
            <NumField label="Heure début (0-23)" value={form.workingHourStart} onChange={(v) => set("workingHourStart", v)} />
            <NumField label="Heure fin (0-24)"   value={form.workingHourEnd}   onChange={(v) => set("workingHourEnd", v)} />
          </div>

          {/* Working days */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Jours actifs</label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const on = form.workingDays.split(",").filter(Boolean).map(Number).includes(d.n);
                return (
                  <button
                    key={d.n}
                    onClick={() => toggleDay(d.n)}
                    className={`px-2.5 py-1 rounded-lg text-xs border ${
                      on ? "bg-fuchsia-600 text-white border-fuchsia-600" : "bg-gray-50 text-gray-500 border-gray-200"
                    }`}
                  >
                    {d.l}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Products */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Produits</label>
            <div className="flex gap-2 mb-2">
              {["all", "selected"].map((m) => (
                <button
                  key={m}
                  onClick={() => set("productMode", m)}
                  className={`px-3 py-1.5 rounded-lg text-xs border ${
                    form.productMode === m ? "bg-gray-900 text-white border-gray-900" : "bg-gray-50 text-gray-600 border-gray-200"
                  }`}
                >
                  {m === "all" ? "Tous les produits actifs" : "Produits sélectionnés"}
                </button>
              ))}
            </div>
            {form.productMode === "selected" && (
              <select
                multiple
                value={form.productIds}
                onChange={(e) => set("productIds", Array.from(e.target.selectedOptions).map((o) => o.value))}
                className="w-full h-32 text-xs border border-gray-200 rounded-lg p-2"
              >
                {data.products.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
              Activer immédiatement (Start)
            </label>
            <button
              onClick={save}
              disabled={busy === "save"}
              className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-gray-900 text-white hover:bg-black disabled:opacity-50"
            >
              {busy === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              Enregistrer
            </button>
          </div>
        </div>

        {/* ── Existing configs ───────────────────────────────────────────── */}
        <div>
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Affiliés configurés</h3>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : !data.configs.length ? (
            <p className="text-xs text-gray-400">Aucune configuration.</p>
          ) : (
            <div className="space-y-2">
              {data.configs.map((cfg) => (
                <div key={cfg.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {cfg.affiliate?.name || cfg.affiliate?.username || nameFor(cfg.affiliateId)}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg.enabled ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {cfg.enabled ? "ON" : "OFF"}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {cfg.ordersPerHour ?? "∞"}/h · {cfg.ordersPerDay ?? "∞"}/j · {cfg.workingHourStart}h-{cfg.workingHourEnd}h ·
                      délai {cfg.minDelaySec}-{cfg.maxDelaySec}s · {cfg.productMode === "all" ? "tous produits" : `${cfg.productIds.length} produit(s)`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => toggleEnabled(cfg)}
                      disabled={busy === cfg.affiliateId}
                      className="text-gray-500 hover:text-fuchsia-600"
                      title={cfg.enabled ? "Stop" : "Start"}
                    >
                      {cfg.enabled ? <ToggleRight className="w-6 h-6 text-green-600" /> : <ToggleLeft className="w-6 h-6" />}
                    </button>
                    <button
                      onClick={() => remove(cfg)}
                      disabled={busy === cfg.affiliateId}
                      className="text-gray-400 hover:text-red-600"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>
      <input
        type="number"
        min="0"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 focus:outline-none focus:border-gray-400"
      />
    </div>
  );
}

// ── 💬 Affiliate WhatsApp Support settings ─────────────────────────────────────
function SupportSettingsPanel() {
  const [cfg,     setCfg]     = useState({ enabled: false, whatsappNumber: "", defaultMessage: "" });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState(null);

  useEffect(() => {
    fetch("/api/setting?type=affiliate-support")
      .then((r) => r.json())
      .then((d) => setCfg({
        enabled: d?.enabled === true,
        whatsappNumber: d?.whatsappNumber || "",
        defaultMessage: d?.defaultMessage || "",
      }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/setting?type=affiliate-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: cfg.enabled,
          whatsappNumber: cfg.whatsappNumber.trim(),
          defaultMessage: cfg.defaultMessage,
        }),
      });
      setMsg(res.ok ? { ok: true, t: "Enregistré." } : { ok: false, t: "Échec." });
    } catch { setMsg({ ok: false, t: "Échec." }); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mt-6">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-green-50">
        <span className="text-lg">💬</span>
        <div>
          <h2 className="text-sm font-bold text-gray-900">Support WhatsApp (affiliés)</h2>
          <p className="text-[11px] text-gray-500">Numéro & message lus par le dashboard affilié. Désactivé → bouton masqué.</p>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : (
          <>
            {msg && <div className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</div>}
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
              Activer le bouton de support WhatsApp
            </label>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Numéro WhatsApp (format international, ex: 2126…)</label>
              <input
                value={cfg.whatsappNumber}
                onChange={(e) => setCfg({ ...cfg, whatsappNumber: e.target.value })}
                placeholder="212600000000"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Message par défaut (placeholders : {"{{username}}"}, {"{{affiliateId}}"})</label>
              <textarea
                value={cfg.defaultMessage}
                onChange={(e) => setCfg({ ...cfg, defaultMessage: e.target.value })}
                placeholder="Laisser vide pour le message par défaut"
                className="w-full h-28 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:border-gray-400"
              />
            </div>
            <div className="flex justify-end">
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-gray-900 text-white hover:bg-black disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />} Enregistrer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
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
            affiliates={affiliates}
          />
        </Modal>
      )}

      <TeamBonusConfigPanel />
      <DemoManagementPanel />

      <DemoAvatarLibrary />

      <FakeOrdersPanel />

      <SupportSettingsPanel />
    </div>
  );
}
