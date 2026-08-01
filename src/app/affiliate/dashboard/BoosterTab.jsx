"use client";

/**
 * 🚀 Starter Booster tab — purchase flow paying with the EXISTING balance (or
 * the manual card/transfer flow). UI only talks to /api/affiliate/boosters; all
 * money rules (atomic re-check + deduct + activate, duplicate guard) live
 * server-side. No separate wallet anywhere.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Rocket, Wallet, CreditCard, CheckCircle, AlertCircle, X, ChevronRight } from "lucide-react";

const fmt = (n) => `${Number(n || 0).toLocaleString("en-US")} DH`;

// Same auth pattern as UgcTab: HttpOnly cookie preferred server-side, Bearer
// header kept for the existing token-based frontend.
function authHeaders() {
  const t = (typeof localStorage !== "undefined" && localStorage.getItem("affiliateToken")) || "";
  return { Authorization: `Bearer ${t}` };
}

const STATUS_BADGE = {
  ACTIVE:   { t: "Actif",      c: "bg-green-100 text-green-700" },
  PENDING:  { t: "En attente", c: "bg-yellow-100 text-yellow-700" },
  REJECTED: { t: "Refusé",     c: "bg-red-100 text-red-600" },
};

export default function BoosterTab({ onRecharge }) {
  const [data, setData] = useState(null);     // { enabled, packages, purchases, balance }
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);  // package chosen on screen 1
  const [method, setMethod] = useState(null);      // 'BALANCE' | 'CARD'
  const [confirming, setConfirming] = useState(false); // confirmation modal open
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);            // { ok, text }

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/affiliate/boosters", { headers: authHeaders(), cache: "no-store" });
      const d = await r.json();
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const balance = Number(data?.balance || 0);
  const sufficient = selected ? balance >= selected.price : false;

  const openPackage = (pkg) => {
    setSelected(pkg);
    setMethod(balance >= pkg.price ? "BALANCE" : "CARD"); // default selection
    setMsg(null);
  };

  const buy = async (chosenMethod) => {
    if (!selected || busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/affiliate/boosters", {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ packageId: selected.id, method: chosenMethod }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg({ ok: false, text: d?.error || "Erreur" }); return; }
      setMsg({
        ok: true,
        text: chosenMethod === "BALANCE"
          ? `🚀 ${selected.name} activé — payé avec votre solde.`
          : `Demande enregistrée — le pack sera activé après validation du paiement.`,
      });
      setSelected(null); setMethod(null);
      await load(); // refresh balance + history
    } catch { setMsg({ ok: false, text: "Erreur réseau" }); }
    finally { setBusy(false); setConfirming(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  if (!data?.enabled || !(data?.packages || []).length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
        <Rocket className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-bold text-gray-700">Les Starter Boosters arrivent bientôt</p>
        <p className="text-xs text-gray-400 mt-1">Aucun pack disponible pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${msg.ok ? "bg-green-50 border border-green-100 text-green-700" : "bg-red-50 border border-red-100 text-red-700"}`}>
          {msg.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* Balance strip */}
      <div className="bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl p-5 text-white flex items-center justify-between">
        <div>
          <p className="text-xs opacity-75">Solde disponible</p>
          <p className="text-2xl font-black">{fmt(balance)}</p>
        </div>
        <Rocket className="w-8 h-8 opacity-60" />
      </div>

      {/* ── Screen 1: packages ── */}
      {!selected && (
        <div className="grid sm:grid-cols-2 gap-3">
          {data.packages.map((p) => {
            const owned = (data.purchases || []).some((x) => x.packageId === p.id && ["ACTIVE", "PENDING"].includes(x.status));
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col hover:shadow-md transition-shadow">
                <div className="text-3xl mb-2">{p.emoji}</div>
                <p className="text-sm font-black text-gray-900">{p.name}</p>
                {p.description && <p className="text-xs text-gray-500 mt-1 flex-1">{p.description}</p>}
                <p className="text-xl font-black text-gray-900 mt-3">{fmt(p.price)}</p>
                <button type="button" disabled={owned && !data.allowStacking}
                  onClick={() => openPackage(p)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 py-3 rounded-xl bg-gray-900 hover:bg-black text-white text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-40">
                  {owned && !data.allowStacking ? "Déjà acquis" : <>Continuer <ChevronRight className="w-4 h-4" /></>}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Screen 2: payment method ── */}
      {selected && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 max-w-xl">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-gray-900">{selected.emoji} {selected.name} — {fmt(selected.price)}</p>
            <button type="button" onClick={() => { setSelected(null); setMethod(null); }} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
          </div>

          {/* Method cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button type="button" onClick={() => setMethod("BALANCE")} disabled={!sufficient}
              className={`relative text-right rounded-2xl border-2 p-4 transition-all ${method === "BALANCE" ? "border-violet-600 bg-violet-50" : "border-gray-200 bg-white"} ${!sufficient ? "opacity-50 cursor-not-allowed" : "hover:border-violet-300"}`}>
              {sufficient && (
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-green-500 text-white text-[10px] font-black">🟢 Recommandé</span>
              )}
              <div className="flex items-center gap-2 justify-end"><span className="text-sm font-black text-gray-900">Solde</span><Wallet className="w-5 h-5 text-violet-600" /></div>
              <p className="text-xs text-gray-500 mt-1">{fmt(balance)} disponibles</p>
            </button>
            <button type="button" onClick={() => setMethod("CARD")}
              className={`text-right rounded-2xl border-2 p-4 transition-all ${method === "CARD" ? "border-violet-600 bg-violet-50" : "border-gray-200 bg-white hover:border-violet-300"}`}>
              <div className="flex items-center gap-2 justify-end"><span className="text-sm font-black text-gray-900">Carte / Virement</span><CreditCard className="w-5 h-5 text-violet-600" /></div>
              <p className="text-xs text-gray-500 mt-1">Validation manuelle après paiement</p>
            </button>
          </div>

          {/* Balance summary OR insufficient panel */}
          {method === "BALANCE" && sufficient && (
            <>
              <div className="rounded-xl bg-gray-50 border border-gray-100 divide-y divide-gray-100 text-sm">
                <div className="flex justify-between px-4 py-2.5"><span className="text-gray-500">Solde actuel</span><strong>{fmt(balance)}</strong></div>
                <div className="flex justify-between px-4 py-2.5"><span className="text-gray-500">Prix du pack</span><strong className="text-red-600">−{fmt(selected.price)}</strong></div>
                <div className="flex justify-between px-4 py-2.5"><span className="text-gray-500">Solde restant</span><strong className="text-green-600">{fmt(balance - selected.price)}</strong></div>
              </div>
              <button type="button" onClick={() => setConfirming(true)} disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-black text-sm shadow-lg shadow-violet-200 active:scale-[0.98] transition-all disabled:opacity-50">
                🚀 Activer avec mon solde
              </button>
            </>
          )}

          {!sufficient && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm">
              <p className="font-bold text-amber-800">Votre solde est insuffisant.</p>
              <p className="text-amber-700 mt-1">Montant manquant : <strong>{fmt(selected.price - balance)}</strong></p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                <button type="button" onClick={() => buy("CARD")} disabled={busy}
                  className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-bold disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Payer par carte
                </button>
                <button type="button" onClick={onRecharge}
                  className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-amber-400 hover:bg-amber-500 text-gray-900 text-xs font-bold">
                  <Wallet className="w-4 h-4" /> Recharger le solde
                </button>
              </div>
            </div>
          )}

          {method === "CARD" && sufficient && (
            <button type="button" onClick={() => buy("CARD")} disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gray-900 hover:bg-black text-white font-black text-sm active:scale-[0.98] transition-all disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Payer par carte / virement
            </button>
          )}
        </div>
      )}

      {/* Purchases */}
      {(data.purchases || []).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Mes boosters</p>
          <div className="space-y-2">
            {data.purchases.map((p) => {
              const b = STATUS_BADGE[p.status] || STATUS_BADGE.PENDING;
              return (
                <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">🚀 {p.packageName}</p>
                    <p className="text-xs text-gray-400">−{fmt(p.price)} · {p.paymentMethod === "BALANCE" ? "Payé avec le solde" : "Payé par carte"}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${b.c}`}>{b.t}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirmation modal (before any balance deduction) */}
      {confirming && selected && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" onClick={() => !busy && setConfirming(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 animate-[bstUp_0.25s_ease]" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-black text-gray-900 mb-1">Confirmer l'activation ?</p>
            <p className="text-sm text-gray-600">
              <strong>{fmt(selected.price)}</strong> seront déduits immédiatement de votre solde pour activer <strong>{selected.name}</strong>.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-5">
              <button type="button" onClick={() => setConfirming(false)} disabled={busy}
                className="py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold">Annuler</button>
              <button type="button" onClick={() => buy("BALANCE")} disabled={busy}
                className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "🚀"} Confirmer
              </button>
            </div>
          </div>
          <style>{`@keyframes bstUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
        </div>
      )}
    </div>
  );
}
