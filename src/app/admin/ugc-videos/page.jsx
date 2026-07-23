"use client";

/**
 * /admin/ugc-videos — UGC review queue (Admin UI, increment 2 + refinements).
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin client over the approved admin API:
 *   GET   /api/admin/ugc-videos?status=&page=&pageSize=  → { items, total, page, pages }
 *   GET   /api/admin/ugc-videos/[id]                     → { submission + histories }
 *   PATCH /api/admin/ugc-videos/[id]  { action, reason?, internalNote? }
 *
 * Actions map 1:1 to the state machine's admin-permitted edges:
 *   approve (PENDING→APPROVED) · reject (PENDING→REJECTED, reason REQUIRED)
 *   start (APPROVED→RUNNING)   · pause (RUNNING→PAUSED) · resume (PAUSED→RUNNING)
 *
 * BULK ACTIONS ARE DELIBERATELY LIMITED TO **START** AND **PAUSE**.
 * Approve/reject are review decisions that require looking at each video (and a
 * per-video rejection reason), so they are intentionally NOT bulk-able — bulk
 * approving would let an unreviewed video start earning money.
 *
 * Affiliate/product names are joined CLIENT-SIDE from existing endpoints, so the
 * approved money-path service stays untouched. Auth is the admin HttpOnly cookie.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Film, Loader2, CheckCircle, XCircle, Play, Pause, Clock, Eye,
  Search, ChevronLeft, ChevronRight, AlertCircle, X, History, Lock,
  RefreshCw, Maximize2, Gauge, HardDrive, CalendarClock, Bell,
} from "lucide-react";

const PAGE_SIZE = 20;
const AUTO_REFRESH_MS = 60_000;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function fmtAgo(ts) {
  if (!ts) return "jamais";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return "à l'instant";
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  return `il y a ${Math.floor(m / 60)} h`;
}
function fmtBytes(b) {
  if (b == null || isNaN(Number(b))) return "—";
  const mb = Number(b) / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} Mo` : `${(Number(b) / 1024).toFixed(0)} Ko`;
}
function fmtDuration(sec) {
  if (sec == null || !isFinite(sec)) return "—";
  const s = Math.round(sec);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const STATUS = {
  PENDING:  { label: "En attente", cls: "bg-yellow-100 text-yellow-700", Icon: Clock },
  APPROVED: { label: "Approuvée",  cls: "bg-blue-100 text-blue-700",     Icon: CheckCircle },
  RUNNING:  { label: "En diffusion", cls: "bg-green-100 text-green-700", Icon: Play },
  PAUSED:   { label: "En pause",   cls: "bg-gray-200 text-gray-600",     Icon: Pause },
  REJECTED: { label: "Rejetée",    cls: "bg-red-100 text-red-700",       Icon: XCircle },
};
const FILTERS = ["all", "PENDING", "APPROVED", "RUNNING", "PAUSED", "REJECTED"];

function StatusBadge({ status }) {
  const cfg = STATUS[status] || { label: status, cls: "bg-gray-100 text-gray-600", Icon: Clock };
  const { Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

/** Which admin actions are legal from a given status (mirrors the state machine). */
function actionsFor(status) {
  switch (status) {
    case "PENDING":  return [{ key: "approve", label: "Approuver", cls: "bg-green-50 text-green-700 hover:bg-green-100", Icon: CheckCircle },
                             { key: "reject",  label: "Rejeter",   cls: "bg-red-50 text-red-700 hover:bg-red-100",       Icon: XCircle }];
    case "APPROVED": return [{ key: "start",   label: "Démarrer",  cls: "bg-green-50 text-green-700 hover:bg-green-100", Icon: Play }];
    case "RUNNING":  return [{ key: "pause",   label: "Pause",     cls: "bg-gray-100 text-gray-700 hover:bg-gray-200",   Icon: Pause }];
    case "PAUSED":   return [{ key: "resume",  label: "Reprendre", cls: "bg-green-50 text-green-700 hover:bg-green-100", Icon: Play }];
    default:         return [];
  }
}
const NEXT_STATUS = { approve: "APPROVED", reject: "REJECTED", start: "RUNNING", pause: "PAUSED", resume: "RUNNING" };

