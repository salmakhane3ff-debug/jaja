"use client";

/**
 * src/app/affiliate/dashboard/UgcTab.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Affiliate UGC (video) dashboard tab — increment 1 of the UGC UI, with UX
 * refinements:
 *   1. Step wizard for submission:  Produit → Vidéo → Aperçu → Envoi.
 *   2. Video preview before submit: filename, size, client-measured duration,
 *      and a captured thumbnail (poster) — all extracted in-browser.
 *   3. Earnings estimate rendered as an EXPLICIT, clearly-labelled estimate
 *      (never phrased as guaranteed income).
 *   4. A status TIMELINE (Soumise → Approuvée → Diffusion) instead of just a badge.
 *   5. Replace asks for confirmation first (it sends the video back through review).
 *   6. Optimistic UI on create/pause/resume/replace, then a background list refresh
 *      (no full dashboard reload).
 *
 * Self-contained: the giant dashboard file only imports this + one render line.
 * Identity is the session token; affiliateId is NEVER sent in the body.
 * Instructions/estimate are plain text (server bounds/sanitizes them).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import {
  Video, Upload, Loader2, CheckCircle, AlertCircle, Play, Pause,
  Clock, XCircle, Eye, DollarSign, TrendingUp, Info, Film,
  AlertTriangle, ChevronLeft, ChevronRight,
} from "lucide-react";

// ── Local helpers (kept in sync with the dashboard's look) ──────────────────────
function authHeaders() {
  const t = (typeof localStorage !== "undefined" && localStorage.getItem("affiliateToken")) || "";
  return { Authorization: `Bearer ${t}` };
}
const jsonHeaders = () => ({ "Content-Type": "application/json", ...authHeaders() });

function fmtMAD(n) {
  if (n == null || isNaN(Number(n))) return "—";
  return `${Number(n).toFixed(2)} MAD`;
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function fmtBytes(b) {
  if (!b) return "—";
  const mb = b / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} Mo` : `${(b / 1024).toFixed(0)} Ko`;
}
function fmtDuration(sec) {
  if (sec == null || !isFinite(sec)) return "—";
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Extract preview metadata from a local video File entirely in the browser:
 * duration, dimensions, and a JPEG thumbnail captured from an early frame.
 * Returns a promise; never rejects (falls back to nulls). Caller owns url.revoke.
 */
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

const STATUS = {
  PENDING:  { label: "En attente de validation", cls: "bg-yellow-100 text-yellow-700", Icon: Clock },
  APPROVED: { label: "Approuvée",                cls: "bg-blue-100 text-blue-700",     Icon: CheckCircle },
  RUNNING:  { label: "En diffusion",             cls: "bg-green-100 text-green-700",   Icon: Play },
  PAUSED:   { label: "En pause",                 cls: "bg-gray-200 text-gray-600",     Icon: Pause },
  REJECTED: { label: "Rejetée",                  cls: "bg-red-100 text-red-700",       Icon: XCircle },
};

