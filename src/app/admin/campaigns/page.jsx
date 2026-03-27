"use client";

/**
 * /admin/campaigns — Campaign Management + Tracking Link Generator
 * ─────────────────────────────────────────────────────────────────────────────
 * • List all campaigns with live stats (clicks, conv, revenue, profit, ROI)
 * • Create / Edit / Delete campaigns
 * • Auto-generate tracking links with macro placeholders
 * • One-click copy of tracking link
 * • Toggle campaign active/paused
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback } from "react";
import {
  Plus, Copy, Check, Trash2, Edit2, ChevronDown, ChevronUp,
  ExternalLink, TrendingUp, MousePointerClick, DollarSign,
  RefreshCw, X, ToggleLeft, ToggleRight, Activity, Link2,
  AlertTriangle,
} from "lucide-react";

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtUSD = (n) => `$${(n ?? 0).toFixed(2)}`;
const fmtPct = (n) => `${(n ?? 0).toFixed(1)}%`;
const fmt    = (n) => (n ?? 0).toLocaleString();

// ── Source options ────────────────────────────────────────────────────────────
const SOURCES = [
  { value: "daopush",  label: "DaoPush" },
  { value: "richads",  label: "RichAds" },
  { value: "propush",  label: "Propush.me" },
  { value: "evadav",   label: "Evadav" },
  { value: "taboola",  label: "Taboola" },
  { value: "mgid",     label: "MGID" },
  { value: "outbrain", label: "Outbrain" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok",   label: "TikTok" },
  { value: "google",   label: "Google" },
  { value: "other",    label: "Other" },
];

// ── Macro reference per source ────────────────────────────────────────────────
const MACROS = {
  daopush:  { click_id: "{clickid}", sub_id: "{zoneid}" },
  richads:  { click_id: "{click_id}", sub_id: "{zone_id}" },
  propush:  { click_id: "{SUBID}", sub_id: "{ZONE}" },
  evadav:   { click_id: "{sid}", sub_id: "{zoneid}" },
  taboola:  { click_id: "{click_id}", sub_id: "{site}" },
  mgid:     { click_id: "{teaser_id}", sub_id: "{widget_id}" },
  outbrain: { click_id: "{ob_click_id}", sub_id: "{publisher_id}" },
  facebook: { click_id: "{{fbclid}}", sub_id: "{{adset.id}}" },
  tiktok:   { click_id: "__CLICK_ID__", sub_id: "__AID__" },
  google:   { click_id: "{gclid}", sub_id: "{placement}" },
  other:    { click_id: "{click_id}", sub_id: "{sub_id}" },
};

function buildTrackingLink(campaign, baseUrl = "") {
  const macros = MACROS[campaign.source] || MACROS.other;
  const base   = baseUrl || (typeof window !== "undefined" ? window.location.origin : "https://your-domain.com");
  const lp     = campaign.landingUrl.startsWith("http") ? campaign.landingUrl : `${base}${campaign.landingUrl.startsWith("/") ? "" : "/"}${campaign.landingUrl}`;

  const params = new URLSearchParams({
    click_id:    macros.click_id,
    source_id:   campaign.source,
    campaign_id: campaign.slug,
    sub_id:      macros.sub_id,
    ...(campaign.costModel === "cpc" ? { cpc: campaign.defaultCost } : { cpm: campaign.defaultCost }),
  });

  return `${lp}?${params.toString()}`;
}

// ── Components ────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color = "indigo" }) {
  const colors = {
    indigo: "bg-indigo-50 text-indigo-600",
    green:  "bg-green-50  text-green-600",
    amber:  "bg-amber-50  text-amber-600",
    blue:   "bg-blue-50   text-blue-600",
    red:    "bg-red-50    text-red-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium mb-0.5">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function Pill({ value, color = "gray" }) {
  const map = {
    green:  "bg-green-100  text-green-700",
    amber:  "bg-amber-100  text-amber-700",
    red:    "bg-red-100    text-red-700",
    gray:   "bg-gray-100   text-gray-500",
    blue:   "bg-blue-100   text-blue-700",
    indigo: "bg-indigo-100 text-indigo-700",
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${map[color]}`}>{value}</span>;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} title="Copy tracking link"
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
        copied
          ? "bg-green-50 border-green-300 text-green-700"
          : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-700"
      }`}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copied!" : "Copy Link"}
    </button>
  );
}

// ── Form Modal ────────────────────────────────────────────────────────────────
function CampaignModal({ initial, onSave, onClose }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    name:        initial?.name        || "",
    landingUrl:  initial?.landingUrl  || "/",
    source:      initial?.source      || "daopush",
    costModel:   initial?.costModel   || "cpc",
    defaultCost: initial?.defaultCost ?? 0,
    notes:       initial?.notes       || "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const url = isEdit ? `/api/campaigns/${initial.id}` : "/api/campaigns";
      const r   = await fetch(url, {
        method:  isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...form, defaultCost: parseFloat(form.defaultCost) || 0 }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Error saving"); setSaving(false); return; }
      onSave(j.campaign);
    } catch {
      setError("Network error");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Link2 size={16} className="text-indigo-500" />
            {isEdit ? "Edit Campaign" : "New Campaign"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Campaign Name *</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)}
              required placeholder="e.g. Push MA — Product July"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-gray-50" />
          </div>

          {/* Landing URL */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Landing Page URL *</label>
            <input value={form.landingUrl} onChange={(e) => set("landingUrl", e.target.value)}
              required placeholder="/products/my-product  or  https://…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-gray-50" />
            <p className="text-[11px] text-gray-400 mt-1">Can be a path (/products/…) or full URL</p>
          </div>

          {/* Source + Cost Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Traffic Source *</label>
              <select value={form.source} onChange={(e) => set("source", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-gray-50">
                {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Cost Model</label>
              <select value={form.costModel} onChange={(e) => set("costModel", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-gray-50">
                <option value="cpc">CPC (per click)</option>
                <option value="cpm">CPM (per 1k impr.)</option>
              </select>
            </div>
          </div>

          {/* Default Cost */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Default {form.costModel.toUpperCase()} ($)
            </label>
            <input type="number" step="0.001" min="0" value={form.defaultCost}
              onChange={(e) => set("defaultCost", e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-gray-50"
              placeholder="0.050" />
            <p className="text-[11px] text-gray-400 mt-1">Used in the generated tracking link. Ad networks override this dynamically.</p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Notes (optional)</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2}
              placeholder="e.g. Split test A — creative set 1"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-gray-50 resize-none" />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle size={13} /> {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-gray-900 rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50">
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Campaign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Campaign Row ──────────────────────────────────────────────────────────────
function CampaignRow({ campaign, onEdit, onDelete, onToggle, days }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const st         = campaign.stats || {};
  const roiColor   = st.roi > 0 ? "green" : st.roi < 0 ? "red" : "gray";
  const trackLink  = buildTrackingLink(campaign);
  const macros     = MACROS[campaign.source] || MACROS.other;
  const src        = SOURCES.find((s) => s.value === campaign.source)?.label || campaign.source;

  const handleDelete = async () => {
    if (!confirm(`Delete campaign "${campaign.name}"? This won't delete click data.`)) return;
    setDeleting(true);
    await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" }).catch(() => {});
    onDelete(campaign.id);
  };

  const handleToggle = async () => {
    setToggling(true);
    const r = await fetch(`/api/campaigns/${campaign.id}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ isActive: !campaign.isActive }),
    }).catch(() => null);
    if (r?.ok) {
      const j = await r.json();
      onToggle(j.campaign);
    }
    setToggling(false);
  };

  return (
    <>
      <tr className={`hover:bg-gray-50 transition-colors border-t border-gray-50 ${!campaign.isActive ? "opacity-60" : ""}`}>
        {/* Name + source */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900 leading-tight">{campaign.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Pill value={src} color="blue" />
                <Pill value={campaign.costModel.toUpperCase()} color="indigo" />
                {!campaign.isActive && <Pill value="Paused" color="amber" />}
              </div>
            </div>
          </div>
        </td>

        {/* Stats */}
        <td className="px-3 py-3 text-right text-sm font-medium text-gray-700 tabular-nums">{fmt(st.clicks)}</td>
        <td className="px-3 py-3 text-right text-sm text-gray-700 tabular-nums">{fmt(st.conversions)}</td>
        <td className="px-3 py-3 text-right text-sm text-gray-700 tabular-nums">{fmtPct(st.convRate)}</td>
        <td className="px-3 py-3 text-right text-sm font-medium text-gray-800 tabular-nums">{fmtUSD(st.revenue)}</td>
        <td className="px-3 py-3 text-right text-sm text-gray-600 tabular-nums">{fmtUSD(st.cost)}</td>
        <td className="px-3 py-3 text-right tabular-nums">
          <span className={`text-sm font-semibold ${st.profit >= 0 ? "text-green-700" : "text-red-600"}`}>{fmtUSD(st.profit)}</span>
        </td>
        <td className="px-3 py-3 text-right">
          <Pill value={`${(st.roi ?? 0).toFixed(1)}%`} color={roiColor} />
        </td>
        <td className="px-3 py-3 text-right text-xs text-gray-500 tabular-nums">{fmtUSD(st.epc)}</td>
        <td className="px-3 py-3 text-right text-xs text-gray-500 tabular-nums">{fmtUSD(st.cpa)}</td>

        {/* Actions */}
        <td className="px-3 py-3">
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => setExpanded((e) => !e)} title="Show tracking link"
              className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-500 transition-colors">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button onClick={() => onEdit(campaign)} title="Edit campaign"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <Edit2 size={14} />
            </button>
            <button onClick={handleToggle} disabled={toggling} title={campaign.isActive ? "Pause" : "Resume"}
              className={`p-1.5 rounded-lg transition-colors ${campaign.isActive ? "hover:bg-amber-50 text-amber-500" : "hover:bg-green-50 text-green-500"}`}>
              {campaign.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            </button>
            <button onClick={handleDelete} disabled={deleting} title="Delete campaign"
              className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded tracking link */}
      {expanded && (
        <tr className="bg-indigo-50/30 border-t border-indigo-100/50">
          <td colSpan={11} className="px-4 py-4">
            <div className="space-y-3">
              {/* Tracking link */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
                  <Link2 size={12} className="text-indigo-500" />
                  Tracking Link — paste into your ad network
                </p>
                <div className="flex items-stretch gap-2">
                  <code className="flex-1 bg-white border border-indigo-200 rounded-xl px-3 py-2 text-xs text-indigo-700 font-mono break-all leading-relaxed">
                    {trackLink}
                  </code>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <CopyButton text={trackLink} />
                    <a href={campaign.landingUrl} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg text-gray-600 hover:border-gray-300 transition-all">
                      <ExternalLink size={12} /> Preview
                    </a>
                  </div>
                </div>
              </div>

              {/* Macro reference */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Click ID macro", value: macros.click_id },
                  { label: "Sub ID macro",   value: macros.sub_id },
                  { label: "Campaign slug",  value: campaign.slug },
                  { label: `Default ${campaign.costModel.toUpperCase()}`, value: `$${campaign.defaultCost}` },
                ].map((item) => (
                  <div key={item.label} className="bg-white rounded-xl border border-gray-100 px-3 py-2.5">
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">{item.label}</p>
                    <code className="text-xs font-mono text-gray-700">{item.value}</code>
                  </div>
                ))}
              </div>

              {/* Postback URL */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">S2S Postback URL (server-to-server)</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 font-mono break-all">
                    {typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"}/api/tracking/postback?click_id={macros.click_id}&sum={"{revenue}"}&type=main
                  </code>
                  <CopyButton text={`${typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"}/api/tracking/postback?click_id=${macros.click_id}&sum={revenue}&type=main`} />
                </div>
              </div>

              {campaign.notes && (
                <p className="text-xs text-gray-500 italic bg-white rounded-lg px-3 py-2 border border-gray-100">
                  📝 {campaign.notes}
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [days,      setDays]      = useState(30);
  const [modal,     setModal]     = useState(null); // null | "create" | campaign-obj
  const [search,    setSearch]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/campaigns?days=${days}`);
      const j = await r.json();
      setCampaigns(j.campaigns || []);
    } catch {}
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalClicks  = campaigns.reduce((s, c) => s + (c.stats?.clicks      || 0), 0);
  const totalRevenue = campaigns.reduce((s, c) => s + (c.stats?.revenue     || 0), 0);
  const totalProfit  = campaigns.reduce((s, c) => s + (c.stats?.profit      || 0), 0);
  const totalConv    = campaigns.reduce((s, c) => s + (c.stats?.conversions || 0), 0);

  // ── CRUD handlers ──────────────────────────────────────────────────────────
  const handleSaved = (saved) => {
    setCampaigns((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...saved };
        return next;
      }
      return [{ ...saved, stats: { clicks: 0, conversions: 0, revenue: 0, cost: 0, profit: 0, roi: 0, epc: 0, cpa: 0, convRate: 0 } }, ...prev];
    });
    setModal(null);
    // Reload to get fresh stats
    setTimeout(load, 500);
  };

  const handleDelete = (id) => setCampaigns((prev) => prev.filter((c) => c.id !== id));
  const handleToggle = (updated) => {
    setCampaigns((prev) => prev.map((c) => c.id === updated.id ? { ...c, ...updated } : c));
  };

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = campaigns.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase()) ||
    c.source.toLowerCase().includes(search.toLowerCase())
  );

  const active = campaigns.filter((c) => c.isActive).length;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto" dir="ltr">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Link2 size={20} className="text-indigo-500" />
            Campaign Manager
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Create campaigns · Generate tracking links · Monitor ROI
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date filter */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {[7, 14, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  days === d ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                }`}>{d}d</button>
            ))}
          </div>
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => setModal("create")}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-gray-900 rounded-xl hover:bg-gray-800 transition-all">
            <Plus size={15} /> New Campaign
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={Link2}            label="Total Campaigns"    value={`${campaigns.length} (${active} active)`} color="indigo" />
        <KpiCard icon={MousePointerClick} label={`Clicks (${days}d)`} value={fmt(totalClicks)}                        color="blue" />
        <KpiCard icon={TrendingUp}        label="Conversions"         value={fmt(totalConv)}                           color="green" />
        <KpiCard icon={DollarSign}        label="Profit"              value={fmtUSD(totalProfit)}                      color={totalProfit >= 0 ? "green" : "red"} />
      </div>

      {/* ── Best Campaign Banner ── */}
      {campaigns.length > 0 && (() => {
        const best = [...campaigns].sort((a, b) => (b.stats?.profit || 0) - (a.stats?.profit || 0))[0];
        if (!best?.stats?.profit) return null;
        return (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl px-5 py-4 flex items-center gap-4">
            <span className="text-2xl">🏆</span>
            <div>
              <p className="text-xs text-green-700 font-semibold uppercase tracking-wide">Best Performing Campaign</p>
              <p className="text-sm font-bold text-gray-900">{best.name}
                <span className="ml-2 font-normal text-green-700">{fmtUSD(best.stats.profit)} profit — {(best.stats.roi || 0).toFixed(1)}% ROI</span>
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Search + count */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">{filtered.length} campaigns</span>
            <Activity size={14} className="text-gray-400" />
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, source, slug…"
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm w-64 focus:outline-none focus:border-indigo-300 bg-gray-50" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaign</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Clicks</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Conv</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">CR%</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Cost</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Profit</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">ROI</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">EPC</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">CPA</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && campaigns.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <RefreshCw size={20} className="animate-spin" />
                      <span className="text-sm">Loading campaigns…</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <Link2 size={28} className="text-gray-200" />
                      <span className="text-sm">No campaigns yet — click <strong>New Campaign</strong> to get started</span>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <CampaignRow
                  key={c.id}
                  campaign={c}
                  days={days}
                  onEdit={(camp) => setModal(camp)}
                  onDelete={handleDelete}
                  onToggle={handleToggle}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Source Leaderboard ── */}
      {campaigns.length > 1 && (() => {
        const bySource = {};
        for (const c of campaigns) {
          const src = c.source;
          if (!bySource[src]) bySource[src] = { source: src, revenue: 0, profit: 0, clicks: 0, conversions: 0 };
          bySource[src].revenue     += c.stats?.revenue     || 0;
          bySource[src].profit      += c.stats?.profit      || 0;
          bySource[src].clicks      += c.stats?.clicks      || 0;
          bySource[src].conversions += c.stats?.conversions || 0;
        }
        const rows = Object.values(bySource).sort((a, b) => b.revenue - a.revenue);
        if (rows.length < 2) return null;
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp size={14} className="text-indigo-500" /> Top Sources by Revenue
            </h3>
            <div className="space-y-2.5">
              {rows.map((row, i) => {
                const maxR = rows[0].revenue || 1;
                const src  = SOURCES.find((s) => s.value === row.source)?.label || row.source;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-24 truncate">{src}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${Math.round((row.revenue / maxR) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-20 text-right">{fmtUSD(row.revenue)}</span>
                    <span className={`text-xs font-semibold w-20 text-right ${row.profit >= 0 ? "text-green-700" : "text-red-600"}`}>{fmtUSD(row.profit)}</span>
                    <span className="text-xs text-gray-400 w-14 text-right">{fmt(row.clicks)} clk</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Modal ── */}
      {modal && (
        <CampaignModal
          initial={modal === "create" ? null : modal}
          onSave={handleSaved}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
