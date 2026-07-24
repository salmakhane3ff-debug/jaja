"use client";

/**
 * src/app/affiliate/dashboard/UgcTab.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Affiliate UGC tab — premium mobile-first, VIDEO-FIRST layout.
 *
 * ⚠️ PRESENTATION ONLY. No API, route, service, permission, schema or business
 * logic change. Every handler, endpoint and payload below behaves exactly as
 * before; only layout, spacing, typography, colour and hierarchy changed.
 *
 * HIERARCHY (deliberate): Header → Global stats → VIDEO CARDS → floating "+".
 * Helper content ("Comment ça marche", instructions, estimate) is collapsed at
 * the very bottom so the video list is unmistakably the primary content.
 *
 * ── NO EMPTY ANALYTICS ───────────────────────────────────────────────────────
 * GET /api/affiliate/ugc → stats = { todayEarnings, totalEarnings, todaySales,
 * totalSales } (affiliate-wide); submissions carry NO earnings data.
 * Anything the API cannot supply is simply NOT RENDERED — no placeholder text,
 * no mock numbers, no client-side estimates. Currently omitted for that reason:
 *   ✗ 7-day earnings   ✗ per-video orders/earnings   ✗ performance trend %
 * All four stat cards below are real API values.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import {
  Video, Upload, Loader2, CheckCircle, AlertCircle, Play, Pause,
  DollarSign, TrendingUp, Info, Film, Wallet, Sparkles,
  AlertTriangle, ChevronLeft, ChevronRight, X, ExternalLink, ShoppingBag, Plus,
  ArrowUpRight, ArrowDownRight, ArrowRight, Flame, TrendingDown, Minus,
  Volume2, VolumeX,
} from "lucide-react";

// ── Helpers (unchanged) ────────────────────────────────────────────────────────
function authHeaders() {
  const t = (typeof localStorage !== "undefined" && localStorage.getItem("affiliateToken")) || "";
  return { Authorization: `Bearer ${t}` };
}
const jsonHeaders = () => ({ "Content-Type": "application/json", ...authHeaders() });

function fmtMAD(n) {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtBytes(b) {
  if (!b) return "—";
  const mb = b / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} Mo` : `${(b / 1024).toFixed(0)} Ko`;
}
function fmtDuration(sec) {
  if (sec == null || !isFinite(sec)) return null;
  const s = Math.round(sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** In-browser preview metadata for the upload wizard (unchanged). */
function extractVideoPreview(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    const done = (extra) => resolve({ url, duration: video.duration || null, width: video.videoWidth || 0, height: video.videoHeight || 0, thumbnail: null, ...extra });
    video.onloadedmetadata = () => {
      const seekTo = Math.min(0.5, (video.duration || 0) / 3 || 0);
      try { video.currentTime = seekTo; } catch { done(); }
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        done({ thumbnail: canvas.toDataURL("image/jpeg", 0.6) });
      } catch { done(); }
    };
    video.onerror = () => resolve({ url, duration: null, width: 0, height: 0, thumbnail: null });
  });
}