// ── Status timeline ─────────────────────────────────────────────────────────────
const LIFECYCLE = [
  { key: "PENDING",  label: "Soumise" },
  { key: "APPROVED", label: "Approuvée" },
  { key: "RUNNING",  label: "Diffusion" },
];
function StatusTimeline({ status }) {
  const rejected = status === "REJECTED";
  const paused   = status === "PAUSED";
  const idxByStatus = { PENDING: 0, APPROVED: 1, RUNNING: 2, PAUSED: 2 };
  const currentIndex = rejected ? 0 : (idxByStatus[status] ?? 0);

  const nodeState = (i) => {
    if (rejected) return i === 0 ? { cls: "bg-red-100 text-red-600 ring-1 ring-red-300", Icon: XCircle } : { cls: "bg-gray-100 text-gray-300", Icon: null };
    if (i < currentIndex) return { cls: "bg-green-500 text-white", Icon: CheckCircle };
    if (i === currentIndex) {
      if (paused) return { cls: "bg-amber-100 text-amber-600 ring-1 ring-amber-300", Icon: Pause };
      if (status === "RUNNING") return { cls: "bg-green-500 text-white", Icon: Play };
      return { cls: "bg-gray-900 text-white", Icon: Clock };
    }
    return { cls: "bg-gray-100 text-gray-300", Icon: null };
  };

  return (
    <div className="flex items-start w-full max-w-xs">
      {LIFECYCLE.map((node, i) => {
        const st = nodeState(i);
        const connGreen = !rejected && i <= currentIndex;
        return (
          <div key={node.key} className="flex-1 flex flex-col items-center relative">
            {i > 0 && (
              <div className={`absolute top-3 left-[-50%] right-1/2 h-0.5 ${connGreen ? "bg-green-400" : "bg-gray-200"}`} />
            )}
            <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center ${st.cls}`}>
              {st.Icon ? <st.Icon className="w-3.5 h-3.5" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
            </div>
            <span className={`text-[10px] mt-1 text-center ${(i === currentIndex && !rejected) ? "text-gray-700 font-semibold" : "text-gray-400"}`}>
              {rejected && i === 0 ? "Rejetée" : (paused && i === 2 ? "En pause" : node.label)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60 flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-gray-500" />}
        <h2 className="text-sm font-bold text-gray-700">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, color = "gray" }) {
  const colors = {
    gray: "bg-gray-100 text-gray-700", green: "bg-green-50 text-green-600",
    blue: "bg-blue-50 text-blue-600", amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2.5">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-[18px] h-[18px]" />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

const WIZARD = ["Produit", "Vidéo", "Aperçu", "Envoi"];

// ── Main tab ────────────────────────────────────────────────────────────────────
export default function UgcTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const [settings, setSettings]       = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [stats, setStats]             = useState(null);
  const [products, setProducts]       = useState([]);

  // Wizard
  const [step, setStep]           = useState(1);           // 1 Produit · 2 Vidéo · 3 Aperçu
  const [form, setForm]           = useState({ productId: "", description: "", consent: false });
  const [file, setFile]           = useState(null);
  const [videoMeta, setVideoMeta] = useState(null);        // { url, duration, width, height, thumbnail, loading? }
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState(null);        // { type, text }

  // Row actions
  const [rowBusy, setRowBusy]     = useState(null);
  const replaceInputRef = useRef(null);
  const [replaceTarget, setReplaceTarget]   = useState(null);
  const [confirmReplaceId, setConfirmReplaceId] = useState(null);

  // Revoke the object URL on unmount (latest one tracked via ref).
  const urlRef = useRef(null);
  useEffect(() => { urlRef.current = videoMeta?.url || null; }, [videoMeta]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  // ── Initial load (settings + list + products) ────────────────────────────────
  const load = useCallback(async () => {
    setError(null);
    try {
      const [sRes, listRes, prodRes] = await Promise.all([
        fetch("/api/affiliate/ugc/settings", { headers: authHeaders() }),
        fetch("/api/affiliate/ugc",          { headers: authHeaders() }),
        fetch("/api/products?status=Active"),
      ]);
      const sData    = sRes.ok ? await sRes.json() : null;
      const listData = listRes.ok ? await listRes.json() : { submissions: [], stats: null };
      const prodData = prodRes.ok ? await prodRes.json() : [];
      setSettings(sData);
      setSubmissions(Array.isArray(listData.submissions) ? listData.submissions : []);
      setStats(listData.stats || null);
      setProducts(Array.isArray(prodData) ? prodData : []);
    } catch {
      setError("Impossible de charger l'espace vidéos. Réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── Background refresh: only the list + stats (refinement #6) ─────────────────
  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/affiliate/ugc", { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setSubmissions(Array.isArray(d.submissions) ? d.submissions : []);
        setStats(d.stats || null);
      }
    } catch { /* keep optimistic state; next action/refresh reconciles */ }
  }, []);

  const patchLocal = (id, patch) => setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  // Derived
  const productMap = {};
  for (const p of products) productMap[p.id] = { title: p.title, image: Array.isArray(p.images) ? p.images[0] : null };
  const submittedIds = new Set(submissions.map((s) => s.productId));
  const availableProducts = products.filter((p) => !submittedIds.has(p.id));
  const maxBytes = settings?.maxUploadBytes || 0;

  // ── File selection → extract preview ─────────────────────────────────────────
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

  const fileTypeOk = file?.type?.startsWith("video/");
  const sizeOk     = !maxBytes || !file || file.size <= maxBytes;
  const durationSec = videoMeta && !videoMeta.loading ? videoMeta.duration : null;
  const durationOk = !durationSec || !settings?.minVideoSeconds
    ? true
    : durationSec >= settings.minVideoSeconds && durationSec <= settings.maxVideoSeconds;
  const canProceedStep2 = !!file && fileTypeOk && sizeOk;

  // ── Create (optimistic) ──────────────────────────────────────────────────────
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
        if (body.submission) setSubmissions((prev) => [body.submission, ...prev]); // optimistic prepend
        setSubmitMsg({ type: "success", text: "Vidéo envoyée ! Elle sera examinée par notre équipe." });
        resetForm();
        refreshList(); // background reconcile
      }
    } catch {
      setSubmitMsg({ type: "error", text: "Erreur réseau. Réessayez." });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Pause / resume (optimistic) ──────────────────────────────────────────────
  const handlePauseResume = async (id, action) => {
    const target = action === "pause" ? "PAUSED" : "RUNNING";
    const snapshot = submissions;
    setRowBusy(id);
    patchLocal(id, { status: target }); // optimistic
    try {
      const res = await fetch(`/api/affiliate/ugc/${id}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify({ action }) });
      if (!res.ok) setSubmissions(snapshot); // revert
    } catch {
      setSubmissions(snapshot);
    } finally {
      setRowBusy(null);
      refreshList();
    }
  };

  // ── Replace (confirm → pick → upload, optimistic) ────────────────────────────
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
      if (res.ok && body.submission) patchLocal(id, body.submission); // optimistic exact update
      else if (res.ok) patchLocal(id, { status: "PENDING" });
    } finally {
      setRowBusy(null);
      refreshList();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-gray-400" /></div>;
  }
  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center space-y-3">
        <AlertCircle className="w-9 h-9 text-red-400 mx-auto" />
        <p className="text-gray-700 text-sm">{error}</p>
        <button onClick={load} className="px-6 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold">Réessayer</button>
      </div>
    );
  }
  if (!settings?.enabled) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center space-y-2">
        <Film className="w-9 h-9 text-gray-300 mx-auto" />
        <p className="text-gray-700 text-sm font-semibold">Le programme vidéo n'est pas encore disponible.</p>
        <p className="text-gray-400 text-xs">Revenez bientôt pour gagner des commissions avec vos vidéos.</p>
      </div>
    );
  }

  const est = settings.estimate;
  const activeNode = submitting ? 4 : step;

  return (
    <div className="space-y-5">
      <input ref={replaceInputRef} type="file" accept="video/*" className="hidden" onChange={handleReplaceFile} />

      {/* ── Confirm-replace dialog (refinement #5) ── */}
      {confirmReplaceId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setConfirmReplaceId(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-gray-900">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-bold">Remplacer la vidéo ?</h3>
            </div>
            <p className="text-sm text-gray-600">
              La nouvelle vidéo sera renvoyée en validation et repassera par le processus de révision
              avant de pouvoir être diffusée. La diffusion actuelle, le cas échéant, sera interrompue.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmReplaceId(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl">Annuler</button>
              <button onClick={() => { const id = confirmReplaceId; setConfirmReplaceId(null); triggerReplace(id); }}
                className="px-4 py-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-xl">Continuer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Earnings stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat icon={DollarSign} color="green" label="Gains vidéo (total)" value={fmtMAD(stats?.totalEarnings)} />
        <MiniStat icon={TrendingUp} color="blue"  label="Gains aujourd'hui"   value={fmtMAD(stats?.todayEarnings)} />
        <MiniStat icon={Video}      color="gray"  label="Ventes générées"     value={stats?.totalSales ?? 0} />
        <MiniStat icon={Play}       color="amber" label="Ventes aujourd'hui"  value={stats?.todaySales ?? 0} />
      </div>

      {/* ── Intro / instructions + explicit estimate ── */}
      <Section title="Comment ça marche" icon={Info}>
        <div className="space-y-4 text-sm text-gray-600">
          <p>
            Gagnez <strong className="text-gray-900">{fmtMAD(settings.commissionPerSale)}</strong> par vente générée
            par vos vidéos une fois qu'elles sont en diffusion.
          </p>

          {Array.isArray(settings.instructions) && settings.instructions.length > 0 && (
            <ul className="list-disc pl-5 space-y-1">
              {settings.instructions.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          )}

          {settings.exampleVideoUrl && (
            <a href={settings.exampleVideoUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-blue-600 font-semibold hover:underline">
              <Eye className="w-4 h-4" /> Voir une vidéo exemple
            </a>
          )}

          {est && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 text-[10px] font-bold uppercase tracking-wide">
                <Info className="w-3 h-3" /> Estimation
              </span>
              <p className="text-sm text-amber-900 mt-2">
                Une vidéo en diffusion <strong>pourrait</strong> générer entre{" "}
                <strong>{fmtMAD(est.minEarning)}</strong> et <strong>{fmtMAD(est.maxEarning)}</strong>.
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Estimation indicative calculée à partir des paramètres actuels. Ce n'est pas un revenu garanti — les résultats réels peuvent varier.
              </p>
            </div>
          )}
        </div>
      </Section>

      {/* ── Upload wizard ── */}
      <Section title="Soumettre une vidéo" icon={Upload}>
        {availableProducts.length === 0 && !submitting ? (
          <p className="text-sm text-gray-500">
            Vous avez déjà soumis une vidéo pour tous les produits disponibles. Vous pouvez remplacer une vidéo rejetée ou en attente ci-dessous.
          </p>
        ) : (
          <div className="max-w-md space-y-5">
            {/* Stepper */}
            <div className="flex items-center">
              {WIZARD.map((label, i) => {
                const n = i + 1;
                const complete = n < activeNode;
                const current = n === activeNode;
                return (
                  <Fragment key={label}>
                    {i > 0 && <div className={`flex-1 h-0.5 ${n <= activeNode ? "bg-gray-900" : "bg-gray-200"}`} />}
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                        ${complete ? "bg-green-500 text-white" : current ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-400"}`}>
                        {complete ? <CheckCircle className="w-4 h-4" /> : n}
                      </div>
                      <span className={`text-[10px] ${current ? "text-gray-800 font-semibold" : "text-gray-400"}`}>{label}</span>
                    </div>
                  </Fragment>
                );
              })}
            </div>

            {submitMsg && (
              <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
                submitMsg.type === "success" ? "bg-green-50 border border-green-100 text-green-700"
                                             : "bg-red-50 border border-red-100 text-red-700"}`}>
                {submitMsg.type === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                {submitMsg.text}
              </div>
            )}

            {/* Step 1 — Produit */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Choisissez le produit à promouvoir</label>
                  <select
                    value={form.productId}
                    onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
                  >
                    <option value="">— Choisir un produit —</option>
                    {availableProducts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => { setSubmitMsg(null); setStep(2); }} disabled={!form.productId}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
                    Suivant <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 — Vidéo */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Sélectionnez votre vidéo
                    {maxBytes ? <span className="text-gray-400 font-normal"> (max {fmtBytes(maxBytes)}{settings.minVideoSeconds ? `, ${settings.minVideoSeconds}–${settings.maxVideoSeconds}s` : ""})</span> : null}
                  </label>
                  <input
                    type="file" accept="video/*"
                    onChange={(e) => onFileSelected(e.target.files?.[0] || null)}
                    className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-gray-900 file:text-white hover:file:bg-gray-800"
                  />
                  {file && !sizeOk && <p className="text-xs text-red-600 mt-1">La vidéo dépasse la taille maximale ({fmtBytes(maxBytes)}).</p>}
                  {file && !fileTypeOk && <p className="text-xs text-red-600 mt-1">Le fichier sélectionné n'est pas une vidéo.</p>}
                </div>
                <div className="flex justify-between">
                  <button onClick={() => setStep(1)} className="flex items-center gap-1.5 px-4 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-semibold">
                    <ChevronLeft className="w-4 h-4" /> Précédent
                  </button>
                  <button onClick={() => { setSubmitMsg(null); setStep(3); }} disabled={!canProceedStep2}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
                    Suivant <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3 — Aperçu + consent + submit */}
            {step === 3 && (
              <div className="space-y-4">
                {/* Preview */}
                <div className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
                  {videoMeta?.loading ? (
                    <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
                  ) : (
                    <>
                      {videoMeta?.url && (
                        <video src={videoMeta.url} poster={videoMeta.thumbnail || undefined} controls
                          className="w-full max-h-56 bg-black object-contain" />
                      )}
                      <div className="p-3 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Fichier</p>
                          <p className="text-xs font-semibold text-gray-700 truncate" title={file?.name}>{file?.name || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Taille</p>
                          <p className="text-xs font-semibold text-gray-700">{fmtBytes(file?.size)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Durée</p>
                          <p className={`text-xs font-semibold ${durationOk ? "text-gray-700" : "text-amber-600"}`}>{fmtDuration(durationSec)}</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {!durationOk && (
                  <p className="text-xs text-amber-600 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Durée recommandée : {settings.minVideoSeconds}–{settings.maxVideoSeconds}s. Votre vidéo pourrait être refusée à la validation.
                  </p>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description (facultatif)</label>
                  <textarea rows={2} value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Quelques mots sur votre vidéo…"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400" />
                </div>

                <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={form.consent}
                    onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))} className="mt-0.5" />
                  <span>J'autorise l'utilisation de ma vidéo à des fins publicitaires et je confirme en détenir les droits.</span>
                </label>

                <div className="flex justify-between">
                  <button onClick={() => setStep(2)} disabled={submitting}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-semibold disabled:opacity-40">
                    <ChevronLeft className="w-4 h-4" /> Précédent
                  </button>
                  <button onClick={handleCreate} disabled={submitting || !form.consent}
                    className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {submitting ? "Envoi…" : "Envoyer la vidéo"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── Submissions list with timeline ── */}
      <Section title={`Mes vidéos (${submissions.length})`} icon={Film}>
        {submissions.length === 0 ? (
          <p className="text-sm text-gray-400">Vous n'avez pas encore soumis de vidéo.</p>
        ) : (
          <div className="space-y-3">
            {submissions.map((s) => {
              const prod = productMap[s.productId];
              const busy = rowBusy === s.id;
              const canReplace = s.status === "REJECTED" || s.status === "PENDING";
              return (
                <div key={s.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {prod?.image
                      ? <img src={prod.image} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                      : <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center shrink-0"><Video className="w-5 h-5 text-gray-400" /></div>}

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 truncate">{prod?.title || "Produit"}</p>
                      <p className="text-xs text-gray-400">{fmtDate(s.submittedAt || s.createdAt)}</p>
                      {s.status === "REJECTED" && s.rejectionReason && (
                        <p className="text-xs text-red-600 mt-0.5">Motif : {s.rejectionReason}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {s.videoUrl && (
                        <a href={s.videoUrl} target="_blank" rel="noopener noreferrer"
                          className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-lg" title="Voir la vidéo">
                          <Eye className="w-4 h-4" />
                        </a>
                      )}
                      {s.status === "RUNNING" && (
                        <button onClick={() => handlePauseResume(s.id, "pause")} disabled={busy}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:border-gray-400 disabled:opacity-50">
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />} Pause
                        </button>
                      )}
                      {s.status === "PAUSED" && (
                        <button onClick={() => handlePauseResume(s.id, "resume")} disabled={busy}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:border-gray-400 disabled:opacity-50">
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Reprendre
                        </button>
                      )}
                      {canReplace && (
                        <button onClick={() => setConfirmReplaceId(s.id)} disabled={busy}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:border-gray-400 disabled:opacity-50">
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Remplacer
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Timeline (refinement #4) */}
                  <StatusTimeline status={s.status} />
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
