"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableColumn,
  TableRow,
  TableCell,
  Pagination,
  Spinner,
  Select,
  SelectItem,
} from "@heroui/react";
import {
  Activity,
  Globe,
  TrendingUp,
  MousePointerClick,
  ShoppingCart,
  Eye,
  Users,
  BarChart2,
} from "lucide-react";
import formatDate from "@/utils/formatDate";

const DATE_RANGES = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "all", label: "All time" },
];

function getDateRange(key) {
  const now = new Date();
  if (key === "all") return { startDate: null, endDate: null };
  const days = key === "7d" ? 7 : key === "30d" ? 30 : 90;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return {
    startDate: start.toISOString(),
    endDate: now.toISOString(),
  };
}

function StatCard({ title, value, icon, color, subtitle }) {
  const colorClasses = {
    blue: "text-blue-600 bg-blue-50",
    green: "text-green-600 bg-green-50",
    purple: "text-purple-600 bg-purple-50",
    orange: "text-orange-600 bg-orange-50",
    teal: "text-teal-600 bg-teal-50",
    pink: "text-pink-600 bg-pink-50",
  };
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-xl ${colorClasses[color]} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <p className="text-xs font-medium text-gray-600">{title}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}

export default function TrackingPage() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recentLoading, setRecentLoading] = useState(false);
  const [dateRange, setDateRange] = useState("30d");
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(15);

  const totalPages = Math.ceil(recent.length / rowsPerPage);
  const paginatedRecent = recent.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  useEffect(() => {
    fetchStats();
  }, [dateRange]);

  useEffect(() => {
    fetchRecent();
  }, []);

  const buildQuery = () => {
    const { startDate, endDate } = getDateRange(dateRange);
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    return params.toString();
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const query = buildQuery();
      const res = await fetch(`/api/track?${query}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch tracking stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecent = async () => {
    setRecentLoading(true);
    try {
      const res = await fetch("/api/track?view=recent&limit=100");
      if (res.ok) {
        const data = await res.json();
        setRecent(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch recent events:", err);
    } finally {
      setRecentLoading(false);
    }
  };

  const counts = stats?.counts || {};
  const sessions = stats?.sessions || 0;
  const sources = Array.isArray(stats?.sources) ? stats.sources : [];
  const funnel = Array.isArray(stats?.funnel) ? stats.funnel : [];

  // Sum all event counts
  const totalEvents = Object.values(counts).reduce((s, v) => s + (v || 0), 0);

  // Key events
  const pageViews = counts["page_view"] || counts["pageview"] || counts["view"] || 0;
  const addToCart = counts["add_to_cart"] || counts["addToCart"] || 0;
  const purchases = counts["purchase"] || counts["order"] || counts["checkout_complete"] || 0;
  const productViews = counts["product_view"] || counts["productView"] || 0;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-80px)]">
        <div className="text-center">
          <Spinner color="secondary" variant="gradient" size="md" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-0 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tracking & Analytics</h1>
          <p className="text-gray-600 text-sm mt-1">Visitor behaviour, traffic sources, and conversion funnel.</p>
        </div>
        <div className="w-40">
          <Select
            selectedKeys={[dateRange]}
            onSelectionChange={(keys) => setDateRange([...keys][0] || "30d")}
            size="sm"
            variant="bordered"
            aria-label="Date range"
          >
            {DATE_RANGES.map((r) => (
              <SelectItem key={r.key}>{r.label}</SelectItem>
            ))}
          </Select>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Unique Sessions" value={sessions.toLocaleString()} icon={<Users size={16} />} color="blue" />
        <StatCard title="Total Events" value={totalEvents.toLocaleString()} icon={<Activity size={16} />} color="purple" />
        <StatCard title="Page Views" value={pageViews.toLocaleString()} icon={<Eye size={16} />} color="teal" />
        <StatCard title="Product Views" value={productViews.toLocaleString()} icon={<BarChart2 size={16} />} color="orange" />
        <StatCard title="Add to Cart" value={addToCart.toLocaleString()} icon={<ShoppingCart size={16} />} color="green" />
        <StatCard title="Purchases" value={purchases.toLocaleString()} icon={<TrendingUp size={16} />} color="pink" />
      </div>

      {/* Middle Row: Sources + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Traffic Sources */}
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Globe size={16} className="text-blue-500" />
            Traffic Sources
          </h2>
          {sources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <Globe size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">No traffic source data yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sources.slice(0, 8).map((src, i) => {
                const count = src.count || src._count || 0;
                const maxCount = (sources[0]?.count || sources[0]?._count || 1);
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 font-medium truncate pr-2">{src.source || src.utmSource || "Direct"}</span>
                      <span className="text-gray-500 flex-shrink-0">{count.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Conversion Funnel */}
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-green-500" />
            Conversion Funnel
          </h2>
          {funnel.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <TrendingUp size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">No funnel data yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {funnel.map((step, i) => {
                const count = step.count || step._count || 0;
                const topCount = funnel[0]?.count || funnel[0]?._count || 1;
                const pct = topCount > 0 ? Math.round((count / topCount) * 100) : 0;
                const convFromPrev =
                  i > 0
                    ? Math.round((count / (funnel[i - 1]?.count || funnel[i - 1]?._count || 1)) * 100)
                    : 100;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-medium flex-shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-gray-700 font-medium truncate">{step.event || step.step}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        <span className="text-gray-500">{count.toLocaleString()}</span>
                        {i > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${convFromPrev >= 50 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {convFromPrev}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* All Event Counts */}
      {Object.keys(counts).length > 0 && (
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Activity size={16} className="text-purple-500" />
            Event Breakdown
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Object.entries(counts)
              .sort(([, a], [, b]) => b - a)
              .map(([event, count]) => (
                <div key={event} className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-gray-900">{count.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 truncate mt-1" title={event}>{event}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Recent Events Table */}
      <div className="bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <MousePointerClick size={16} className="text-orange-500" />
            Recent Events
          </h2>
          <span className="text-xs text-gray-500">{recent.length} events</span>
        </div>

        {recentLoading ? (
          <div className="flex justify-center py-10">
            <Spinner color="secondary" variant="gradient" size="sm" />
          </div>
        ) : recent.length === 0 ? (
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-gray-50 rounded-xl">
                <Activity className="w-8 h-8 text-gray-400" />
              </div>
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">No events recorded yet</h3>
            <p className="text-gray-600 text-sm">Events will appear here once visitors start interacting with your store.</p>
          </div>
        ) : (
          <>
            {/* Mobile */}
            <div className="block lg:hidden p-4 space-y-3">
              {paginatedRecent.map((evt, i) => (
                <div key={evt.id || evt._id || i} className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-900 bg-gray-200 px-2 py-0.5 rounded-full">{evt.event}</span>
                    <span className="text-xs text-gray-500">{formatDate(evt.createdAt)}</span>
                  </div>
                  {evt.sessionId && <p className="text-xs text-gray-500 truncate">Session: {evt.sessionId}</p>}
                  {evt.utmSource && <p className="text-xs text-gray-500">Source: {evt.utmSource}</p>}
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden lg:block">
              <Table
                shadow="none"
                aria-label="Recent Events Table"
                classNames={{
                  wrapper: "shadow-none border-none rounded-none",
                  th: "bg-gray-50 text-gray-700 font-medium py-3",
                  td: "py-3",
                }}
                bottomContent={
                  recent.length > rowsPerPage ? (
                    <div className="w-full flex justify-center p-4 border-t border-gray-200">
                      <Pagination isCompact showControls color="primary" page={page} total={totalPages} onChange={setPage} />
                    </div>
                  ) : null
                }
              >
                <TableHeader>
                  <TableColumn>Event</TableColumn>
                  <TableColumn className="hidden md:table-cell">Session</TableColumn>
                  <TableColumn className="hidden lg:table-cell">Source</TableColumn>
                  <TableColumn className="hidden xl:table-cell">Product</TableColumn>
                  <TableColumn>Date</TableColumn>
                </TableHeader>
                <TableBody>
                  {paginatedRecent.map((evt, i) => (
                    <TableRow key={evt.id || evt._id || i} className="hover:bg-gray-50">
                      <TableCell>
                        <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">
                          {evt.event}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-xs text-gray-500 font-mono">
                          {evt.sessionId ? evt.sessionId.slice(0, 12) + "…" : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-gray-600">
                        {evt.utmSource || evt.campaignSource || "—"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-sm text-gray-600">
                        {evt.productId ? evt.productId.slice(0, 8) + "…" : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{formatDate(evt.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Pagination */}
            {recent.length > rowsPerPage && (
              <div className="block lg:hidden p-4 border-t border-gray-200">
                <Pagination isCompact showControls color="primary" page={page} total={totalPages} onChange={setPage} className="flex justify-center" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
