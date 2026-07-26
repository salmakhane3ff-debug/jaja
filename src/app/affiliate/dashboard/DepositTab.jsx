"use client";

/**
 * src/app/affiliate/dashboard/DepositTab.jsx
 * Affiliate "Dépôt de garantie" — approved (derived) balance + pending total,
 * a new-request form (proof upload), and the request history. Completely
 * separate from Solde disponible / withdrawals.
 */
import { useState, useEffect, useRef } from "react";
import { Wallet, Loader2, Upload, CheckCircle, AlertCircle } from "lucide-react";

const STATUS = {
  PENDING:  { label: "En attente", cls: "bg-amber-50 text-amber-700" },
  APPROVED: { label: "Approuvé", cls: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Refusé", cls: "bg-red-50 text-red-700" },
};
const ACCEPT = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
const MAX = 8 * 1024 * 1024;
const fmtMoney = (n) => `${Number(n || 0).toFixed(0)} MAD`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { dateStyle: "medium" }) : "—");

export default function DepositTab({ token, onChanged }) {
  const [data, setData]       = useState({ summary: { approvedBalance: 0, pendingTotal: 0 }, deposits: [] });
  const [loading, setLoading] = useState(true);
  const [form, setForm]       = useState({ amount: "", paymentMethod: "", transferReference: "", affiliateNote: "" });
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg]         = useState(null);
  const fileRef = useRef(null);

  const authHeaders = () => (token ? { Authorization: `Bearer ${token}` } : {});

  const load = () => {
    setLoading(true);
    fetch("/api/affiliate/deposits", { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setData({ summary: d.summary || { approvedBalance: 0, pendingTotal: 0 }, deposits: d.deposits || [] }))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Only one open request at a time — a PENDING request blocks new submissions.
  const hasPending = data.deposits.some((d) => d.status === "PENDING");

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const pickFile = (f) => {
    if (!f) return;
    if (!ACCEPT.includes(f.type)) { setMsg({ type: "err", text: "Format non supporté (JPG, PNG, WEBP ou PDF)." }); return; }
    if (f.size > MAX) { setMsg({ type: "err", text: "Fichier trop volumineux (max 8 Mo)." }); return; }
    setMsg(null);
    setFile(f);
    setPreview(f.type === "application/pdf" ? null : URL.createObjectURL(f));
  };

  const submit = (e) => {
    e.preventDefault();
    if (submitting || hasPending) return; // prevent double submission / second pending request
    if (!form.amount || parseFloat(form.amount) <= 0) { setMsg({ type: "err", text: "Montant invalide." }); return; }
    if (!form.paymentMethod.trim()) { setMsg({ type: "err", text: "Méthode de paiement requise." }); return; }
    if (!file) { setMsg({ type: "err", text: "La preuve du virement est requise." }); return; }

    setSubmitting(true); setMsg(null);
    const fd = new FormData();
    fd.append("amount", form.amount);
    fd.append("paymentMethod", form.paymentMethod);
    fd.append("transferReference", form.transferReference);
    fd.append("affiliateNote", form.affiliateNote);
    fd.append("proof", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/affiliate/deposits");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.onload = () => {
      setSubmitting(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        // Reset the form ONLY after confirmed success.
        setForm({ amount: "", paymentMethod: "", transferReference: "", affiliateNote: "" });
        setFile(null); setPreview(null);
        if (fileRef.current) fileRef.current.value = "";
        setMsg({ type: "ok", text: "Demande envoyée. Elle sera validée par l'administrateur." });
        load();
        onChanged?.();
      } else {
        let m = "Échec de l'envoi.";
        try { m = JSON.parse(xhr.responseText)?.error || m; } catch {}
        setMsg({ type: "err", text: m });
      }
    };
    xhr.onerror = () => { setSubmitting(false); setMsg({ type: "err", text: "Erreur réseau." }); };
    xhr.send(fd);
  };

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><Wallet className="w-4 h-4" /> Dépôt de garantie approuvé</div>
          <p className="text-2xl font-black text-gray-900">{fmtMoney(data.summary.approvedBalance)}</p>
          <p className="text-[11px] text-gray-400 mt-1">Séparé du solde disponible · non retirable</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
          <div className="text-amber-700 text-xs mb-1">En attente de validation</div>
          <p className="text-2xl font-black text-amber-700">{fmtMoney(data.summary.pendingTotal)}</p>
        </div>
      </div>

      {/* New request form */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Nouvelle demande de dépôt</h3>
        {hasPending && (
          <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg mb-3 bg-amber-50 text-amber-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Vous avez déjà une demande en attente de validation.
          </div>
        )}
        {msg && (
          <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg mb-3 ${msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {msg.type === "ok" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{msg.text}
          </div>
        )}
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="number" min="1" step="0.01" value={form.amount} onChange={(e) => setF("amount", e.target.value)}
              placeholder="Montant (MAD) *" className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 bg-gray-50 focus:outline-none focus:border-gray-400" />
            <input value={form.paymentMethod} onChange={(e) => setF("paymentMethod", e.target.value)}
              placeholder="Méthode de paiement *" className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 bg-gray-50 focus:outline-none focus:border-gray-400" />
          </div>
          <input value={form.transferReference} onChange={(e) => setF("transferReference", e.target.value)}
            placeholder="Référence du virement (optionnel)" className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 bg-gray-50 focus:outline-none focus:border-gray-400" />
          <textarea value={form.affiliateNote} onChange={(e) => setF("affiliateNote", e.target.value)}
            placeholder="Commentaire (optionnel)" className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 bg-gray-50 h-20 focus:outline-none focus:border-gray-400" />

          {/* Proof upload (required) */}
          <div>
            <input ref={fileRef} type="file" accept={ACCEPT.join(",")} className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
            {file ? (
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl p-3">
                {preview
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={preview} alt="preuve" className="w-16 h-16 object-cover rounded-lg" />
                  : <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-500">PDF</div>}
                <span className="text-xs text-gray-600 flex-1 truncate">{file.name}</span>
                <button type="button" onClick={() => { setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
                  className="text-xs text-red-600 hover:underline">Retirer</button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-4 text-sm text-gray-500 hover:border-indigo-300 bg-gray-50">
                <Upload className="w-4 h-4" /> Capture / preuve du virement * (JPG, PNG, WEBP, PDF · max 8 Mo)
              </button>
            )}
          </div>

          <button type="submit" disabled={submitting || hasPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
            {submitting ? "Envoi…" : "Envoyer la demande"}
          </button>
        </form>
      </div>

      {/* History */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Historique des demandes</h3>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : data.deposits.length === 0 ? (
          <p className="text-xs text-gray-400">Aucune demande pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {data.deposits.map((d) => {
              const s = STATUS[d.status] || { label: d.status, cls: "bg-gray-50 text-gray-600" };
              return (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border border-gray-100 rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{fmtMoney(d.amount)}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">{d.paymentMethod} · {fmtDate(d.createdAt)}{d.transferReference ? ` · Réf ${d.transferReference}` : ""}</p>
                    {d.status === "REJECTED" && d.rejectionReason && (
                      <p className="text-[11px] text-red-600 mt-0.5">Motif : {d.rejectionReason}</p>
                    )}
                  </div>
                  {d.hasProof && (
                    <a href={`/api/affiliate/deposits/${d.id}/proof`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:underline shrink-0">Voir la preuve</a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
