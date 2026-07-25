"use client";

import { useState, useEffect, useMemo } from "react";
import { ShieldCheck, Loader2, Check, X, RotateCcw, Search, Eye, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

const STATUS_STYLE = {
  PENDING:  { label: "En cours", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  APPROVED: { label: "Vérifiée", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REJECTED: { label: "Refusée", cls: "bg-red-50 text-red-700 border-red-200" },
};

const PAGE_SIZES = [25, 50, 100];

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { label: status, cls: "bg-gray-50 text-gray-600 border-gray-200" };
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.cls}`}>{s.label}</span>;
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
    </div>
  );
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

const ACTION_META = {
  approve: { title: "Approuver la vérification", desc: "L'identité de l'affilié sera marquée comme vérifiée et les retraits débloqués.", btn: "Approuver", btnCls: "bg-emerald-600 hover:bg-emerald-700" },
  reset:   { title: "Réinitialiser la vérification", desc: "La demande et les documents seront supprimés. L'affilié pourra renvoyer une nouvelle CIN.", btn: "Réinitialiser", btnCls: "bg-gray-800 hover:bg-black" },
  reject:  { title: "Refuser la vérification", desc: "Indiquez le motif du refus (visible par l'affilié). Il pourra renvoyer de nouvelles images.", btn: "Confirmer le refus", btnCls: "bg-red-600 hover:bg-red-700" },
};

export default function AdminIdentityPage() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState(null);
  const [filter, setFilter]   = useState("ALL");
  const [search, setSearch]   = useState("");
  const [preview, setPreview] = useState(null); // { id, side }
  const [confirm, setConfirm] = useState(null); // { id, action, row }
  const [reason, setReason]   = useState("");
  const [page, setPage]       = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/identity")
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // Reset to page 1 whenever the filter/search/page-size changes.
  useEffect(() => { setPage(1); }, [filter, search, pageSize]);

  const counts = useMemo(() => ({
    ALL: rows.length,
    PENDING: rows.filter((r) => r.status === "PENDING").length,
    APPROVED: rows.filter((r) => r.status === "APPROVED").length,
    REJECTED: rows.filter((r) => r.status === "REJECTED").length,
  }), [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter !== "ALL") list = list.filter((r) => r.status === filter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) =>
      r.affiliateName?.toLowerCase().includes(q) ||
      r.username?.toLowerCase().includes(q) ||
      r.phone?.includes(q) ||
      r.affiliateId?.toLowerCase().includes(q));
    // Default sort: newest submissions first (defensive — API already sorts).
    return [...list].sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
  }, [rows, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  const act = async (id, action, reasonText) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/identity", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, reason: reasonText }),
      });
      if (res.ok) { setConfirm(null); setReason(""); load(); } // immediate table refresh
    } finally { setBusyId(null); }
  };

  const openConfirm = (row, action) => { setConfirm({ id: row.id, action, row }); setReason(""); };

  return (
    <div className="py-6 max-w-6xl space-y-5">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-6 h-6 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vérification d'identité</h1>
          <p className="text-sm text-gray-500">{filtered.length} demande(s) · page {safePage}/{totalPages}</p>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total demandes" value={counts.ALL} color="#111827" />
        <StatCard label="En attente"     value={counts.PENDING} color="#b45309" />
        <StatCard label="Approuvées"     value={counts.APPROVED} color="#047857" />
        <StatCard label="Refusées"       value={counts.REJECTED} color="#b91c1c" />
      </div>

      {/* Filters + search + page size */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap gap-2 items-center">
        {["ALL", "PENDING", "APPROVED", "REJECTED"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${filter === s ? "bg-gray-900 text-white border-gray-900" : "bg-gray-50 text-gray-600 border-gray-200"}`}
          >
            {s === "ALL" ? "Toutes" : STATUS_STYLE[s].label} ({counts[s]})
          </button>
        ))}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ID, username, nom, téléphone…"
            className="w-full pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
          />
        </div>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:border-gray-400"
          title="Résultats par page"
        >
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-gray-400" /></div>
      ) : paged.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-gray-400 text-sm">Aucune demande</div>
      ) : (
        <div className="space-y-4">
          {paged.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">{r.affiliateName || "—"}</span>
                    <span className="text-sm text-gray-500">@{r.username}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1 break-words">
                    📞 {r.phone || "—"} · ID <span className="font-mono">{r.affiliateId?.slice(0, 8)}</span> · Soumis {fmtDate(r.submittedAt)}
                    {r.approvedAt && <> · Approuvé {fmtDate(r.approvedAt)}</>}
                  </p>
                  {r.status === "REJECTED" && r.rejectionReason && (
                    <p className="text-xs text-red-600 mt-1">Motif du refus : {r.rejectionReason}</p>
                  )}
                </div>
              </div>

              {/* CIN previews (streamed via admin-only route with the admin cookie) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                {["front", "back"].map((side) => (
                  <div key={side} className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 text-[11px] font-semibold text-gray-500 flex items-center justify-between">
                      <span>{side === "front" ? "CIN Recto" : "CIN Verso"}</span>
                      <button onClick={() => setPreview({ id: r.id, side })} className="text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" /> Agrandir
                      </button>
                    </div>
                    {(side === "front" ? r.hasFront : r.hasBack) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/admin/identity/${r.id}/${side}`}
                        alt={`CIN ${side}`}
                        className="w-full h-40 sm:h-44 object-contain bg-gray-100 cursor-zoom-in"
                        onClick={() => setPreview({ id: r.id, side })}
                      />
                    ) : (
                      <div className="w-full h-40 sm:h-44 flex items-center justify-center text-xs text-gray-400 bg-gray-50">Aucun fichier</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Actions — each opens a confirmation dialog */}
              <div className="mt-4 flex flex-wrap gap-2">
                {r.status !== "APPROVED" && (
                  <button disabled={busyId === r.id} onClick={() => openConfirm(r, "approve")}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                    <Check className="w-3.5 h-3.5" /> Approuver
                  </button>
                )}
                {r.status !== "REJECTED" && (
                  <button disabled={busyId === r.id} onClick={() => openConfirm(r, "reject")}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white text-red-600 border border-red-200 hover:bg-red-50">
                    <X className="w-3.5 h-3.5" /> Refuser
                  </button>
                )}
                <button disabled={busyId === r.id} onClick={() => openConfirm(r, "reset")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                  title="Réinitialiser — permet à l'affilié de renvoyer sa CIN">
                  <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-500">
            {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} sur {filtered.length}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border border-gray-200 bg-white disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Préc.
            </button>
            <span className="text-xs text-gray-600 px-2">{safePage} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border border-gray-200 bg-white disabled:opacity-40"
            >
              Suiv. <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Confirmation dialog (approve / reject / reset) */}
      {confirm && (() => {
        const meta = ACTION_META[confirm.action];
        const rejecting = confirm.action === "reject";
        const canSubmit = !rejecting || reason.trim().length > 0;
        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => busyId ? null : setConfirm(null)}>
            <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-gray-900">{meta.title}</h3>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                {meta.desc} {confirm.row?.username && <span className="font-semibold text-gray-700">(@{confirm.row.username})</span>}
              </p>
              {rejecting && (
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Motif du refus (obligatoire)…"
                  className="w-full text-sm border border-gray-200 rounded-lg p-2 h-24 mb-3 focus:outline-none focus:border-gray-400"
                  autoFocus
                />
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirm(null)} disabled={busyId === confirm.id}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200">
                  Annuler
                </button>
                <button
                  disabled={!canSubmit || busyId === confirm.id}
                  onClick={() => act(confirm.id, confirm.action, reason)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50 ${meta.btnCls}`}
                >
                  {busyId === confirm.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {meta.btn}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Lightbox — inspect a CIN without downloading */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setPreview(null)}>
            <X className="w-7 h-7" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/admin/identity/${preview.id}/${preview.side}`} alt="CIN" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
