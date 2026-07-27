"use client";

/**
 * src/app/affiliate/dashboard/DepositTab.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Affiliate "Dépôt de garantie" — reuses the extracted checkout UI (amount
 * banner, bank details card + copy, proof upload). The deposit amount is FIXED
 * by the admin (read-only here; the server re-reads it on submit — the client
 * can never set it). "Voir la preuve" opens the proof in an in-page modal via
 * the protected API route (never exposing the private storage URL).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from "react";
import { Wallet, CreditCard, Loader2, CheckCircle, AlertCircle, X } from "lucide-react";
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
  const [data, setData]       = useState({ summary: { approvedBalance: 0, pendingTotal: 0 }, deposits: [], depositAmount: 0 });
  const [bankInfo, setBankInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const [file, setFile]               = useState(null);
  const [preview, setPreview]         = useState(null);
  const [previewIsPdf, setPreviewPdf] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [msg, setMsg]                 = useState(null);
  const [proof, setProof]             = useState(null); // { id, loading, url, contentType, error }

  const authHeaders = () => (token ? { Authorization: `Bearer ${token}` } : {});

  const load = () => {
    setLoading(true);
    fetch("/api/affiliate/deposits", { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setData({
        summary: d.summary || { approvedBalance: 0, pendingTotal: 0 },
        deposits: d.deposits || [],
        depositAmount: d.depositAmount || 0,
      }))
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
    if (!file) { setMsg({ type: "err", text: "La preuve du virement est requise." }); return; }

    // NOTE: the amount is NOT sent — the server reads the admin-fixed amount.
    setSubmitting(true); setMsg(null);
    const fd = new FormData();
    fd.append("paymentMethod", DEPOSIT_METHOD);
    fd.append("proof", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/affiliate/deposits");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.onload = () => {
      setSubmitting(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        removeFile();
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

  // ── Proof preview modal (in-page; uses the protected route via fetch+blob) ──
  const openProof = async (id) => {
    setProof({ id, loading: true, url: null, contentType: null, error: null });
    try {
      const res = await fetch(`/api/affiliate/deposits/${id}/proof`, { headers: authHeaders() });
      if (!res.ok) {
        const err =
          res.status === 401 ? "Session expirée. Veuillez vous reconnecter."
          : res.status === 403 ? "Accès non autorisé à cette preuve."
          : res.status === 404 ? "Preuve introuvable."
          : "Impossible de charger la preuve.";
        setProof({ id, loading: false, url: null, contentType: null, error: err });
        return;
      }
      const contentType = res.headers.get("Content-Type") || "";
      const url = URL.createObjectURL(await res.blob());
      setProof({ id, loading: false, url, contentType, error: null });
    } catch {
      setProof({ id, loading: false, url: null, contentType: null, error: "Erreur réseau. Réessayez." });
    }
  };
  const closeProof = () => setProof((p) => { if (p?.url) URL.revokeObjectURL(p.url); return null; });

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
          {/* ── Amount banner (reused) — FIXED, read-only, set by admin ── */}
          <BankTransferAmountBanner
            label="Montant du dépôt de garantie"
            value={fmtMoney(data.depositAmount)}
            footer={<p className="text-xs mt-2 opacity-60">Ce montant est fixé par l'administration.</p>}
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
            disabled={submitting || !file}
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
                    <button onClick={() => openProof(d.id)}
                      className="text-xs text-indigo-600 hover:underline shrink-0">Voir la preuve</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Proof preview modal ── */}
      {proof && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={closeProof}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Preuve du virement</h3>
              <button onClick={closeProof} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center min-h-[240px]">
              {proof.loading ? (
                <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
              ) : proof.error ? (
                <div className="p-6 text-center text-sm text-red-600 flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{proof.error}</div>
              ) : proof.contentType.includes("pdf") ? (
                <iframe src={proof.url} title="Preuve du virement" className="w-full h-[70vh]" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proof.url} alt="Preuve du virement" className="max-w-full max-h-[70vh] object-contain" />
              )}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={closeProof} className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200">Fermer</button>
              {proof.url && !proof.error && (
                <button onClick={() => window.open(proof.url, "_blank", "noopener")}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-900 text-white hover:bg-black">Ouvrir dans un nouvel onglet</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
