"use client";

/**
 * src/app/affiliate/dashboard/DepositTab.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Affiliate "Dépôt de garantie" — visually identical to /checkout/confirm by
 * REUSING the same extracted UI components (amount banner, bank details card
 * with copy buttons, proof upload card, submit button). Only the business logic
 * + labels differ: the amount is the security-deposit amount, bank info comes
 * from Bank Settings, the proof uploads to PRIVATE deposit storage, and Submit
 * creates an affiliate deposit request (status: En attente / Approuvé / Refusé).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from "react";
import { Wallet, CreditCard, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import BankTransferAmountBanner from "@/components/checkout/BankTransferAmountBanner";
import BankDetailsCard from "@/components/checkout/BankDetailsCard";
import ProofUploadCard from "@/components/checkout/ProofUploadCard";

const STATUS = {
  PENDING:  { label: "En attente", cls: "bg-amber-50 text-amber-700", banner: "bg-amber-50 border-amber-200 text-amber-800" },
  APPROVED: { label: "Approuvé",  cls: "bg-emerald-50 text-emerald-700", banner: "bg-emerald-50 border-emerald-200 text-emerald-800" },
  REJECTED: { label: "Refusé",    cls: "bg-red-50 text-red-700", banner: "bg-red-50 border-red-200 text-red-800" },
};
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const ACCEPT_LIST = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
const MAX = 8 * 1024 * 1024;
// Deposits are always a bank transfer — the payment method is fixed (the backend
// still requires + stores one), so it is no longer a user-entered field.
const DEPOSIT_METHOD = "Virement bancaire";
const fmtMoney = (n) => `${Number(n || 0).toFixed(0)} MAD`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { dateStyle: "medium" }) : "—");

const BANK_LABELS = {
  title: "Coordonnées bancaires", bankName: "Banque", accountHolder: "Titulaire du compte",
  accountNumber: "Numéro de compte", copy: "Copier", copied: "Copié",
};
const UPLOAD_LABELS = {
  title: "Preuve du virement", click: "Cliquez pour téléverser",
  drag: "ou glissez-déposez (JPG, PNG, WEBP, PDF · max 8 Mo)",
  uploaded: "Ajouté", processing: "Téléversement…", previewAlt: "Preuve du virement",
};

export default function DepositTab({ token, onChanged }) {
  const [data, setData]       = useState({ summary: { approvedBalance: 0, pendingTotal: 0 }, deposits: [] });
  const [bankInfo, setBankInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount]           = useState("");
  const [file, setFile]               = useState(null);
  const [preview, setPreview]         = useState(null);
  const [previewIsPdf, setPreviewPdf] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [msg, setMsg]                 = useState(null);

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

  // Bank info from the existing Bank Settings (first/default method).
  useEffect(() => {
    fetch("/api/setting?type=bank-settings")
      .then((r) => r.json())
      .then((d) => {
        const methods = Array.isArray(d?.methods) ? d.methods : [];
        setBankInfo(methods[0] || (d && (d.rib || d.bankName) ? d : null));
      })
      .catch(() => {});
  }, []);

  const hasPending = data.deposits.some((d) => d.status === "PENDING");
  const latest = data.deposits[0] || null;

  const selectFile = (f) => {
    if (!f) return;
    if (!ACCEPT_LIST.includes(f.type)) { setMsg({ type: "err", text: "Format non supporté (JPG, PNG, WEBP ou PDF)." }); return; }
    if (f.size > MAX) { setMsg({ type: "err", text: "Fichier trop volumineux (max 8 Mo)." }); return; }
    setMsg(null);
    setFile(f);
    setPreviewPdf(f.type === "application/pdf");
    setPreview(f.type === "application/pdf" ? "pdf" : URL.createObjectURL(f));
  };
  const removeFile = () => { setFile(null); setPreview(null); setPreviewPdf(false); };

  const submit = () => {
    if (submitting || hasPending) return;
    if (!amount || parseFloat(amount) <= 0) { setMsg({ type: "err", text: "Montant invalide." }); return; }
    if (!file) { setMsg({ type: "err", text: "La preuve du virement est requise." }); return; }

    setSubmitting(true); setMsg(null);
    const fd = new FormData();
    fd.append("amount", amount);
    fd.append("paymentMethod", DEPOSIT_METHOD);
    fd.append("proof", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/affiliate/deposits");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.onload = () => {
      setSubmitting(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        setAmount(""); removeFile();
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
    <div className="max-w-lg mx-auto space-y-4">
      {/* Summary — approved (derived) + pending, kept separate from Solde disponible */}
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

      {/* Latest request status (En attente / Approuvé / Refusé) */}
      {latest && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${STATUS[latest.status]?.banner || "bg-gray-50 border-gray-200 text-gray-700"}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold">Dernière demande : {STATUS[latest.status]?.label || latest.status}</span>
            <span className="font-black">{fmtMoney(latest.amount)}</span>
          </div>
          {latest.status === "REJECTED" && latest.rejectionReason && (
            <p className="text-xs mt-1">Motif : {latest.rejectionReason}</p>
          )}
        </div>
      )}

      {msg && (
        <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-2xl ${msg.type === "ok" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-600"}`}>
          {msg.type === "ok" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}{msg.text}
        </div>
      )}

      {hasPending ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
            <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
          </div>
          <p className="text-sm font-bold text-gray-900">Vous avez déjà une demande en attente de validation.</p>
          <p className="text-xs text-gray-500 mt-1">Vous pourrez soumettre une nouvelle demande une fois celle-ci traitée.</p>
        </div>
      ) : (
        <>
          {/* ── Amount banner (reused) — editable deposit amount ── */}
          <BankTransferAmountBanner
            label="Montant du dépôt de garantie"
            value={
              <div className="flex items-center justify-center gap-2">
                <input
                  type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder="0" inputMode="decimal"
                  className="bg-transparent text-white text-4xl font-black text-center outline-none w-44 placeholder-white/30"
                />
                <span className="text-lg font-bold opacity-60">MAD</span>
              </div>
            }
          />

          {/* ── Bank details card (reused) — from Bank Settings ── */}
          <BankDetailsCard bankInfo={bankInfo} labels={BANK_LABELS} />

          {/* ── Proof upload (reused) — PRIVATE deposit storage on submit ── */}
          <ProofUploadCard
            preview={preview}
            previewIsPdf={previewIsPdf}
            uploading={false}
            onSelectFile={selectFile}
            onRemove={removeFile}
            accept={ACCEPT}
            labels={UPLOAD_LABELS}
          />

          {/* ── Submit button (identical style) ── */}
          <button
            onClick={submit}
            disabled={submitting || !amount || !file}
            className="w-full bg-gray-900 hover:bg-gray-800 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all shadow-lg">
            {submitting ? (
              <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Envoi…</>
            ) : (
              <><CreditCard className="w-5 h-5" /> Envoyer la demande</>
            )}
          </button>
        </>
      )}

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