export default function AdminUgcVideosPage() {
  const [items, setItems]   = useState([]);
  const [total, setTotal]   = useState(0);
  const [pages, setPages]   = useState(1);
  const [page, setPage]     = useState(1);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(null);
  const [busyId, setBusyId]         = useState(null);
  const [notice, setNotice]         = useState(null);

  // Freshness (refinement #1)
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [autoRefresh, setAutoRefresh]     = useState(true);
  const [, setTick]                       = useState(0);   // re-render the relative time

  // Bulk selection (refinement #2 — start/pause only)
  const [selected, setSelected]     = useState(new Set());
  const [bulkBusy, setBulkBusy]     = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(null);  // 'start' | 'pause'
  const [bulkResult, setBulkResult]   = useState(null);  // { action, succeeded[], failed[] }

  const [products, setProducts]     = useState([]);
  const [affiliates, setAffiliates] = useState([]);

  // Event-driven "new submission awaiting review" feed
  const [unreadReview, setUnreadReview] = useState(0);

  // Reject dialog + detail drawer
  const [rejectFor, setRejectFor]       = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNote, setRejectNote]     = useState("");
  const [rejectErr, setRejectErr]       = useState(null);
  const [detail, setDetail]             = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Drawer media info (refinement #3)
  const videoRef = useRef(null);
  const [mediaInfo, setMediaInfo] = useState({ duration: null, size: null });
  const [speed, setSpeed] = useState(1);

  // ── Load list ───────────────────────────────────────────────────────────────
  const loadList = useCallback(async (opts = {}) => {
    const p = opts.page ?? page;
    const s = opts.status ?? status;
    if (opts.spinner) setRefreshing(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (s !== "all") params.set("status", s);
      const res = await fetch(`/api/admin/ugc-videos?${params.toString()}`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      setItems(Array.isArray(d.items) ? d.items : []);
      setTotal(d.total ?? 0);
      setPages(d.pages || 1);
      setLastRefreshed(Date.now());
      // Refresh the review-notification badge alongside the queue.
      try {
        const nRes = await fetch("/api/admin/ugc-notifications");
        if (nRes.ok) { const n = await nRes.json(); setUnreadReview(n.unread ?? 0); }
      } catch { /* badge is best-effort */ }
    } catch {
      setError("Impossible de charger les vidéos.");
    } finally {
      if (opts.spinner) setRefreshing(false);
    }
  }, [page, status]);

  // Initial: list + name maps
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [prodRes, affRes] = await Promise.allSettled([
        fetch("/api/products?status=all"),
        fetch("/api/admin/affiliates"),
      ]);
      if (prodRes.status === "fulfilled" && prodRes.value.ok) {
        const d = await prodRes.value.json().catch(() => []);
        setProducts(Array.isArray(d) ? d : []);
      }
      if (affRes.status === "fulfilled" && affRes.value.ok) {
        const d = await affRes.value.json().catch(() => []);
        setAffiliates(Array.isArray(d) ? d : []);
      }
      await loadList({ page: 1, status: "all" });
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (!loading) { setSelected(new Set()); loadList(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, status]);

  // Relative-time ticker + auto refresh
  useEffect(() => { const i = setInterval(() => setTick((t) => t + 1), 15_000); return () => clearInterval(i); }, []);
  useEffect(() => {
    if (!autoRefresh || loading) return;
    const i = setInterval(() => loadList(), AUTO_REFRESH_MS);
    return () => clearInterval(i);
  }, [autoRefresh, loading, loadList]);

  const productMap = {};
  for (const p of products) productMap[p.id] = { title: p.title, image: Array.isArray(p.images) ? p.images[0] : null };
  const affiliateMap = {};
  for (const a of affiliates) affiliateMap[a.id] = { name: a.name, username: a.username };

  const q = search.trim().toLowerCase();
  const displayed = !q ? items : items.filter((s) => {
    const p = productMap[s.productId], a = affiliateMap[s.affiliateId];
    return (p?.title || "").toLowerCase().includes(q)
        || (a?.username || "").toLowerCase().includes(q)
        || (a?.name || "").toLowerCase().includes(q);
  });

  // ── Selection helpers (bulk = start/pause only) ─────────────────────────────
  const toggleSelected = (id) => setSelected((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const selectedItems = displayed.filter((s) => selected.has(s.id));
  const startable = selectedItems.filter((s) => s.status === "APPROVED");
  const pausable  = selectedItems.filter((s) => s.status === "RUNNING");
  const bulkEligible = displayed.filter((s) => s.status === "APPROVED" || s.status === "RUNNING");
  const allEligibleSelected = bulkEligible.length > 0 && bulkEligible.every((s) => selected.has(s.id));

  // ── Single action (optimistic + background refresh) ─────────────────────────
  const runAction = async (sub, action, extra = {}) => {
    const snapshot = items;
    setBusyId(sub.id);
    setItems((prev) => prev.map((s) => (s.id === sub.id ? { ...s, status: NEXT_STATUS[action] } : s)));
    try {
      const res = await fetch(`/api/admin/ugc-videos/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setItems(snapshot);
        setError(body.error || "L'action a échoué.");
        return false;
      }
      if (body.submission) setItems((prev) => prev.map((s) => (s.id === sub.id ? body.submission : s)));
      return true;
    } catch {
      setItems(snapshot);
      setError("Erreur réseau.");
      return false;
    } finally {
      setBusyId(null);
      loadList();
    }
  };

  /**
   * Bulk start/pause: sequential, per-item isolated, then one authoritative
   * refresh. Confirmed beforehand and reported afterwards with per-item reasons.
   */
  const runBulk = async (action) => {
    const targets = action === "start" ? startable : pausable;
    if (targets.length === 0) return;
    setBulkConfirm(null);
    setBulkBusy(true);
    setBulkResult(null);
    setError(null);

    const succeeded = []; const failed = [];
    // Optimistic pass
    setItems((prev) => prev.map((s) => (targets.some((t) => t.id === s.id) ? { ...s, status: NEXT_STATUS[action] } : s)));

    for (const t of targets) {
      const label = productMap[t.productId]?.title || t.id;
      try {
        const res = await fetch(`/api/admin/ugc-videos/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (res.ok) {
          succeeded.push({ id: t.id, label });
        } else {
          const body = await res.json().catch(() => ({}));
          failed.push({ id: t.id, label, reason: body.error || `HTTP ${res.status}`, code: body.code || null });
        }
      } catch (e) {
        // One failure never aborts the batch.
        failed.push({ id: t.id, label, reason: String(e?.message || "erreur réseau"), code: null });
      }
    }

    setBulkBusy(false);
    setSelected(new Set());
    await loadList({ spinner: true });   // authoritative reconcile
    setBulkResult({ action, succeeded, failed });
  };

  const submitReject = async () => {
    setRejectErr(null);
    if (!rejectReason.trim()) return setRejectErr("Le motif est obligatoire.");
    const ok = await runAction(rejectFor, "reject", {
      reason: rejectReason.trim(),
      ...(rejectNote.trim() ? { internalNote: rejectNote.trim() } : {}),
    });
    if (ok) { setRejectFor(null); setRejectReason(""); setRejectNote(""); }
  };

  // ── Detail drawer ───────────────────────────────────────────────────────────
  const openDetail = async (id) => {
    setDetailLoading(true);
    setMediaInfo({ duration: null, size: null });
    setSpeed(1);
    setDetail({ loading: true });
    try {
      const res = await fetch(`/api/admin/ugc-videos/${id}`);
      const d = await res.json().catch(() => ({}));
      setDetail(res.ok ? d : null);
    } catch { setDetail(null); }
    finally { setDetailLoading(false); }
  };

  // File size via a HEAD request (Content-Length). Degrades to "—" if CORS blocks it.
  useEffect(() => {
    const url = detail?.submission?.videoUrl;
    if (!url) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(url, { method: "HEAD" });
        const len = r.headers.get("content-length");
        if (!cancelled && len) setMediaInfo((m) => ({ ...m, size: Number(len) }));
      } catch { /* size stays null */ }
    })();
    return () => { cancelled = true; };
  }, [detail?.submission?.videoUrl]);

  const applySpeed = (v) => {
    setSpeed(v);
    if (videoRef.current) videoRef.current.playbackRate = v;
  };
  const goFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    (el.requestFullscreen || el.webkitRequestFullscreen || el.webkitEnterFullscreen || (() => {})).call(el);
  };

  if (loading) {
    return <div className="flex justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="py-6 max-w-6xl space-y-5">
      {/* Header + freshness (refinement #1) */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vidéos UGC</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} soumission(s) · page {page}/{pages}</p>
        </div>
        <div className="flex items-center gap-3">
          {unreadReview > 0 && (
            <button
              onClick={async () => {
                setStatus("PENDING"); setPage(1);
                try { await fetch("/api/admin/ugc-notifications", { method: "PATCH" }); setUnreadReview(0); } catch { /* ignore */ }
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-100"
              title="Nouvelles vidéos en attente de révision">
              <Bell className="w-3.5 h-3.5" /> {unreadReview} à réviser
            </button>
          )}
          <span className="text-xs text-gray-400">Actualisé {fmtAgo(lastRefreshed)}</span>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto (1 min)
          </label>
          <button onClick={() => loadList({ spinner: true })} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-gray-200 rounded-xl hover:border-gray-400 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> Actualiser
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}
      {notice && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm text-green-700 flex items-center justify-between">
          <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {notice}</span>
          <button onClick={() => setNotice(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Produit, affilié..."
            className="w-full pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 bg-gray-50" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((s) => (
            <button key={s} onClick={() => { setStatus(s); setPage(1); }}
              className={`px-3 py-2 text-xs font-semibold rounded-xl transition-colors
                ${status === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {s === "all" ? "Toutes" : STATUS[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk bar — START / PAUSE only (never approve/reject) */}
      {bulkEligible.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer">
            <input type="checkbox" checked={allEligibleSelected}
              onChange={(e) => setSelected(e.target.checked ? new Set(bulkEligible.map((s) => s.id)) : new Set())} />
            Tout sélectionner ({bulkEligible.length} éligible(s))
          </label>
          <span className="text-xs text-gray-400">{selectedItems.length} sélectionnée(s)</span>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => setBulkConfirm("start")} disabled={bulkBusy || startable.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 rounded-xl disabled:opacity-40">
              {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Démarrer ({startable.length})
            </button>
            <button onClick={() => setBulkConfirm("pause")} disabled={bulkBusy || pausable.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl disabled:opacity-40">
              {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
              Pause ({pausable.length})
            </button>
          </div>
          <p className="w-full text-[11px] text-gray-400">
            L'approbation et le rejet restent volontairement individuels : chaque vidéo doit être visionnée et un motif est requis.
          </p>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <Film className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">Aucune vidéo</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {displayed.map((s) => {
              const prod = productMap[s.productId];
              const aff  = affiliateMap[s.affiliateId];
              const busy = busyId === s.id;
              const selectable = s.status === "APPROVED" || s.status === "RUNNING";
              return (
                <div key={s.id} className="p-4 flex flex-wrap items-center gap-3 hover:bg-gray-50 transition-colors">
                  <input type="checkbox" disabled={!selectable} checked={selected.has(s.id)}
                    onChange={() => toggleSelected(s.id)}
                    className="shrink-0 disabled:opacity-25"
                    title={selectable ? "Sélectionner pour une action groupée" : "Actions groupées réservées à Démarrer/Pause"} />

                  {prod?.image
                    ? <img src={prod.image} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    : <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"><Film className="w-5 h-5 text-gray-300" /></div>}

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{prod?.title || s.productId}</p>
                    <p className="text-xs text-gray-400">
                      {aff ? <>{aff.name || "—"} <span className="font-mono">@{aff.username}</span></> : s.affiliateId}
                      {" · "}{fmtDate(s.submittedAt || s.createdAt)}
                    </p>
                    {s.status === "REJECTED" && s.rejectionReason && (
                      <p className="text-xs text-red-600 mt-0.5 truncate">Motif : {s.rejectionReason}</p>
                    )}
                  </div>

                  <StatusBadge status={s.status} />

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {s.videoUrl && (
                      <a href={s.videoUrl} target="_blank" rel="noopener noreferrer"
                        className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg" title="Ouvrir la vidéo">
                        <Eye className="w-4 h-4" />
                      </a>
                    )}
                    <button onClick={() => openDetail(s.id)}
                      className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg" title="Détails & historique">
                      <History className="w-4 h-4" />
                    </button>
                    {actionsFor(s.status).map((a) => (
                      <button key={a.key}
                        onClick={() => (a.key === "reject"
                          ? (setRejectFor(s), setRejectReason(""), setRejectNote(""), setRejectErr(null))
                          : runAction(s, a.key))}
                        disabled={busy || bulkBusy}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 ${a.cls}`}>
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <a.Icon className="w-3.5 h-3.5" />}
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-2 text-xs font-semibold bg-white border border-gray-200 rounded-xl disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" /> Précédent
          </button>
          <span className="text-xs text-gray-500 px-2">{page} / {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}
            className="flex items-center gap-1 px-3 py-2 text-xs font-semibold bg-white border border-gray-200 rounded-xl disabled:opacity-40">
            Suivant <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Bulk confirmation ── */}
      {bulkConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setBulkConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              {bulkConfirm === "start" ? <Play className="w-5 h-5 text-green-600" /> : <Pause className="w-5 h-5 text-gray-600" />}
              <h3 className="text-base font-bold text-gray-900">
                {bulkConfirm === "start" ? "Démarrer la diffusion ?" : "Mettre en pause ?"}
              </h3>
            </div>
            <p className="text-sm text-gray-600">
              {bulkConfirm === "start"
                ? <>Vous allez démarrer <strong>{startable.length}</strong> vidéo(s). Une fois en diffusion, elles commencent à générer des gains pour leurs affiliés.</>
                : <>Vous allez mettre en pause <strong>{pausable.length}</strong> vidéo(s). Elles cesseront de générer des gains jusqu'à leur reprise.</>}
            </p>
            <p className="text-xs text-gray-400">
              Chaque vidéo est traitée individuellement : un échec n'interrompt pas les autres.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setBulkConfirm(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl">Annuler</button>
              <button onClick={() => runBulk(bulkConfirm)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-xl">
                {bulkConfirm === "start" ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk result summary (succeeded / failed / reasons) ── */}
      {bulkResult && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setBulkResult(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="text-sm font-bold text-gray-800">
                Résultat — {bulkResult.action === "start" ? "Démarrage" : "Mise en pause"}
              </h3>
              <button onClick={() => setBulkResult(null)} className="p-1 text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                  <p className="text-[10px] uppercase text-green-600 font-semibold">Réussies</p>
                  <p className="text-2xl font-bold text-green-700">{bulkResult.succeeded.length}</p>
                </div>
                <div className={`rounded-xl p-3 border ${bulkResult.failed.length ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"}`}>
                  <p className={`text-[10px] uppercase font-semibold ${bulkResult.failed.length ? "text-red-600" : "text-gray-400"}`}>Échouées</p>
                  <p className={`text-2xl font-bold ${bulkResult.failed.length ? "text-red-700" : "text-gray-400"}`}>{bulkResult.failed.length}</p>
                </div>
              </div>

              {bulkResult.failed.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-700 mb-2">Motifs des échecs</p>
                  <div className="space-y-2">
                    {bulkResult.failed.map((f) => (
                      <div key={f.id} className="bg-red-50 border border-red-100 rounded-xl p-3">
                        <p className="text-xs font-semibold text-red-800 break-words">{f.label}</p>
                        <p className="text-xs text-red-600 mt-0.5">{f.reason}{f.code ? ` (${f.code})` : ""}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bulkResult.succeeded.length > 0 && (
                <details>
                  <summary className="text-xs font-bold text-gray-700 cursor-pointer">Vidéos traitées ({bulkResult.succeeded.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {bulkResult.succeeded.map((s) => (
                      <li key={s.id} className="text-xs text-gray-600 flex items-center gap-1.5">
                        <CheckCircle className="w-3 h-3 text-green-500 shrink-0" /> <span className="break-words">{s.label}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="flex justify-end">
                <button onClick={() => setBulkResult(null)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-xl">Fermer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject dialog (reason required by the service) ── */}
      {rejectFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setRejectFor(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <h3 className="text-base font-bold text-gray-900">Rejeter la vidéo</h3>
            </div>
            <p className="text-xs text-gray-500">
              L'affilié verra le motif et pourra remplacer sa vidéo (ce qui la renverra en validation).
            </p>
            {rejectErr && <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-700">{rejectErr}</div>}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Motif du rejet <span className="text-red-500">*</span></label>
              <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Expliquez pourquoi la vidéo est refusée…"
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Note interne (jamais visible par l'affilié)
              </label>
              <textarea rows={2} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRejectFor(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl">Annuler</button>
              <button onClick={submitReject} disabled={busyId === rejectFor.id}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50">
                {busyId === rejectFor.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Rejeter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail + history drawer (refinement #3) ── */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-sm font-bold text-gray-800">Détails de la soumission</h3>
              <button onClick={() => setDetail(null)} className="p-1 text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
            </div>

            {detailLoading || detail.loading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : !detail.submission ? (
              <div className="p-6 text-sm text-gray-500">Impossible de charger les détails.</div>
            ) : (
              <div className="p-5 space-y-5">
                {detail.submission.videoUrl && (
                  <div className="space-y-2">
                    <video ref={videoRef} src={detail.submission.videoUrl} controls
                      onLoadedMetadata={(e) => {
                        // Read currentTarget SYNCHRONOUSLY — React nulls it before the
                        // (deferred) state updater runs, which caused the null.duration crash.
                        const d = e.currentTarget?.duration;
                        setMediaInfo((m) => ({ ...m, duration: Number.isFinite(d) ? d : null }));
                      }}
                      className="w-full max-h-72 bg-black rounded-xl object-contain" />
                    {/* Playback speed + fullscreen */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Gauge className="w-4 h-4 text-gray-400" />
                        <span className="text-xs text-gray-500">Vitesse</span>
                        <div className="flex gap-1">
                          {SPEEDS.map((v) => (
                            <button key={v} onClick={() => applySpeed(v)}
                              className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition-colors
                                ${speed === v ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                              {v}×
                            </button>
                          ))}
                        </div>
                      </div>
                      <button onClick={goFullscreen}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg ml-auto">
                        <Maximize2 className="w-3.5 h-3.5" /> Plein écran
                      </button>
                    </div>
                  </div>
                )}

                {/* Media facts */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { Icon: CalendarClock, label: "Envoyée le", value: fmtDate(detail.submission.submittedAt || detail.submission.createdAt) },
                    { Icon: Clock,         label: "Durée",      value: fmtDuration(mediaInfo.duration) },
                    { Icon: HardDrive,     label: "Taille",     value: fmtBytes(mediaInfo.size) },
                  ].map(({ Icon, label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-[10px] uppercase text-gray-400 font-semibold flex items-center gap-1"><Icon className="w-3 h-3" /> {label}</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Produit",   productMap[detail.submission.productId]?.title || detail.submission.productId],
                    ["Affilié",   affiliateMap[detail.submission.affiliateId]?.username ? `@${affiliateMap[detail.submission.affiliateId].username}` : detail.submission.affiliateId],
                    ["Statut",    STATUS[detail.submission.status]?.label || detail.submission.status],
                    ["Créée le",  fmtDate(detail.submission.createdAt)],
                    ["Consentement pub.", detail.submission.advertisingConsent ? "Oui" : "Non"],
                    ["Description", detail.submission.description || "—"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <p className="text-[10px] uppercase text-gray-400 font-semibold">{k}</p>
                      <p className="text-sm text-gray-800 break-words">{v}</p>
                    </div>
                  ))}
                </div>

                {detail.submission.rejectionReason && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                    <p className="text-[10px] uppercase text-red-500 font-semibold">Motif du rejet (visible par l'affilié)</p>
                    <p className="text-sm text-red-800">{detail.submission.rejectionReason}</p>
                  </div>
                )}
                {detail.submission.internalAdminNotes && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <p className="text-[10px] uppercase text-gray-500 font-semibold flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Note interne (admin uniquement)
                    </p>
                    <p className="text-sm text-gray-700">{detail.submission.internalAdminNotes}</p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Les notes internes sont attachées aux transitions de statut — elles ne se modifient pas séparément.
                    </p>
                  </div>
                )}

                {/* History */}
                <div>
                  <p className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5"><History className="w-4 h-4" /> Historique</p>
                  {!Array.isArray(detail.submission.histories) || detail.submission.histories.length === 0 ? (
                    <p className="text-xs text-gray-400">Aucun historique.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.submission.histories.map((h) => (
                        <div key={h.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                          <div className="w-2 h-2 rounded-full bg-gray-400 mt-1.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-700">
                              {h.action} · {h.oldStatus || "—"} → {h.newStatus}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {h.actorType}{h.actorId ? ` (${String(h.actorId).slice(0, 8)}…)` : ""} · {fmtDate(h.createdAt)}
                            </p>
                            {h.reason && <p className="text-xs text-gray-600 mt-0.5">Motif : {h.reason}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
