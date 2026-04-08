"use client";

/**
 * /admin/product-analytics
 * ─────────────────────────────────────────────────────────────────────────────
 * Product-level sticky-bar performance dashboard.
 * Data source: GET /api/admin/product-analytics  (enriched by productInsights)
 *
 * Sections:
 *   1. KPI cards  — page views · sticky impressions · global sticky CTR · conv rate
 *   2. Charts     — sticky CTR bar · funnel bar · add vs buy stacked bar
 *   3. Table      — all products, sortable, searchable, colour-coded CTR
 *
 * Future-ready hooks (currently dormant):
 *   • dateRange state → pass to API when date filtering is added
 *   • variant prop on rows → enable A/B comparison view
 *   • funnel step data → extend chartData when available
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Eye, Activity, MousePointer, TrendingUp,
  Search, RefreshCw, AlertCircle, ArrowUpDown,
  ArrowUp, ArrowDown, Zap, ShoppingCart, Package,
} from "lucide-react";

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Sk({ className }) {
  return <div className={`animate-pulse bg-gray-100 rounded-xl ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="py-6 space-y-6 max-w-7xl">
      <div className="flex justify-between items-center">
        <Sk className="h-8 w-72" />
        <Sk className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => <Sk key={i} className="h-28" />)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Sk className="h-72" />
        <Sk className="h-72" />
        <Sk className="h-64 xl:col-span-2" />
      </div>
      <Sk className="h-96" />
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, Icon, iconColor, iconBg }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
      <p className="text-2xl font-black text-gray-900 leading-none mb-1">{value}</p>
      <p className="text-sm font-semibold text-gray-600 mb-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 leading-snug">{sub}</p>}
    </div>
  );
}

// ── Engagement badge ──────────────────────────────────────────────────────────
const LEVEL_META = {
  HIGH:              { label: "HIGH",  cls: "bg-green-50 text-green-700 border-green-200" },
  MEDIUM:            { label: "MED",   cls: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  LOW:               { label: "LOW",   cls: "bg-red-50 text-red-600 border-red-200" },
  INSUFFICIENT_DATA: { label: "—",     cls: "bg-gray-50 text-gray-400 border-gray-100" },
};
function EngagBadge({ level }) {
  const m = LEVEL_META[level] ?? LEVEL_META.INSUFFICIENT_DATA;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.cls}`}>
      {m.label}
    </span>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────
function SortIco({ col, sortKey, dir }) {
  if (col !== sortKey) return <ArrowUpDown className="w-3 h-3 text-gray-300 ml-1 shrink-0" />;
  return dir === "desc"
    ? <ArrowDown className="w-3 h-3 text-gray-700 ml-1 shrink-0" />
    : <ArrowUp   className="w-3 h-3 text-gray-700 ml-1 shrink-0" />;
}

// ── Custom recharts tooltip ───────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs max-w-[200px]">
      <p className="font-bold text-gray-800 mb-2 truncate">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mt-1">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.fill || p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-bold text-gray-900 ml-auto pl-2">
            {p.value}{p.unit || ""}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function imgSrc(v) {
  if (!v) return "";
  return typeof v === "string" ? v : v.url || v.src || "";
}

function rawCTR(r) {
  const imp = r.stickyImpressions ?? 0;
  if (!imp) return 0;
  return ((r.stickyAddClicks ?? 0) + (r.stickyBuyClicks ?? 0)) / imp * 100;
}

function ctrColor(pct, impressions) {
  if (impressions < 100) return "text-gray-500";
  if (pct >= 6)          return "text-green-700 font-bold";
  if (pct < 2)           return "text-red-600 font-bold";
  return "text-gray-700";
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function ProductAnalyticsDashboard() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [sortKey, setSortKey] = useState("stickyImpressions");
  const [sortDir, setSortDir] = useState("desc");

  // ── Fetch both APIs in parallel ───────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [anaRes, prodRes] = await Promise.all([
        fetch("/api/admin/product-analytics"),
        fetch("/api/products?status=all"),
      ]);
      const [anaMap, prods] = await Promise.all([anaRes.json(), prodRes.json()]);

      // Build lookups from product list
      const nameMap = {};
      const imgMap  = {};
      if (Array.isArray(prods)) {
        prods.forEach((p) => {
          nameMap[p._id] = p.title ?? p.name ?? "Unnamed";
          imgMap[p._id]  = imgSrc((Array.isArray(p.images) ? p.images : [])[0]);
        });
      }

      // Merge analytics + product meta
      const merged = Object.entries(anaMap ?? {}).map(([productId, data]) => ({
        productId,
        name:  nameMap[productId] ?? `…${productId.slice(-6)}`,
        image: imgMap[productId]  ?? "",
        ...data,
      }));

      setRows(merged);
    } catch (err) {
      console.error("[product-analytics-dashboard]", err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── KPI totals ─────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const totalViews  = rows.reduce((s, r) => s + (r.views             ?? 0), 0);
    const totalImp    = rows.reduce((s, r) => s + (r.stickyImpressions ?? 0), 0);
    const totalAdd    = rows.reduce((s, r) => s + (r.stickyAddClicks   ?? 0), 0);
    const totalBuy    = rows.reduce((s, r) => s + (r.stickyBuyClicks   ?? 0), 0);
    const totalOrders = rows.reduce((s, r) => s + (r.orders            ?? 0), 0);
    const totalCTA    = rows.reduce((s, r) => s + (r.ctaClicks         ?? 0), 0);

    const stickyCTR = totalImp > 0
      ? `${(((totalAdd + totalBuy) / totalImp) * 100).toFixed(1)}%` : "0%";
    const convRate  = totalViews > 0
      ? `${((totalOrders / totalViews) * 100).toFixed(1)}%` : "0%";

    return { totalViews, totalImp, stickyCTR, convRate, totalOrders, totalCTA };
  }, [rows]);

  // ── Table — filter + sort (memoised) ─────────────────────────────────────
  const tableRows = useMemo(() => {
    const q        = search.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;

    return [...filtered].sort((a, b) => {
      const av = typeof a[sortKey] === "string" ? parseFloat(a[sortKey]) : (a[sortKey] ?? 0);
      const bv = typeof b[sortKey] === "string" ? parseFloat(b[sortKey]) : (b[sortKey] ?? 0);
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [rows, search, sortKey, sortDir]);

  // ── Chart data — top 10 by impressions (memoised) ────────────────────────
  const chartData = useMemo(() => (
    [...rows]
      .sort((a, b) => (b.stickyImpressions ?? 0) - (a.stickyImpressions ?? 0))
      .slice(0, 10)
      .map((r) => ({
        name:         r.name.length > 13 ? r.name.slice(0, 13) + "…" : r.name,
        "Views":      r.views             ?? 0,
        "CTA Clicks": r.ctaClicks         ?? 0,
        "Orders":     r.orders            ?? 0,
        "Add Clicks": r.stickyAddClicks   ?? 0,
        "Buy Clicks": r.stickyBuyClicks   ?? 0,
        "Sticky CTR": parseFloat(r.totalCTR      ?? "0"),
        "Conv CTR":   parseFloat(r.conversionCTR ?? "0"),
      }))
  ), [rows]);

  // ── Sort handler ──────────────────────────────────────────────────────────
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const COL_DEFS = [
    { key: "name",              label: "Product"        },
    { key: "views",             label: "Views"          },
    { key: "ctaClicks",         label: "CTA Clicks"     },
    { key: "orders",            label: "Orders"         },
    { key: "conversionCTR",     label: "Conv. CTR"      },
    { key: "stickyImpressions", label: "Impressions"    },
    { key: "stickyAddClicks",   label: "Add Clicks"     },
    { key: "stickyBuyClicks",   label: "Buy Clicks"     },
    { key: "totalCTR",          label: "Sticky CTR"     },
    { key: "preferredAction",   label: "Prefers"        },
    { key: "engagementLevel",   label: "Engagement"     },
    { key: "recommendation",    label: "Recommendation" },
  ];

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return <LoadingSkeleton />;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="py-6 space-y-6 max-w-7xl">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Sticky bar performance, engagement levels, and conversion insights
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Page Views"
          value={kpi.totalViews.toLocaleString()}
          sub="Across all products"
          Icon={Eye}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <KpiCard
          label="Sticky Impressions"
          value={kpi.totalImp.toLocaleString()}
          sub="Times bar was shown"
          Icon={Activity}
          iconColor="text-violet-600"
          iconBg="bg-violet-50"
        />
        <KpiCard
          label="Global Sticky CTR"
          value={kpi.stickyCTR}
          sub="(Add + Buy Now) ÷ Impressions"
          Icon={MousePointer}
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
        />
        <KpiCard
          label="Conversion Rate"
          value={kpi.convRate}
          sub={`${kpi.totalOrders.toLocaleString()} orders from ${kpi.totalViews.toLocaleString()} views`}
          Icon={TrendingUp}
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
      </div>

      {/* ── Charts ── */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

          {/* Chart 1 — Sticky CTR per product */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-bold text-gray-800">Sticky CTR per Product</p>
            <p className="text-xs text-gray-400 mt-0.5 mb-4">Top 10 by impressions — higher = bar converts better</p>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 36, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10 }} unit="%" width={35} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="Sticky CTR" fill="#8b5cf6" radius={[4, 4, 0, 0]} unit="%" maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2 — Views → CTA Clicks → Orders funnel */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-bold text-gray-800">Views → Clicks → Orders Funnel</p>
            <p className="text-xs text-gray-400 mt-0.5 mb-4">Identify drop-off points per product</p>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 36, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10 }} width={40} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
                <Bar dataKey="Views"      fill="#93c5fd" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="CTA Clicks" fill="#fbbf24" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Orders"     fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 3 — Sticky Add vs Buy stacked */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 xl:col-span-2">
            <p className="text-sm font-bold text-gray-800">Sticky Bar: Add to Cart vs Buy Now</p>
            <p className="text-xs text-gray-400 mt-0.5 mb-4">
              Stacked — reveals each product's preferred checkout path. Tall orange = Buy Now dominant.
            </p>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 36, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10 }} width={35} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
                <Bar dataKey="Add Clicks" stackId="s" fill="#fbbf24" radius={[0, 0, 0, 0]} maxBarSize={40} />
                <Bar dataKey="Buy Clicks" stackId="s" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Product Table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-gray-800">Product Performance</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {tableRows.length} of {rows.length} products · click any column header to sort
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product name…"
              className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400 transition-colors"
            />
          </div>
        </div>

        {tableRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Package className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">
              {search ? "No products match your search" : "No analytics data yet"}
            </p>
            <p className="text-xs text-gray-300 mt-1">
              {search ? "Try a different search term" : "Data appears once products receive traffic"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  {COL_DEFS.map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="text-left text-[11px] font-semibold text-gray-500 px-4 py-3 cursor-pointer hover:text-gray-800 select-none transition-colors"
                    >
                      <span className="flex items-center">
                        {label}
                        <SortIco col={key} sortKey={sortKey} dir={sortDir} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tableRows.map((r) => {
                  const ctr      = rawCTR(r);
                  const ctrCls   = ctrColor(ctr, r.stickyImpressions ?? 0);
                  const convCls  = parseFloat(r.conversionCTR ?? "0") >= 3 ? "text-green-700 font-bold" : "text-gray-600";

                  return (
                    <tr key={r.productId} className="hover:bg-gray-50/60 transition-colors">

                      {/* Product name + thumbnail */}
                      <td className="px-4 py-3 max-w-[180px]">
                        <div className="flex items-center gap-2">
                          {r.image ? (
                            <img
                              src={r.image}
                              alt={r.name}
                              className="w-7 h-7 rounded-lg object-cover border border-gray-100 shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                              <Package className="w-3.5 h-3.5 text-gray-300" />
                            </div>
                          )}
                          <span className="font-medium text-gray-900 truncate max-w-[130px]">{r.name}</span>
                        </div>
                      </td>

                      {/* Numeric counters */}
                      <td className="px-4 py-3 font-mono text-gray-600">{(r.views             ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">{(r.ctaClicks         ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">{(r.orders            ?? 0).toLocaleString()}</td>
                      <td className={`px-4 py-3 font-mono ${convCls}`}>{r.conversionCTR ?? "0%"}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">{(r.stickyImpressions ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">{(r.stickyAddClicks   ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">{(r.stickyBuyClicks   ?? 0).toLocaleString()}</td>

                      {/* Sticky CTR — colour-coded */}
                      <td className={`px-4 py-3 font-mono ${ctrCls}`}>
                        {r.totalCTR ?? "0%"}
                      </td>

                      {/* Preferred action badge */}
                      <td className="px-4 py-3">
                        {r.preferredAction === "BUY_NOW" ? (
                          <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5 font-bold text-[10px]">
                            <Zap className="w-2.5 h-2.5 shrink-0" /> BUY NOW
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full px-2 py-0.5 font-bold text-[10px]">
                            <ShoppingCart className="w-2.5 h-2.5 shrink-0" /> ADD
                          </span>
                        )}
                      </td>

                      {/* Engagement level */}
                      <td className="px-4 py-3">
                        <EngagBadge level={r.engagementLevel} />
                      </td>

                      {/* Recommendation chip */}
                      <td className="px-4 py-3 max-w-[200px]">
                        {r.recommendation ? (
                          <div className="inline-flex items-start gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-2 py-1 leading-tight">
                            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>{r.recommendation}</span>
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend footer */}
        <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex flex-wrap gap-4 text-[10px] text-gray-400">
          <span><span className="text-green-700 font-bold">Green CTR</span> = above 6 % (high performance)</span>
          <span><span className="text-red-600 font-bold">Red CTR</span> = below 2 % with ≥100 impressions (needs attention)</span>
          <span><span className="text-amber-600 font-bold">Recommendation</span> = auto-generated by insight engine</span>
        </div>
      </div>
    </div>
  );
}
