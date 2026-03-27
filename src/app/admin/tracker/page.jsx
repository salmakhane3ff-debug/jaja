"use client";

/**
 * /admin/tracker — Production-Grade Performance Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * KPIs · Charts · Funnel · Geo · ISPs · Device · Campaigns · Sources · Recent
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import Link from "next/link";
import {
  MousePointerClick, TrendingUp, DollarSign, Activity,
  Monitor, Smartphone, Tablet, RefreshCw, AlertTriangle,
  ShieldAlert, ShieldCheck, ArrowUpRight, ArrowDownRight,
  Globe, MapPin, Wifi, Building2, Link2,
} from "lucide-react";

// ── Palette ───────────────────────────────────────────────────────────────────
const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7", "#14b8a6", "#f97316"];

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt    = (n) => (n ?? 0).toLocaleString();
const fmtUSD = (n) => `$${(n ?? 0).toFixed(2)}`;
const fmtPct = (n) => `${(n ?? 0).toFixed(2)}%`;

// ── Pill ──────────────────────────────────────────────────────────────────────
function Pill({ value, color = "gray" }) {
  const map = {
    green:  "bg-green-100 text-green-700",
    amber:  "bg-amber-100 text-amber-700",
    red:    "bg-red-100   text-red-700",
    gray:   "bg-gray-100  text-gray-500",
    blue:   "bg-blue-100  text-blue-700",
    purple: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${map[color]}`}>{value}</span>
  );
}

function ctrColor(v) { const n = parseFloat(v)||0; return n>=5?"green":n>=2?"amber":"red"; }
function roiColor(v) { const n = parseFloat(v)||0; return n>0?"green":n<0?"red":"gray"; }

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = "indigo", trend }) {
  const colorMap = {
    indigo: "bg-indigo-50 text-indigo-600", green:  "bg-green-50  text-green-600",
    amber:  "bg-amber-50  text-amber-600",  blue:   "bg-blue-50   text-blue-600",
    red:    "bg-red-50    text-red-600",    purple: "bg-purple-50 text-purple-600",
    teal:   "bg-teal-50   text-teal-600",   orange: "bg-orange-50 text-orange-600",
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${colorMap[color]}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 font-medium mb-0.5">{label}</p>
        <p className="text-xl font-bold text-gray-900 leading-tight truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {trend != null && (
        trend > 0
          ? <ArrowUpRight   size={16} className="text-green-500 shrink-0 mt-1" />
          : <ArrowDownRight size={16} className="text-red-400   shrink-0 mt-1" />
      )}
    </div>
  );
}

function DeviceIcon({ device }) {
  if (device === "mobile")  return <Smartphone size={13} className="text-blue-500" />;
  if (device === "tablet")  return <Tablet size={13}     className="text-purple-500" />;
  return <Monitor size={13} className="text-gray-400" />;
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64 bg-gray-100 rounded-2xl" /><div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
      <div className="h-80 bg-gray-100 rounded-2xl" />
    </div>
  );
}

function Th({ children, sortKey, sortState, onSort, right = false }) {
  const [sortBy, sortDir] = sortState;
  const active = sortBy === sortKey;
  return (
    <th className={`px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap
      ${right ? "text-right" : "text-left"} hover:text-gray-800 transition-colors`}
      onClick={() => onSort(sortKey)}>
      {children}
      {active && <span className="ml-1 text-indigo-500">{sortDir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}

// ── Bar list helper ───────────────────────────────────────────────────────────
function BarList({ data, labelKey, valueKey, colorClass = "bg-indigo-500" }) {
  const max = data?.[0]?.[valueKey] || 1;
  if (!data?.length) return <p className="text-sm text-gray-400">No data</p>;
  return (
    <div className="space-y-2.5">
      {data.slice(0, 10).map((row, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-36 truncate">{row[labelKey] || "(unknown)"}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
            <div className={`${colorClass} h-1.5 rounded-full`} style={{ width: `${Math.round((row[valueKey] / max) * 100)}%` }} />
          </div>
          <span className="text-xs font-medium text-gray-700 w-10 text-right">{fmt(row[valueKey])}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TrackerPage() {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [days,      setDays]      = useState(30);
  const [tab,       setTab]       = useState("campaigns");
  const [sort,      setSort]      = useState(["clicks", "desc"]);
  const [campaigns, setCampaigns] = useState([]);
  const [campaign,  setCampaign]  = useState(""); // filter by campaign slug

  // Load campaign list for the filter dropdown
  useEffect(() => {
    fetch("/api/campaigns?days=90")
      .then((r) => r.json())
      .then((j) => setCampaigns(j.campaigns || []))
      .catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      let url = `/api/admin/tracker?days=${days}`;
      if (campaign) url += `&campaign=${encodeURIComponent(campaign)}`;
      const r = await fetch(url);
      const j = await r.json();
      setData(j);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [days, campaign]); // eslint-disable-line

  const handleSort = (key) => {
    setSort(([prevKey, prevDir]) =>
      prevKey === key ? [key, prevDir === "asc" ? "desc" : "asc"] : [key, "desc"]
    );
  };

  const tableRows = useMemo(() => {
    if (!data) return [];
    const raw = tab === "sources" ? (data.bySources || []) : tab === "campaigns" ? (data.byCampaign || []) : [];
    const [key, dir] = sort;
    return [...raw].sort((a, b) => {
      const av = a[key] ?? 0, bv = b[key] ?? 0;
      return dir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [data, tab, sort]);

  const tableKey = tab === "sources" ? "sourceId" : "campaignId";

  const sourceBarData = useMemo(() => (data?.bySources || []).slice(0, 10).map((s) => ({
    name: s.sourceId === "unknown" ? "(direct)" : s.sourceId,
    clicks: s.clicks, conversions: s.conversions,
  })), [data]);

  const deviceData = useMemo(() => (data?.byDevice || []).map((d) => ({
    name: d.device, value: d.clicks,
  })), [data]);

  const s = data?.summary || {};

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto" dir="ltr">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MousePointerClick size={20} className="text-indigo-500" />
            Performance Tracker
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Last-click attribution · Geo + Funnel + Fraud analytics</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Campaign filter */}
          {campaigns.length > 0 && (
            <select value={campaign} onChange={(e) => setCampaign(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-medium text-gray-700 bg-white focus:outline-none focus:border-indigo-300 max-w-[180px]">
              <option value="">All Campaigns</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.slug}>{c.name}</option>
              ))}
            </select>
          )}
          {data && s.suspiciousClicks > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-600">
              <ShieldAlert size={13} /> {fmt(s.suspiciousClicks)} suspicious
            </div>
          )}
          {data && s.suspiciousClicks === 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-xl text-xs font-semibold text-green-600">
              <ShieldCheck size={13} /> Clean traffic
            </div>
          )}
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {[7, 14, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  days === d ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                }`}>{d}d</button>
            ))}
          </div>
          <Link href="/admin/campaigns"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-all">
            <Link2 size={13} /> Campaigns
          </Link>
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {loading && !data && <Skeleton />}

      {data && (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
            <KpiCard icon={MousePointerClick} label="Total Clicks"  value={fmt(s.totalClicks)}       sub={`${fmt(s.cleanClicks)} clean`}      color="indigo" />
            <KpiCard icon={TrendingUp}        label="Conversions"   value={fmt(s.totalConversions)}  sub="Unique orders"                       color="green" />
            <KpiCard icon={Activity}          label="Conv Rate"     value={fmtPct(s.conversionRate)} sub="CTR"                                 color="amber" />
            <KpiCard icon={DollarSign}        label="Revenue"       value={fmtUSD(s.totalRevenue)}   sub="All conversions"                     color="blue" />
            <KpiCard icon={DollarSign}        label="Cost"          value={fmtUSD(s.totalCost)}      sub="Sum of CPC"                          color="red" />
            <KpiCard icon={TrendingUp}        label="Profit"        value={fmtUSD(s.totalProfit)}    sub="Revenue − Cost"                      color={s.totalProfit >= 0 ? "green" : "red"} trend={s.totalProfit} />
            <KpiCard icon={MousePointerClick} label="EPC"           value={fmtUSD(s.epc)}            sub="Earnings / Click"                    color="purple" />
            <KpiCard icon={Activity}          label="ROI"           value={fmtPct(s.roi)}            sub="Profit / Cost × 100"                 color={s.roi >= 0 ? "teal" : "orange"} trend={s.roi} />
          </div>

          {/* ── Row 1: Source bar + Device pie ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Top Sources — Clicks vs Conversions</h3>
              {sourceBarData.length === 0
                ? <div className="h-52 flex items-center justify-center text-gray-400 text-sm">No data yet</div>
                : <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={sourceBarData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={40} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                      <Bar dataKey="clicks"      fill="#6366f1" radius={[4,4,0,0]} name="Clicks" />
                      <Bar dataKey="conversions" fill="#22c55e" radius={[4,4,0,0]} name="Conversions" />
                    </BarChart>
                  </ResponsiveContainer>}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Device Breakdown</h3>
              {deviceData.length === 0
                ? <div className="h-52 flex items-center justify-center text-gray-400 text-sm">No data yet</div>
                : <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={deviceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                        {deviceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>}
            </div>
          </div>

          {/* ── Funnel ── */}
          {(data.funnel || []).some((f) => f.count > 0) && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-5">Conversion Funnel</h3>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {(data.funnel || []).map((step, i) => {
                  const ICONS = ["👀", "🛍️", "🛒", "📦", "💳", "✅"];
                  const maxCount = data.funnel[0]?.count || 1;
                  const pct = maxCount > 0 ? Math.round((step.count / maxCount) * 100) : 0;
                  return (
                    <div key={i} className="flex flex-col items-center text-center gap-1.5">
                      <div className="text-2xl">{ICONS[i]}</div>
                      <p className="text-xs text-gray-500 font-medium leading-tight capitalize">
                        {step.step.replace(/_/g, " ")}
                      </p>
                      <p className="text-xl font-bold text-gray-900">{fmt(step.count)}</p>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="bg-indigo-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-gray-400">{pct}% of visits</p>
                      {step.dropOff != null && i > 0 && (
                        <span className="text-[10px] text-red-500 font-semibold">−{step.dropOff}% drop</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Row 2: Device conv rate + OS + Browser ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Device conv rate */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Monitor size={14} className="text-gray-500" /> Device Conversion Rate
              </h3>
              {!(data.byDevice || []).length
                ? <p className="text-sm text-gray-400">No data</p>
                : <div className="space-y-3">
                    {(data.byDevice || []).map((d, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <DeviceIcon device={d.device} />
                          <span className="text-sm text-gray-700 capitalize">{d.device}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">{fmt(d.clicks)} clicks</span>
                          <Pill value={`${d.convRate}%`} color={ctrColor(d.convRate)} />
                        </div>
                      </div>
                    ))}
                  </div>}
            </div>

            {/* OS */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Operating Systems</h3>
              <BarList data={data.byOs || []} labelKey="os" valueKey="clicks" colorClass="bg-indigo-500" />
            </div>

            {/* Browser */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Browsers</h3>
              <BarList data={data.byBrowser || []} labelKey="browser" valueKey="clicks" colorClass="bg-blue-500" />
            </div>
          </div>

          {/* ── Row 3: Countries + Cities + ISPs ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Globe size={14} className="text-gray-500" /> Top Countries
              </h3>
              <BarList data={data.byCountry || []} labelKey="country" valueKey="clicks" colorClass="bg-teal-500" />
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <MapPin size={14} className="text-gray-500" /> Top Cities (by Revenue)
              </h3>
              {!(data.byCity || []).length
                ? <p className="text-sm text-gray-400">No data</p>
                : <div className="space-y-2">
                    {(data.byCity || []).slice(0, 10).map((row, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 truncate w-32">{row.city || "(unknown)"}</span>
                        <span className="text-gray-500">{fmt(row.clicks)} clicks</span>
                        <span className="font-semibold text-green-700">{fmtUSD(row.revenue)}</span>
                      </div>
                    ))}
                  </div>}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Wifi size={14} className="text-gray-500" /> ISP / Carrier
              </h3>
              <BarList data={data.byIsp || []} labelKey="isp" valueKey="clicks" colorClass="bg-purple-500" />
            </div>
          </div>

          {/* ── Tab table ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-1 px-4 pt-4 border-b border-gray-100 flex-wrap">
              {[
                { key: "campaigns", label: "📈 Campaigns" },
                { key: "sources",   label: "🌍 Sources" },
                { key: "recent",    label: "🕐 Recent Clicks" },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap ${
                    tab === key
                      ? "bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600 -mb-px"
                      : "text-gray-500 hover:text-gray-700"
                  }`}>{label}</button>
              ))}
            </div>

            {/* Campaign / Source table */}
            {tab !== "recent" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th sortKey={tableKey}    sortState={sort} onSort={handleSort}>{tab === "campaigns" ? "Campaign" : "Source"}</Th>
                      <Th sortKey="clicks"      sortState={sort} onSort={handleSort} right>Clicks</Th>
                      <Th sortKey="conversions" sortState={sort} onSort={handleSort} right>Conv</Th>
                      <Th sortKey="ctr"         sortState={sort} onSort={handleSort} right>CTR%</Th>
                      <Th sortKey="revenue"     sortState={sort} onSort={handleSort} right>Revenue</Th>
                      <Th sortKey="cost"        sortState={sort} onSort={handleSort} right>Cost</Th>
                      <Th sortKey="profit"      sortState={sort} onSort={handleSort} right>Profit</Th>
                      <Th sortKey="epc"         sortState={sort} onSort={handleSort} right>EPC</Th>
                      {tab === "campaigns" && (
                        <>
                          <Th sortKey="cpa" sortState={sort} onSort={handleSort} right>CPA</Th>
                          <Th sortKey="roi" sortState={sort} onSort={handleSort} right>ROI%</Th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {tableRows.length === 0 && (
                      <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400 text-sm">No data yet — traffic will appear here automatically</td></tr>
                    )}
                    {tableRows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-3 font-medium text-gray-800 max-w-[180px] truncate">
                          {!row[tableKey] || row[tableKey] === "unknown"
                            ? <span className="text-gray-400 italic text-xs">(direct)</span>
                            : row[tableKey]}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700 tabular-nums">{fmt(row.clicks)}</td>
                        <td className="px-3 py-3 text-right text-gray-700 tabular-nums">{fmt(row.conversions)}</td>
                        <td className="px-3 py-3 text-right"><Pill value={`${row.ctr}%`} color={ctrColor(row.ctr)} /></td>
                        <td className="px-3 py-3 text-right font-medium text-gray-800 tabular-nums">{fmtUSD(row.revenue)}</td>
                        <td className="px-3 py-3 text-right text-gray-600 tabular-nums">{fmtUSD(row.cost)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          <span className={row.profit >= 0 ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{fmtUSD(row.profit)}</span>
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700 tabular-nums">{fmtUSD(row.epc)}</td>
                        {tab === "campaigns" && (
                          <>
                            <td className="px-3 py-3 text-right text-gray-600 tabular-nums">{fmtUSD(row.cpa)}</td>
                            <td className="px-3 py-3 text-right"><Pill value={`${row.roi}%`} color={roiColor(row.roi)} /></td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recent clicks */}
            {tab === "recent" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Click ID</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaign</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Zone</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Device</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">OS</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Browser</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Country</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">City</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">ISP</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Conn</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">CPC</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Safe</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Conv</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {!(data.recent || []).length && (
                      <tr><td colSpan={15} className="px-4 py-10 text-center text-gray-400 text-sm">No clicks recorded yet</td></tr>
                    )}
                    {(data.recent || []).map((c, i) => (
                      <tr key={i} className={`hover:bg-gray-50 transition-colors ${c.isSuspicious ? "bg-red-50/40" : ""}`}>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-400 max-w-[90px] truncate">{c.clickId}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-700">{c.sourceId   || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-700 max-w-[100px] truncate">{c.campaignId || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{c.zoneId     || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <DeviceIcon device={c.device} />
                            <span className="text-xs text-gray-600 capitalize">{c.device}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">{c.os}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">{c.browser}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">{c.country || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">{c.city    || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[100px] truncate">{c.isp || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{c.connectionType || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-right text-xs font-mono text-gray-700">
                          {c.cpc != null ? fmtUSD(c.cpc) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.isSuspicious
                            ? <span title="Suspicious" className="inline-flex items-center justify-center w-5 h-5 bg-red-100 rounded-full"><AlertTriangle size={11} className="text-red-500" /></span>
                            : <span className="inline-flex items-center justify-center w-5 h-5 bg-green-100 rounded-full"><span className="text-green-600 text-xs font-bold">✓</span></span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.converted
                            ? <span className="inline-flex items-center justify-center w-5 h-5 bg-green-500 rounded-full text-white text-xs font-bold">✓</span>
                            : <span className="inline-flex items-center justify-center w-5 h-5 bg-gray-200 rounded-full" />}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(c.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
