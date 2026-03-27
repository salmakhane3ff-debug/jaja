"use client";

import { useState, useEffect, useMemo } from "react";
import { CreditCard, CheckCircle, Loader2, Search, Filter } from "lucide-react";

function fmtMoney(n) { return n != null ? `${Number(n).toFixed(2)} MAD` : "—"; }
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function PayoutBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold
      ${status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
      {status === "paid" ? "Payé" : "En attente"}
    </span>
  );
}

export default function AdminAffiliatePayoutsPage() {
  const [payouts,     setPayouts]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [filter,      setFilter]      = useState("all");
  const [approvingId, setApprovingId] = useState(null);
  const [error,       setError]       = useState(null);

  useEffect(() => {
    fetch("/api/admin/affiliate-payouts")
      .then((r) => r.json())
      .then((d) => setPayouts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const displayed = useMemo(() => {
    let list = payouts;
    if (filter !== "all") list = list.filter((p) => p.status === filter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) =>
      p.affiliateUsername?.toLowerCase().includes(q) ||
      p.affiliateName?.toLowerCase().includes(q) ||
      p.rib?.includes(q)
    );
    return list;
  }, [payouts, filter, search]);

  const handleApprove = async (id) => {
    if (!confirm("Approuver ce retrait et marquer comme payé ?")) return;
    setApprovingId(id);
    setError(null);
    try {
      const r = await fetch("/api/admin/affiliate-payouts", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id }),
      });
      if (r.ok) {
        setPayouts((prev) => prev.map((p) => p.id === id ? { ...p, status: "paid" } : p));
      } else {
        setError("Erreur lors de l'approbation");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setApprovingId(null);
    }
  };

  const pendingTotal = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0);

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="py-6 max-w-5xl space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Demandes de retrait</h1>
          <p className="text-sm text-gray-500 mt-0.5">{displayed.length} / {payouts.length} demande(s)</p>
        </div>

        {/* Pending total chip */}
        {pendingTotal > 0 && (
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2.5">
            <CreditCard className="w-4 h-4 text-yellow-600" />
            <span className="text-sm font-bold text-yellow-700">{fmtMoney(pendingTotal)} en attente</span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Affilié, RIB..."
            className="w-full pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 bg-gray-50"
          />
        </div>
        <div className="flex gap-1.5">
          {["all","pending","paid"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-2 text-xs font-semibold rounded-xl transition-colors
                ${filter === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {s === "all" ? "Tous" : s === "pending" ? "En attente" : "Payés"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <CreditCard className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">Aucune demande de retrait</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["Affilié","Montant","Banque","RIB","Titulaire","Statut","Date","Action"].map((h) => (
                    <th key={h} className="text-right text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayed.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{p.affiliateName || "—"}</p>
                      <p className="text-xs text-gray-400 font-mono">@{p.affiliateUsername}</p>
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{fmtMoney(p.amount)}</td>
                    <td className="px-4 py-3 text-gray-600">{p.bankName || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 max-w-[140px] truncate">{p.rib || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{p.accountName || "—"}</td>
                    <td className="px-4 py-3"><PayoutBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                    <td className="px-4 py-3">
                      {p.status === "pending" && (
                        <button
                          onClick={() => handleApprove(p.id)}
                          disabled={approvingId === p.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 rounded-xl transition-colors disabled:opacity-50"
                        >
                          {approvingId === p.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <CheckCircle className="w-3.5 h-3.5" />}
                          Approuver
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
