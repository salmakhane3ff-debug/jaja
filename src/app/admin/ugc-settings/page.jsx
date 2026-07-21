"use client";

/**
 * /admin/ugc-settings — UGC module configuration (Admin UI, increment 2).
 * ─────────────────────────────────────────────────────────────────────────────
 *   GET  /api/admin/ugc-settings  → { settings }  (normalized)
 *   POST /api/admin/ugc-settings  → validated server-side (assertValidUgcSettings);
 *                                   a 400 returns the exact validation errors.
 *
 * The server is the authority on validation — this form mirrors the same bounds
 * for immediate feedback but never bypasses them.
 *
 * SAFETY: "Moteur de gains" is the switch that lets the earnings engine generate
 * virtual sales into affiliate balances. It is called out explicitly because
 * enabling it starts crediting real withdrawable balance.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from "react";
import {
  Settings, Loader2, CheckCircle, AlertCircle, AlertTriangle, Save, Film, DollarSign, Video, Info,
  History, DollarSign as Coins,
} from "lucide-react";
import { describeChange } from "@/lib/ugcSettingsAudit";

const MB = 1024 * 1024;
const CEILING_MB = 200;      // UGC_MAX_UPLOAD_BYTES_CEILING
const MIN_POLL_MINUTES = 1;  // UGC_MIN_POLL_INTERVAL_MS = 60_000
const MAX_INSTRUCTIONS = 30;
const MAX_INSTRUCTION_LEN = 300;

function Toggle({ checked, onChange, label, hint, danger }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button type="button" onClick={() => onChange(!checked)}
        className={`mt-0.5 relative w-10 h-6 rounded-full transition-colors shrink-0
          ${checked ? (danger ? "bg-amber-500" : "bg-gray-900") : "bg-gray-200"}`}>
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${checked ? "left-5" : "left-1"}`} />
      </button>
      <span>
        <span className="block text-sm font-semibold text-gray-800">{label}</span>
        {hint && <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function Card({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60 flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-gray-500" />}
        <h2 className="text-sm font-bold text-gray-700">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

const numInput = "w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400";

export default function AdminUgcSettingsPage() {
  const [s, setS]           = useState(null);
  const [uploadMb, setUploadMb]   = useState(50);
  const [pollMin, setPollMin]     = useState(60);
  const [instructionsText, setInstructionsText] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState(null);  // { type, text }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/ugc-settings");
        const d = await res.json().catch(() => ({}));
        const st = d.settings || {};
        setHistory(Array.isArray(d.history) ? d.history : []);
        setS(st);
        setUploadMb(Math.round((st.maxUploadBytes || 50 * MB) / MB));
        setPollMin(Math.max(MIN_POLL_MINUTES, Math.round((st.pollIntervalMs || 3600000) / 60000)));
        setInstructionsText(Array.isArray(st.instructions) ? st.instructions.join("\n") : "");
      } catch {
        setMsg({ type: "error", text: "Impossible de charger les paramètres." });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (k, v) => setS((prev) => ({ ...prev, [k]: v }));
  const num = (k) => (e) => set(k, e.target.value === "" ? "" : Number(e.target.value));

  // Mirror of the server's rules — for immediate feedback only.
  const localErrors = (() => {
    if (!s) return [];
    const e = [];
    if (!(Number(s.commissionPerSale) >= 0)) e.push("La commission par vente doit être ≥ 0.");
    if (!(Number(s.maxGeneratedSales) >= Number(s.minGeneratedSales))) e.push("Ventes générées : le maximum doit être ≥ au minimum.");
    if (!(Number(s.maxDailyEstimate) >= Number(s.minDailyEstimate))) e.push("Estimation quotidienne : le maximum doit être ≥ au minimum.");
    if (!(Number(s.minVideoSeconds) > 0)) e.push("La durée minimale doit être > 0.");
    if (!(Number(s.maxVideoSeconds) > Number(s.minVideoSeconds))) e.push("La durée maximale doit être > la durée minimale.");
    if (!(uploadMb > 0)) e.push("La taille maximale doit être > 0.");
    if (uploadMb > CEILING_MB) e.push(`La taille maximale ne peut pas dépasser ${CEILING_MB} Mo.`);
    if (pollMin < MIN_POLL_MINUTES) e.push(`L'intervalle doit être ≥ ${MIN_POLL_MINUTES} minute.`);
    if (!(Number(s.generationSpeed) >= 0)) e.push("La vitesse de génération doit être ≥ 0.");
    return e;
  })();

  const instructionLines = instructionsText.split("\n").map((l) => l.trim()).filter(Boolean);

  const handleSave = async () => {
    setMsg(null);
    if (localErrors.length) return setMsg({ type: "error", text: localErrors[0] });
    setSaving(true);
    try {
      const payload = {
        ...s,
        maxUploadBytes: Math.round(uploadMb * MB),
        pollIntervalMs: Math.round(pollMin * 60000),
        instructions: instructionLines.slice(0, MAX_INSTRUCTIONS).map((l) => l.slice(0, MAX_INSTRUCTION_LEN)),
      };
      const res = await fetch("/api/admin/ugc-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: "error", text: d.error || "Échec de l'enregistrement." });
      } else {
        setS(d.settings || payload);
        const n = Array.isArray(d.changes) ? d.changes.length : 0;
        setMsg({
          type: "success",
          text: n === 0
            ? "Aucune modification à enregistrer."
            : `Paramètres enregistrés — ${n} modification(s) consignée(s)${d.earningsAffecting ? " (impact sur les gains)" : ""}.`,
        });
        // Refresh the audit trail so the new entry appears immediately.
        try {
          const r2 = await fetch("/api/admin/ugc-settings");
          const d2 = await r2.json().catch(() => ({}));
          if (Array.isArray(d2.history)) setHistory(d2.history);
        } catch { /* history is best-effort */ }
      }
    } catch {
      setMsg({ type: "error", text: "Erreur réseau." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  }
  if (!s) {
    return <div className="py-6 text-sm text-red-600">Impossible de charger les paramètres UGC.</div>;
  }

  return (
    <div className="py-6 max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres UGC</h1>
        <p className="text-sm text-gray-500 mt-0.5">Configuration du programme vidéo des affiliés</p>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium
          ${msg.type === "success" ? "bg-green-50 border border-green-200 text-green-700"
                                   : "bg-red-50 border border-red-200 text-red-700"}`}>
          {msg.type === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* Module */}
      <Card title="Module" icon={Film}>
        <Toggle checked={!!s.enabled} onChange={(v) => set("enabled", v)}
          label="Activer le programme vidéo"
          hint="Rend l'onglet Vidéos accessible aux affiliés et autorise les soumissions." />

        <Toggle checked={!!s.earningsEngineEnabled} onChange={(v) => set("earningsEngineEnabled", v)} danger
          label="Activer le moteur de gains"
          hint="Le moteur génère des ventes virtuelles pour les vidéos EN DIFFUSION et crédite le solde retirable des affiliés." />

        {s.earningsEngineEnabled && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Le moteur crédite un solde réellement retirable. Il ne génère que pour les vidéos en statut <strong>RUNNING</strong>,
              au maximum une fois par vidéo et par jour (UTC). Le processus du moteur doit également tourner côté serveur.
            </span>
          </div>
        )}

        <Toggle checked={!!s.allowEstimatedEarnings} onChange={(v) => set("allowEstimatedEarnings", v)}
          label="Afficher l'estimation de gains aux affiliés"
          hint="Affiche une fourchette indicative (explicitement non garantie) sur la page d'introduction." />

        <Field label="Statut après approbation" hint="RUNNING démarre la diffusion dès l'approbation ; APPROVED demande un démarrage manuel.">
          <select value={s.defaultApprovedStatus || "RUNNING"} onChange={(e) => set("defaultApprovedStatus", e.target.value)} className={numInput}>
            <option value="RUNNING">RUNNING — diffusion immédiate</option>
            <option value="APPROVED">APPROVED — démarrage manuel</option>
          </select>
        </Field>
      </Card>

      {/* Rémunération & génération */}
      <Card title="Rémunération et génération" icon={DollarSign}>
        <Field label="Commission par vente (MAD)">
          <input type="number" min="0" step="0.01" value={s.commissionPerSale ?? ""} onChange={num("commissionPerSale")} className={numInput} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Ventes générées — min"><input type="number" min="0" value={s.minGeneratedSales ?? ""} onChange={num("minGeneratedSales")} className={numInput} /></Field>
          <Field label="Ventes générées — max"><input type="number" min="0" value={s.maxGeneratedSales ?? ""} onChange={num("maxGeneratedSales")} className={numInput} /></Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Estimation quotidienne — min"><input type="number" min="0" value={s.minDailyEstimate ?? ""} onChange={num("minDailyEstimate")} className={numInput} /></Field>
          <Field label="Estimation quotidienne — max"><input type="number" min="0" value={s.maxDailyEstimate ?? ""} onChange={num("maxDailyEstimate")} className={numInput} /></Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Vitesse de génération" hint="Multiplicateur ≥ 0 (1 = un lot par cycle).">
            <input type="number" min="0" step="0.1" value={s.generationSpeed ?? ""} onChange={num("generationSpeed")} className={numInput} />
          </Field>
          <Field label="Intervalle du moteur (minutes)" hint={`Minimum ${MIN_POLL_MINUTES} minute.`}>
            <input type="number" min={MIN_POLL_MINUTES} value={pollMin} onChange={(e) => setPollMin(Number(e.target.value))} className={numInput} />
          </Field>
        </div>
      </Card>

      {/* Vidéo */}
      <Card title="Contraintes vidéo" icon={Video}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Durée minimale (s)"><input type="number" min="1" value={s.minVideoSeconds ?? ""} onChange={num("minVideoSeconds")} className={numInput} /></Field>
          <Field label="Durée maximale (s)"><input type="number" min="1" value={s.maxVideoSeconds ?? ""} onChange={num("maxVideoSeconds")} className={numInput} /></Field>
        </div>
        <Field label="Taille maximale (Mo)" hint={`Plafond serveur : ${CEILING_MB} Mo.`}>
          <input type="number" min="1" max={CEILING_MB} value={uploadMb} onChange={(e) => setUploadMb(Number(e.target.value))} className={numInput} />
        </Field>
      </Card>

      {/* Contenu affilié */}
      <Card title="Contenu affiché aux affiliés" icon={Info}>
        <Field label="URL de la vidéo exemple">
          <input type="text" dir="ltr" value={s.exampleVideoUrl || ""} onChange={(e) => set("exampleVideoUrl", e.target.value)}
            placeholder="https://…" className={numInput} />
        </Field>
        <Field label="Instructions (une par ligne)"
          hint={`${instructionLines.length}/${MAX_INSTRUCTIONS} lignes · ${MAX_INSTRUCTION_LEN} caractères max par ligne. Texte brut uniquement — jamais interprété comme du HTML.`}>
          <textarea rows={6} value={instructionsText} onChange={(e) => setInstructionsText(e.target.value)}
            placeholder={"Filmez en plein jour\nMontrez le produit en main\nParlez clairement"}
            className={numInput} />
        </Field>
      </Card>

      {/* Local validation summary */}
      {localErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 space-y-1">
          {localErrors.map((e, i) => <p key={i} className="text-xs text-red-700 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> {e}</p>)}
        </div>
      )}

      {/* Audit trail — settings changes, with earnings impact flagged */}
      <Card title="Historique des modifications" icon={History}>
        {history.length === 0 ? (
          <p className="text-xs text-gray-400">
            Aucune modification enregistrée pour le moment. Chaque enregistrement est consigné (qui, quand, quoi),
            et les changements affectant les gains sont signalés.
          </p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className={`rounded-xl p-3 border ${h.earningsAffecting ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100"}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-gray-700">
                    {new Date(h.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    <span className="text-gray-400 font-normal"> · {h.actorType}{h.actorId ? ` (${String(h.actorId).slice(0, 8)}…)` : ""}</span>
                  </p>
                  {h.earningsAffecting && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 text-[10px] font-bold uppercase">
                      <Coins className="w-3 h-3" /> Impact gains
                    </span>
                  )}
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {(Array.isArray(h.changes) ? h.changes : []).map((c, i) => (
                    <li key={i} className="text-xs font-mono text-gray-600 break-all">{describeChange(c)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || localErrors.length > 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