// ── Single status badge (the ONLY status indicator on a card) ──────────────────
const STATUS = {
  PENDING:  { label: "En attente",   dot: "bg-amber-500",   cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-100" },
  APPROVED: { label: "Approuvée",    dot: "bg-violet-500",  cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-100" },
  RUNNING:  { label: "En diffusion", dot: "bg-emerald-500", cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  PAUSED:   { label: "En pause",     dot: "bg-orange-400",  cls: "bg-orange-50 text-orange-700 ring-1 ring-orange-100" },
  REJECTED: { label: "Rejetée",      dot: "bg-rose-500",    cls: "bg-rose-50 text-rose-700 ring-1 ring-rose-100" },
};
function StatusBadge({ status }) {
  const cfg = STATUS[status] || { label: status, dot: "bg-gray-400", cls: "bg-gray-50 text-gray-600 ring-1 ring-gray-100" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold ${cfg.cls}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Day-over-day earnings trend (stock/forex style: ↗ green / ↘ red / → gray) ──
// Reads ONLY backend-computed fields — never recalculates on the frontend.
function TrendPill({ vs }) {
  const pct = vs?.earningsTrendPercent;
  let Icon, cls, label;
  if (pct === null) {                     // yesterday 0 & today > 0 → brand-new earner
    Icon = ArrowUpRight; cls = "bg-emerald-50 text-emerald-700"; label = "Nouveau";
  } else {
    const p = Number.isFinite(pct) ? pct : 0;
    if (p > 0)      { Icon = ArrowUpRight;   cls = "bg-emerald-50 text-emerald-700"; label = `+${p}%`; }
    else if (p < 0) { Icon = ArrowDownRight; cls = "bg-rose-50 text-rose-700";       label = `${p}%`; }
    else            { Icon = ArrowRight;     cls = "bg-gray-100 text-gray-500";       label = "0%"; }
  }
  return (
    <span title="vs hier" className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-bold ${cls}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}

// ── 7-day earnings sparkline — pure SVG, no chart library ──────────────────────
function Sparkline({ data }) {
  const vals = (Array.isArray(data) ? data : []).map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0));
  if (vals.length < 2) return null;
  const w = 84, h = 20, pad = 2;
  const max = Math.max(...vals), min = Math.min(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => [
    pad + (i / (vals.length - 1)) * (w - 2 * pad),
    h - pad - ((v - min) / range) * (h - 2 * pad),
  ]);
  const first = vals[0], last = vals[vals.length - 1];
  const rel = first !== 0 ? (last - first) / Math.abs(first) : (last !== 0 ? 1 : 0);
  const color = Math.abs(rel) < 0.02 ? "#9ca3af" : rel > 0 ? "#10b981" : "#ef4444"; // gray / green / red
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="7 derniers jours" className="shrink-0">
      <title>7 derniers jours</title>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="1.8" fill={color} />
    </svg>
  );
}

// ── Performance badge (HOT / Stable / Cooling) — backend-computed status ───────
const PERF = {
  HOT:     { label: "HOT",     cls: "bg-emerald-100 text-emerald-700", Icon: Flame },
  Stable:  { label: "Stable",  cls: "bg-slate-100 text-slate-600",     Icon: Minus },
  Cooling: { label: "Cooling", cls: "bg-orange-100 text-orange-700",   Icon: TrendingDown },
};
function PerfBadge({ status }) {
  const cfg = PERF[status] || PERF.Stable;
  const { Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${cfg.cls}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

// Rank medal / number (from backend `rank`).
function rankLabel(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return rank > 0 ? `#${rank}` : "";
}

// ── One-sentence automatic insight for the best performer (pure) ───────────────
function isConsistentlyGrowing(arr) {
  if (!Array.isArray(arr) || arr.length < 3) return false;
  let ups = 0, downs = 0;
  for (let i = 1; i < arr.length; i++) {
    const d = Number(arr[i]) - Number(arr[i - 1]);
    if (d > 0) ups++; else if (d < 0) downs++;
  }
  return ups > downs && Number(arr[arr.length - 1]) > Number(arr[0]);
}
function buildInsight(vs, shareOfToday) {
  if (!vs) return null;
  if (shareOfToday >= 0.5) return `🔥 Cette vidéo génère ${Math.round(shareOfToday * 100)}% des gains d'aujourd'hui.`;
  if (vs.performanceStatus === "Cooling") return "⚠️ Cette vidéo est en perte de vitesse.";
  if (vs.earningsTrendPercent === null) return "📈 Nouvelle vidéo qui commence à générer des gains.";
  if (Number(vs.earningsTrendPercent) > 0) return `📈 Gains en hausse de ${vs.earningsTrendPercent}% vs hier.`;
  if (isConsistentlyGrowing(vs.last7DaysEarnings)) return "🎯 Cette vidéo est en croissance constante.";
  return "🎯 Performance stable aujourd'hui.";
}

// ── Vertical video preview — playable, never downloadable ──────────────────────
function VideoThumb({ videoUrl, onPlay }) {
  const [duration, setDuration] = useState(null);
  return (
    <button
      type="button"
      onClick={onPlay}
      className="relative w-[124px] sm:w-[150px] shrink-0 aspect-[9/16] rounded-[22px] overflow-hidden bg-gray-900 group focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
      aria-label="Lire la vidéo"
    >
      {videoUrl ? (
        // First frame as poster; `preload="metadata"` also gives the real duration.
        <video
          src={videoUrl}
          preload="metadata"
          muted
          playsInline
          tabIndex={-1}
          onLoadedMetadata={(e) => { const d = e.currentTarget?.duration; setDuration(Number.isFinite(d) ? d : null); }}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center"><Film className="w-6 h-6 text-gray-600" /></div>
      )}
      <span className="absolute inset-0 bg-black/25 group-hover:bg-black/35 transition-colors" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="w-14 h-14 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/25 group-active:scale-95 transition-transform">
          <Play className="w-6 h-6 text-white fill-white translate-x-[1px]" />
        </span>
      </span>
      {fmtDuration(duration) && (
        <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-black/70 text-white text-[11px] font-semibold tabular-nums">
          {fmtDuration(duration)}
        </span>
      )}
    </button>
  );
}

// ── Modal player (no download, no navigation to the raw file) ──────────────────
function VideoModal({ url, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose}
          className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center">
          <X className="w-5 h-5" />
        </button>
        <video src={url} controls autoPlay playsInline controlsList="nodownload"
          className="w-full max-h-[80vh] rounded-[28px] bg-black object-contain" />
      </div>
    </div>
  );
}

// ── Compact stat tile (all values are real API data) ───────────────────────────
function StatCard({ icon: Icon, tint, label, value, unit }) {
  return (
    <div className="bg-white rounded-[24px] p-4 shadow-[0_2px_14px_rgba(16,24,40,0.05)] ring-1 ring-gray-100">
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${tint}`}>
        <Icon className="w-[19px] h-[19px]" />
      </div>
      <p className="text-[12.5px] text-gray-500 mt-3 font-medium leading-tight">{label}</p>
      <p className="mt-1 text-[21px] font-extrabold text-gray-900 leading-none tabular-nums">
        {value}{unit && <span className="text-[11px] font-bold text-gray-400 ml-1">{unit}</span>}
      </p>
    </div>
  );
}

const WIZARD = ["Produit", "Vidéo", "Aperçu", "Envoi"];
const inputCls = "w-full px-4 py-3.5 text-sm border border-gray-200 rounded-2xl bg-gray-50 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition";

// ── Main tab ────────────────────────────────────────────────────────────────────
export default function UgcTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const [settings, setSettings]       = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [stats, setStats]             = useState(null);
  const [videoStats, setVideoStats]   = useState({});   // per-video, keyed by ugcVideoId (from API)
  const [products, setProducts]       = useState([]);

  // Wizard (unchanged logic)
  const [step, setStep]           = useState(1);
  const [form, setForm]           = useState({ productId: "", description: "", consent: false });
  const [file, setFile]           = useState(null);
  const [videoMeta, setVideoMeta] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState(null);

  // Row actions (unchanged logic)
  const [rowBusy, setRowBusy]     = useState(null);
  const replaceInputRef = useRef(null);
  const [replaceTarget, setReplaceTarget]       = useState(null);
  const [confirmReplaceId, setConfirmReplaceId] = useState(null);

  // Presentation-only state
  const [playingUrl, setPlayingUrl] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [helpOpen, setHelpOpen]     = useState(false);

  // ── Live / money-sound state ────────────────────────────────────────────────
  const [muted, setMuted] = useState(true);            // resolved from localStorage on mount
  const lastEarningIdRef  = useRef(null);              // never replay a seen earning
  const lastTodaySalesRef = useRef(null);
  const liveSeededRef     = useRef(false);             // first poll seeds, never plays
  const audioCtxRef       = useRef(null);
  const mutedRef          = useRef(true);

  useEffect(() => {
    try { setMuted(localStorage.getItem("ugcMuted") !== "false"); } catch { /* default muted */ }
  }, []);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      try { localStorage.setItem("ugcMuted", String(next)); } catch { /* ignore */ }
      // Unmuting is a user gesture — a good moment to unlock the audio context.
      if (!next) { try { audioCtxRef.current?.resume?.(); } catch { /* ignore */ } }
      return next;
    });
  };

  /** Short synthesized coin chime (no asset, no library). Capped queue. */
  const playCoins = useCallback((count = 1) => {
    if (mutedRef.current) return;
    const n = Math.min(3, Math.max(1, count));         // capped queue — never a burst
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtxRef.current = audioCtxRef.current || new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      for (let i = 0; i < n; i++) {
        const base = ctx.currentTime + i * 0.16;
        for (const [freq, at] of [[988, 0], [1319, 0.07]]) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, base + at);
          gain.gain.exponentialRampToValueAtTime(0.18, base + at + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, base + at + 0.16);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(base + at); osc.stop(base + at + 0.18);
        }
      }
    } catch { /* audio is best-effort — never break the dashboard */ }
  }, []);

  const urlRef = useRef(null);
  useEffect(() => { urlRef.current = videoMeta?.url || null; }, [videoMeta]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  // ── Initial load (unchanged endpoints) ───────────────────────────────────────
  const load = useCallback(async () => {
    setError(null);
    try {
      const [sRes, listRes, prodRes] = await Promise.all([
        fetch("/api/affiliate/ugc/settings", { headers: authHeaders(), cache: "no-store" }),
        // Stats must always reflect the latest DB state (hourly engine writes).
        fetch("/api/affiliate/ugc",          { headers: authHeaders(), cache: "no-store" }),
        fetch("/api/products?status=Active"),   // catalogue — keep its cacheable response
      ]);
      const sData    = sRes.ok ? await sRes.json() : null;
      const listData = listRes.ok ? await listRes.json() : { submissions: [], stats: null };
      const prodData = prodRes.ok ? await prodRes.json() : [];
      setSettings(sData);
      setSubmissions(Array.isArray(listData.submissions) ? listData.submissions : []);
      setStats(listData.stats || null);
      setVideoStats(listData.videoStats && typeof listData.videoStats === "object" ? listData.videoStats : {});
      setProducts(Array.isArray(prodData) ? prodData : []);
    } catch {
      setError("Impossible de charger l'espace vidéos. Réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/affiliate/ugc", { headers: authHeaders(), cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setSubmissions(Array.isArray(d.submissions) ? d.submissions : []);
        setStats(d.stats || null);
        setVideoStats(d.videoStats && typeof d.videoStats === "object" ? d.videoStats : {});
      }
    } catch { /* keep optimistic state */ }
  }, []);

  /**
   * LIVE: poll the cheap /live endpoint (~4s) ONLY while the tab is visible.
   * A change in `lastEarningId` means the engine emitted new simulated sale(s) →
   * play the money sound once per new earning (capped queue) and pull the full
   * stats. The very first poll only SEEDS the ids (never plays on initial load),
   * and an already-seen id is never replayed.
   */
  useEffect(() => {
    let stopped = false;

    const pollLive = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/affiliate/ugc/live", { headers: authHeaders(), cache: "no-store" });
        if (!res.ok || stopped) return;
        const d = await res.json();
        const seenId = lastEarningIdRef.current;
        const newCount = Number(d.todaySales) || 0;

        if (!liveSeededRef.current) {                 // first poll → seed only
          liveSeededRef.current = true;
          lastEarningIdRef.current = d.lastEarningId ?? null;
          lastTodaySalesRef.current = newCount;
          return;
        }
        if (d.lastEarningId && d.lastEarningId !== seenId) {
          const delta = Math.max(1, newCount - (lastTodaySalesRef.current ?? newCount));
          lastEarningIdRef.current = d.lastEarningId;  // never replay this earning
          lastTodaySalesRef.current = newCount;
          playCoins(delta);                            // capped inside
          refreshList();                               // full stats/trends/rank/sparkline
        }
      } catch { /* transient — next poll retries */ }
    };

    const onVisible = () => { if (document.visibilityState === "visible") { refreshList(); pollLive(); } };
    const onFocus = () => { refreshList(); pollLive(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    pollLive();
    const id = setInterval(pollLive, 4000);
    return () => {
      stopped = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshList, muted]);

  const patchLocal = (id, patch) => setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const productMap = {};
  for (const p of products) productMap[p.id] = { title: p.title, image: Array.isArray(p.images) ? p.images[0] : null };
  const submittedIds = new Set(submissions.map((s) => s.productId));
  const availableProducts = products.filter((p) => !submittedIds.has(p.id));
  const maxBytes = settings?.maxUploadBytes || 0;

  // ── File selection (unchanged) ───────────────────────────────────────────────
  const onFileSelected = (f) => {
    setSubmitMsg(null);
    if (videoMeta?.url) URL.revokeObjectURL(videoMeta.url);
    setVideoMeta(null);
    setFile(f || null);
    if (f && f.type?.startsWith("video/")) {
      setVideoMeta({ loading: true });
      extractVideoPreview(f).then(setVideoMeta);
    }
  };
  const resetForm = () => {
    if (videoMeta?.url) URL.revokeObjectURL(videoMeta.url);
    setForm({ productId: "", description: "", consent: false });
    setFile(null); setVideoMeta(null); setStep(1);
  };
  const openWizard = () => { setSubmitMsg(null); setWizardOpen(true); };

  const fileTypeOk = file?.type?.startsWith("video/");
  const sizeOk     = !maxBytes || !file || file.size <= maxBytes;
  const durationSec = videoMeta && !videoMeta.loading ? videoMeta.duration : null;
  const durationOk = !durationSec || !settings?.minVideoSeconds
    ? true
    : durationSec >= settings.minVideoSeconds && durationSec <= settings.maxVideoSeconds;
  const canProceedStep2 = !!file && fileTypeOk && sizeOk;

  // ── Create (unchanged: same endpoint, payload, optimistic update) ────────────
  const handleCreate = async () => {
    setSubmitMsg(null);
    if (!form.productId) { setStep(1); return setSubmitMsg({ type: "error", text: "Choisissez un produit." }); }
    if (!file)           { setStep(2); return setSubmitMsg({ type: "error", text: "Sélectionnez une vidéo." }); }
    if (!fileTypeOk)     { setStep(2); return setSubmitMsg({ type: "error", text: "Le fichier doit être une vidéo." }); }
    if (!sizeOk)         { setStep(2); return setSubmitMsg({ type: "error", text: `La vidéo dépasse la taille maximale (${fmtBytes(maxBytes)}).` }); }
    if (!form.consent)   return setSubmitMsg({ type: "error", text: "Vous devez accepter le consentement publicitaire." });

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("video", file);
      fd.append("productId", form.productId);
      if (form.description) fd.append("description", form.description);
      fd.append("advertisingConsent", "true");
      const res = await fetch("/api/affiliate/ugc", { method: "POST", headers: authHeaders(), body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitMsg({ type: "error", text: body.error || "Échec de l'envoi de la vidéo." });
      } else {
        if (body.submission) setSubmissions((prev) => [body.submission, ...prev]);
        setSubmitMsg({ type: "success", text: "Vidéo envoyée ! Elle sera examinée par notre équipe." });
        resetForm();
        setWizardOpen(false);
        refreshList();
      }
    } catch {
      setSubmitMsg({ type: "error", text: "Erreur réseau. Réessayez." });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Pause / resume (unchanged) ───────────────────────────────────────────────
  const handlePauseResume = async (id, action) => {
    const target = action === "pause" ? "PAUSED" : "RUNNING";
    const snapshot = submissions;
    setRowBusy(id);
    patchLocal(id, { status: target });
    try {
      const res = await fetch(`/api/affiliate/ugc/${id}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify({ action }) });
      if (!res.ok) setSubmissions(snapshot);
    } catch {
      setSubmissions(snapshot);
    } finally {
      setRowBusy(null);
      refreshList();
    }
  };

  // ── Replace (unchanged) ──────────────────────────────────────────────────────
  const triggerReplace = (id) => { setReplaceTarget(id); replaceInputRef.current?.click(); };
  const handleReplaceFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    const id = replaceTarget;
    setReplaceTarget(null);
    if (!f || !id) return;
    if (!f.type?.startsWith("video/")) return;
    if (maxBytes && f.size > maxBytes) return;
    setRowBusy(id);
    try {
      const fd = new FormData();
      fd.append("video", f);
      const res = await fetch(`/api/affiliate/ugc/${id}`, { method: "PATCH", headers: authHeaders(), body: fd });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.submission) patchLocal(id, body.submission);
      else if (res.ok) patchLocal(id, { status: "PENDING" });
    } finally {
      setRowBusy(null);
      refreshList();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-violet-500" /></div>;
  }
  if (error) {
    return (
      <div className="bg-white rounded-[28px] ring-1 ring-gray-100 p-8 text-center space-y-3 shadow-sm">
        <AlertCircle className="w-9 h-9 text-rose-400 mx-auto" />
        <p className="text-gray-700 text-sm">{error}</p>
        <button onClick={load} className="px-6 py-3 bg-violet-600 text-white rounded-2xl text-sm font-semibold">Réessayer</button>
      </div>
    );
  }
  if (!settings?.enabled) {
    return (
      <div className="bg-white rounded-[28px] ring-1 ring-gray-100 p-10 text-center space-y-2 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto"><Film className="w-6 h-6 text-violet-400" /></div>
        <p className="text-gray-800 text-sm font-bold pt-1">Le programme vidéo n'est pas encore disponible.</p>
        <p className="text-gray-400 text-xs">Revenez bientôt pour gagner des commissions avec vos vidéos.</p>
      </div>
    );
  }

  const est = settings.estimate;
  const activeNode = submitting ? 4 : step;
  const hasVideos = submissions.length > 0;

  // Best Performer Today = the submission ranked #1 by the API, shown only when it
  // actually earned today. Its insight uses the video's share of today's earnings.
  const totalTodayAll = Object.values(videoStats).reduce((sum, v) => sum + (Number(v.todayEarnings) || 0), 0);
  const bestSub = submissions.find((s) => videoStats[s.id]?.rank === 1);
  const bestVs = bestSub ? videoStats[bestSub.id] : null;
  const showBest = bestVs && Number(bestVs.todayEarnings) > 0;
  const bestProd = bestSub ? productMap[bestSub.productId] : null;
  const bestTitle = bestSub ? (bestSub.description?.trim() || bestProd?.title || "Ma vidéo") : "";
  const bestInsight = showBest ? buildInsight(bestVs, totalTodayAll > 0 ? Number(bestVs.todayEarnings) / totalTodayAll : 0) : null;

  return (
    <div className={`space-y-5 ${hasVideos ? "pb-24" : "pb-4"}`}>
      <input ref={replaceInputRef} type="file" accept="video/*" className="hidden" onChange={handleReplaceFile} />
      <VideoModal url={playingUrl} onClose={() => setPlayingUrl(null)} />

      {/* ── 1. Header + LIVE indicator ── */}
      <div className="px-0.5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[27px] font-extrabold text-gray-900 tracking-tight leading-tight">Mes vidéos</h1>
          <p className="text-[13.5px] text-gray-500 mt-1">Suivez la performance de vos vidéos</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 pt-1">
          <span title="Mise à jour en direct"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold ring-1 ring-emerald-100">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
          <button onClick={toggleMute} title={muted ? "Activer le son" : "Couper le son"}
            aria-label={muted ? "Activer le son" : "Couper le son"}
            className="w-8 h-8 rounded-full bg-white ring-1 ring-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition">
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── 2. Global statistics — every value is real API data ── */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Wallet}      tint="bg-violet-50 text-violet-600"   label="Gains aujourd'hui"      value={fmtMAD(stats?.todayEarnings)} unit="MAD" />
        <StatCard icon={ShoppingBag} tint="bg-sky-50 text-sky-600"         label="Commandes aujourd'hui"  value={stats?.todaySales ?? 0} />
        <StatCard icon={DollarSign}  tint="bg-amber-50 text-amber-600"     label="Gains (total)"          value={fmtMAD(stats?.totalEarnings)} unit="MAD" />
        <StatCard icon={TrendingUp}  tint="bg-emerald-50 text-emerald-600" label="Ventes (total)"         value={stats?.totalSales ?? 0} />
      </div>

      {/* ── Submit feedback ── */}
      {submitMsg && (
        <div className={`flex items-start gap-2.5 rounded-2xl px-4 py-3.5 text-sm font-medium ring-1 ${
          submitMsg.type === "success" ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                                       : "bg-rose-50 text-rose-700 ring-rose-100"}`}>
          {submitMsg.type === "success" ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span className="flex-1">{submitMsg.text}</span>
          <button onClick={() => setSubmitMsg(null)}><X className="w-4 h-4 opacity-60" /></button>
        </div>
      )}

      {/* ── Best Performer Today (below summary cards, above the list) ── */}
      {showBest && (
        <div className="rounded-[28px] p-4 text-white shadow-lg shadow-violet-200/40"
          style={{ background: "linear-gradient(135deg,#7c3aed 0%,#5b21b6 55%,#4c1d95 100%)" }}>
          <p className="text-[13px] font-extrabold flex items-center gap-1.5">
            <Flame className="w-4 h-4" /> Best Performer Today
          </p>
          <div className="mt-3 flex gap-3">
            <button
              onClick={() => bestSub.videoUrl && setPlayingUrl(bestSub.videoUrl)}
              className="relative w-14 aspect-[9/16] rounded-2xl overflow-hidden bg-black/30 shrink-0 focus:outline-none focus:ring-2 focus:ring-white/60"
              aria-label="Lire la vidéo">
              {bestSub.videoUrl
                ? <video src={bestSub.videoUrl} preload="metadata" muted playsInline tabIndex={-1} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
                : <span className="absolute inset-0 flex items-center justify-center"><Film className="w-5 h-5 text-white/60" /></span>}
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center ring-1 ring-white/25"><Play className="w-3.5 h-3.5 text-white fill-white translate-x-[1px]" /></span>
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold truncate">{bestTitle}</p>
              <p className="mt-0.5 text-[22px] font-extrabold leading-none tabular-nums">
                {fmtMAD(bestVs.todayEarnings)} <span className="text-[12px] font-bold opacity-70">MAD</span>
              </p>
              <p className="text-[12px] opacity-80 mt-0.5">{bestVs.todaySales} ventes aujourd'hui</p>
              <div className="mt-2 flex items-center gap-2">
                <TrendPill vs={bestVs} />
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 text-[11px] font-bold">
                  {rankLabel(bestVs.rank)} #{bestVs.rank}
                </span>
              </div>
            </div>
          </div>
          {bestInsight && (
            <p className="mt-3 text-[12.5px] bg-white/15 rounded-2xl px-3.5 py-2.5 leading-relaxed">{bestInsight}</p>
          )}
        </div>
      )}

      {/* ── 3. Video cards — the hero of the page ── */}
      {!hasVideos ? (
        // Zero videos → one beautiful onboarding card.
        <button onClick={openWizard}
          className="w-full text-left bg-white rounded-[28px] ring-1 ring-gray-100 shadow-[0_4px_24px_rgba(16,24,40,0.06)] p-7 active:scale-[0.99] transition">
          <div className="w-16 h-16 rounded-[22px] bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-lg shadow-violet-200">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-[19px] font-extrabold text-gray-900 mt-5 leading-snug">
            Publiez votre première vidéo
          </h2>
          <p className="text-[13.5px] text-gray-500 mt-2 leading-relaxed">
            Associez un produit, envoyez votre vidéo, et gagnez{" "}
            <strong className="text-gray-700">{fmtMAD(settings.commissionPerSale)} MAD</strong> par vente générée
            une fois qu'elle est en diffusion.
          </p>
          <span className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-violet-600 text-white text-sm font-bold">
            <Plus className="w-4 h-4" /> Ajouter une vidéo
          </span>
        </button>
      ) : (
        <div className="space-y-3.5">
          {submissions.map((s) => {
            const prod = productMap[s.productId];
            const busy = rowBusy === s.id;
            const canReplace = s.status === "REJECTED" || s.status === "PENDING";
            const title = s.description?.trim() || prod?.title || "Ma vidéo";
            // Per-video stats come from the API (grouped by ugcVideoId). A video
            // with no earnings has no map entry → real zeros, not fabricated values.
            const vs = videoStats[s.id] || {
              todayEarnings: 0, todaySales: 0, yesterdayEarnings: 0, yesterdaySales: 0,
              totalEarnings: 0, totalSales: 0, earningsTrendPercent: 0, salesDifference: 0,
              last7DaysEarnings: [0, 0, 0, 0, 0, 0, 0], rank: 0, performanceStatus: "Stable",
            };
            const salesDiff = vs.salesDifference || 0;
            const hasStats = !!videoStats[s.id];                          // video has earned at least once
            const spark = Array.isArray(vs.last7DaysEarnings) ? vs.last7DaysEarnings : [];
            const hasSpark = hasStats && spark.some((v) => Number(v) > 0);
            const medal = hasStats ? rankLabel(vs.rank) : "";
            return (
              <div key={s.id} className="bg-white rounded-[28px] ring-1 ring-gray-100 shadow-[0_2px_16px_rgba(16,24,40,0.05)] p-4">
                <div className="flex gap-4">
                  <VideoThumb videoUrl={s.videoUrl} onPlay={() => s.videoUrl && setPlayingUrl(s.videoUrl)} />

                  <div className="min-w-0 flex-1 flex flex-col">
                    <h3 className="text-[16px] font-bold text-gray-900 leading-snug line-clamp-2">
                      {medal && <span className="mr-1">{medal}</span>}{title}
                    </h3>

                    {/* Status + performance badge (badge sits above the trend below) */}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <StatusBadge status={s.status} />
                      {hasStats && <PerfBadge status={vs.performanceStatus} />}
                    </div>

                    {/* Product */}
                    <a href={`/products/${s.productId}`} target="_blank" rel="noopener noreferrer"
                      className="mt-auto pt-3 flex items-center gap-2.5 rounded-2xl bg-gray-50 ring-1 ring-gray-100 p-2.5 hover:bg-gray-100/70 transition">
                      {prod?.image
                        ? <img src={prod.image} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                        : <div className="w-10 h-10 rounded-xl bg-white ring-1 ring-gray-100 flex items-center justify-center shrink-0"><ShoppingBag className="w-4 h-4 text-gray-300" /></div>}
                      <span className="text-[12.5px] font-semibold text-gray-700 truncate flex-1">{prod?.title || "Produit"}</span>
                      <ExternalLink className="w-4 h-4 text-violet-500 shrink-0" />
                    </a>
                  </div>
                </div>

                {/* Per-video stats (grouped by ugcVideoId, from the API) */}
                <div className="mt-3 rounded-2xl bg-gray-50 ring-1 ring-gray-100 divide-y divide-gray-100">
                  {hasSpark && (
                    <div className="flex items-center justify-between gap-2 px-3.5 py-2">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">7 derniers jours</span>
                      <Sparkline data={spark} />
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Aujourd'hui</span>
                      {/* Trend: today vs hier — arrow direction driven by earnings */}
                      <TrendPill vs={vs} />
                    </span>
                    <span className="text-[13px] font-bold text-gray-900 tabular-nums text-right">
                      {fmtMAD(vs.todayEarnings)} <span className="text-[11px] text-gray-400">MAD</span>
                      <span className="text-gray-300 font-normal"> · </span>
                      <span className="text-gray-500 font-semibold">{vs.todaySales}</span> <span className="text-[11px] text-gray-400 font-medium">ventes</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3.5 py-2.5">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Total</span>
                    <span className="text-[13px] font-bold text-gray-900 tabular-nums">
                      {fmtMAD(vs.totalEarnings)} <span className="text-[11px] text-gray-400">MAD</span>
                      <span className="text-gray-300 font-normal"> · </span>
                      <span className="text-gray-500 font-semibold">{vs.totalSales}</span> <span className="text-[11px] text-gray-400 font-medium">ventes</span>
                    </span>
                  </div>
                  {salesDiff !== 0 && (
                    <div className="px-3.5 py-1.5">
                      <span className={`text-[11px] font-semibold ${salesDiff > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {salesDiff > 0 ? `+${salesDiff}` : salesDiff} ventes vs hier
                      </span>
                    </div>
                  )}
                </div>

                {/* Rejection feedback — the only way a creator knows what to fix */}
                {s.status === "REJECTED" && s.rejectionReason && (
                  <p className="mt-3 text-[12.5px] text-rose-700 bg-rose-50 ring-1 ring-rose-100 rounded-2xl px-3.5 py-2.5 leading-relaxed">
                    <strong>Motif :</strong> {s.rejectionReason}
                  </p>
                )}

                {/* Actions — unchanged behaviour, large touch targets */}
                {(s.status === "RUNNING" || s.status === "PAUSED" || canReplace) && (
                  <div className="mt-3.5 flex gap-2.5">
                    {s.status === "RUNNING" && (
                      <button onClick={() => handlePauseResume(s.id, "pause")} disabled={busy}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-[13.5px] font-bold text-orange-700 bg-orange-50 ring-1 ring-orange-100 rounded-2xl active:scale-[0.98] transition disabled:opacity-50">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />} Mettre en pause
                      </button>
                    )}
                    {s.status === "PAUSED" && (
                      <button onClick={() => handlePauseResume(s.id, "resume")} disabled={busy}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-[13.5px] font-bold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-100 rounded-2xl active:scale-[0.98] transition disabled:opacity-50">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Reprendre
                      </button>
                    )}
                    {canReplace && (
                      <button onClick={() => setConfirmReplaceId(s.id)} disabled={busy}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-[13.5px] font-bold text-gray-700 bg-gray-50 ring-1 ring-gray-200 rounded-2xl active:scale-[0.98] transition disabled:opacity-50">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Remplacer
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Secondary: helper content, collapsed, at the very bottom ── */}
      <div className="bg-white rounded-[24px] ring-1 ring-gray-100 overflow-hidden">
        <button onClick={() => setHelpOpen((v) => !v)} className="w-full px-4 py-4 flex items-center gap-3 text-left">
          <span className="w-9 h-9 rounded-xl bg-gray-50 text-gray-400 flex items-center justify-center shrink-0">
            <Info className="w-[18px] h-[18px]" />
          </span>
          <span className="flex-1 text-[13.5px] font-semibold text-gray-600">Comment ça marche</span>
          <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${helpOpen ? "rotate-90" : ""}`} />
        </button>

        {helpOpen && (
          <div className="px-4 pb-5 space-y-3.5 text-sm text-gray-600 border-t border-gray-50 pt-4">
            <p className="text-[13.5px]">
              Vous gagnez <strong className="text-gray-800">{fmtMAD(settings.commissionPerSale)} MAD</strong> par vente
              générée par vos vidéos une fois qu'elles sont en diffusion.
            </p>

            {Array.isArray(settings.instructions) && settings.instructions.length > 0 && (
              <ul className="space-y-2">
                {settings.instructions.map((line, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-[7px] shrink-0" />
                    <span className="text-[13px] leading-relaxed">{line}</span>
                  </li>
                ))}
              </ul>
            )}

            {settings.exampleVideoUrl && (
              <button onClick={() => setPlayingUrl(settings.exampleVideoUrl)}
                className="inline-flex items-center gap-2 text-violet-600 font-semibold text-[13px]">
                <Play className="w-3.5 h-3.5 fill-violet-600" /> Voir une vidéo exemple
              </button>
            )}

            {est && (
              <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-100 p-3.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-800 text-[10px] font-bold uppercase tracking-wide">
                  <Info className="w-3 h-3" /> Estimation
                </span>
                <p className="text-[13px] text-amber-900 mt-2 leading-relaxed">
                  Une vidéo en diffusion <strong>pourrait</strong> générer entre{" "}
                  <strong>{fmtMAD(est.minEarning)} MAD</strong> et <strong>{fmtMAD(est.maxEarning)} MAD</strong>.
                </p>
                <p className="text-[11.5px] text-amber-700 mt-1.5 leading-relaxed">
                  Estimation indicative — ce n'est pas un revenu garanti, les résultats réels peuvent varier.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 4. Floating add button (only once the creator has videos) ── */}
      {hasVideos && (
        <button onClick={openWizard} aria-label="Ajouter une nouvelle vidéo"
          className="fixed bottom-6 right-5 z-40 w-16 h-16 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-[0_8px_28px_rgba(124,58,237,0.45)] flex items-center justify-center active:scale-95 transition">
          <Plus className="w-7 h-7" />
        </button>
      )}

      {/* ── Replace confirmation (unchanged) ── */}
      {confirmReplaceId && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setConfirmReplaceId(null)}>
          <div className="bg-white rounded-t-[28px] sm:rounded-[28px] p-6 w-full sm:max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5" /></span>
              <h3 className="text-[17px] font-bold text-gray-900">Remplacer la vidéo ?</h3>
            </div>
            <p className="text-[13.5px] text-gray-600 leading-relaxed">
              La nouvelle vidéo sera renvoyée en validation et repassera par le processus de révision
              avant de pouvoir être diffusée. La diffusion actuelle, le cas échéant, sera interrompue.
            </p>
            <div className="flex gap-2.5 pt-1">
              <button onClick={() => setConfirmReplaceId(null)}
                className="flex-1 px-4 py-3.5 text-sm font-bold text-gray-600 bg-gray-100 rounded-2xl">Annuler</button>
              <button onClick={() => { const id = confirmReplaceId; setConfirmReplaceId(null); triggerReplace(id); }}
                className="flex-1 px-4 py-3.5 text-sm font-bold text-white bg-violet-600 rounded-2xl">Continuer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload wizard sheet — SAME wizard, same steps, same submit ── */}
      {wizardOpen && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => !submitting && setWizardOpen(false)}>
          <div className="bg-white rounded-t-[28px] sm:rounded-[28px] w-full sm:max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-[17px] font-bold text-gray-900">Ajouter une vidéo</h3>
              <button onClick={() => !submitting && setWizardOpen(false)}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-5">
              {/* Stepper */}
              <div className="flex items-center">
                {WIZARD.map((label, i) => {
                  const n = i + 1;
                  const complete = n < activeNode;
                  const current = n === activeNode;
                  return (
                    <Fragment key={label}>
                      {i > 0 && <div className={`flex-1 h-0.5 ${n <= activeNode ? "bg-violet-600" : "bg-gray-200"}`} />}
                      <div className="flex flex-col items-center gap-1">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold
                          ${complete ? "bg-emerald-500 text-white" : current ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-400"}`}>
                          {complete ? <CheckCircle className="w-4 h-4" /> : n}
                        </div>
                        <span className={`text-[10px] ${current ? "text-gray-800 font-semibold" : "text-gray-400"}`}>{label}</span>
                      </div>
                    </Fragment>
                  );
                })}
              </div>

              {submitMsg && submitMsg.type === "error" && (
                <div className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium bg-rose-50 text-rose-700 ring-1 ring-rose-100">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {submitMsg.text}
                </div>
              )}

              {/* Step 1 — Produit */}
              {step === 1 && (
                <div className="space-y-4">
                  {availableProducts.length === 0 ? (
                    <div className="text-center py-6">
                      <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto"><ShoppingBag className="w-5 h-5 text-gray-300" /></div>
                      <p className="text-sm font-semibold text-gray-700 mt-3">Tous les produits ont déjà une vidéo</p>
                      <p className="text-[12.5px] text-gray-400 mt-1 leading-relaxed">
                        Vous pouvez remplacer une vidéo en attente ou rejetée depuis sa carte.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-2">Choisissez le produit à promouvoir</label>
                        <select value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))} className={inputCls}>
                          <option value="">— Choisir un produit —</option>
                          {availableProducts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                      </div>
                      <button onClick={() => { setSubmitMsg(null); setStep(2); }} disabled={!form.productId}
                        className="w-full flex items-center justify-center gap-1.5 px-5 py-4 bg-violet-600 text-white rounded-2xl text-sm font-bold disabled:opacity-40">
                        Suivant <ChevronRight className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Step 2 — Vidéo */}
              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-2">
                      Sélectionnez votre vidéo
                      {maxBytes ? <span className="text-gray-400 font-medium"> (max {fmtBytes(maxBytes)}{settings.minVideoSeconds ? `, ${settings.minVideoSeconds}–${settings.maxVideoSeconds}s` : ""})</span> : null}
                    </label>
                    <input type="file" accept="video/*" onChange={(e) => onFileSelected(e.target.files?.[0] || null)}
                      className="w-full text-sm text-gray-600 file:mr-3 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-violet-600 file:text-white" />
                    {file && !sizeOk && <p className="text-xs text-rose-600 mt-1.5">La vidéo dépasse la taille maximale ({fmtBytes(maxBytes)}).</p>}
                    {file && !fileTypeOk && <p className="text-xs text-rose-600 mt-1.5">Le fichier sélectionné n'est pas une vidéo.</p>}
                  </div>
                  <div className="flex gap-2.5">
                    <button onClick={() => setStep(1)} className="px-5 py-4 text-gray-600 bg-gray-100 rounded-2xl text-sm font-bold">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setSubmitMsg(null); setStep(3); }} disabled={!canProceedStep2}
                      className="flex-1 flex items-center justify-center gap-1.5 px-5 py-4 bg-violet-600 text-white rounded-2xl text-sm font-bold disabled:opacity-40">
                      Suivant <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3 — Aperçu */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="rounded-2xl ring-1 ring-gray-100 bg-gray-50 overflow-hidden">
                    {videoMeta?.loading ? (
                      <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-violet-500" /></div>
                    ) : (
                      <>
                        {videoMeta?.url && (
                          <video src={videoMeta.url} poster={videoMeta.thumbnail || undefined} controls playsInline
                            className="w-full max-h-60 bg-black object-contain" />
                        )}
                        <div className="p-3.5 grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase font-semibold">Fichier</p>
                            <p className="text-[11px] font-bold text-gray-700 truncate" title={file?.name}>{file?.name || "—"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase font-semibold">Taille</p>
                            <p className="text-[11px] font-bold text-gray-700">{fmtBytes(file?.size)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase font-semibold">Durée</p>
                            <p className={`text-[11px] font-bold ${durationOk ? "text-gray-700" : "text-amber-600"}`}>{fmtDuration(durationSec) || "—"}</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {!durationOk && (
                    <p className="text-[12px] text-amber-600 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      Durée recommandée : {settings.minVideoSeconds}–{settings.maxVideoSeconds}s. Votre vidéo pourrait être refusée à la validation.
                    </p>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-2">Description (facultatif)</label>
                    <textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Quelques mots sur votre vidéo…" className={inputCls} />
                  </div>

                  <label className="flex items-start gap-2.5 text-[12.5px] text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={form.consent} onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))} className="mt-0.5" />
                    <span className="leading-relaxed">J'autorise l'utilisation de ma vidéo à des fins publicitaires et je confirme en détenir les droits.</span>
                  </label>

                  <div className="flex gap-2.5">
                    <button onClick={() => setStep(2)} disabled={submitting}
                      className="px-5 py-4 text-gray-600 bg-gray-100 rounded-2xl text-sm font-bold disabled:opacity-40">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={handleCreate} disabled={submitting || !form.consent}
                      className="flex-1 flex items-center justify-center gap-2 px-5 py-4 bg-violet-600 text-white rounded-2xl text-sm font-bold disabled:opacity-40">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {submitting ? "Envoi…" : "Envoyer la vidéo"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
