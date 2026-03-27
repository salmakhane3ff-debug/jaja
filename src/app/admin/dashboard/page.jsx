"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@heroui/react";
import {
  Users,
  MousePointerClick,
  Star,
  Layout,
  TrendingUp,
  Eye,
  MessageSquare,
  UserCheck,
  Activity,
  Globe,
} from "lucide-react";
import Link from "next/link";
import formatDate from "@/utils/formatDate";

function StatCard({ title, value, icon, color, subtitle, href }) {
  const colorClasses = {
    blue: "text-blue-600 bg-blue-50",
    green: "text-green-600 bg-green-50",
    purple: "text-purple-600 bg-purple-50",
    orange: "text-orange-600 bg-orange-50",
    pink: "text-pink-600 bg-pink-50",
    teal: "text-teal-600 bg-teal-50",
  };

  const card = (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 cursor-pointer">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl ${colorClasses[color]} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
    </div>
  );

  return href ? <Link href={href}>{card}</Link> : card;
}

export default function OverviewDashboard() {
  const [loading, setLoading] = useState(true);
  const [affiliates, setAffiliates] = useState([]);
  const [landingPages, setLandingPages] = useState([]);
  const [tracking, setTracking] = useState(null);
  const [feedback, setFeedback] = useState([]);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [affRes, lpRes, trackRes, fbRes] = await Promise.all([
          fetch("/api/affiliate"),
          fetch("/api/landing-page?admin=true"),
          fetch("/api/track"),
          fetch("/api/feedback?admin=true"),
        ]);

        const [affData, lpData, trackData, fbData] = await Promise.all([
          affRes.ok ? affRes.json() : [],
          lpRes.ok ? lpRes.json() : [],
          trackRes.ok ? trackRes.json() : null,
          fbRes.ok ? fbRes.json() : [],
        ]);

        setAffiliates(Array.isArray(affData) ? affData : []);
        setLandingPages(Array.isArray(lpData) ? lpData : []);
        setTracking(trackData);
        setFeedback(Array.isArray(fbData) ? fbData : []);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-80px)]">
        <div className="text-center">
          <Spinner color="secondary" variant="gradient" size="md" />
        </div>
      </div>
    );
  }

  const totalAffiliateClicks = affiliates.reduce((s, a) => s + (a.clicks || 0), 0);
  const totalAffiliateConversions = affiliates.reduce((s, a) => s + (a.conversions || 0), 0);
  const activeLandingPages = landingPages.filter((lp) => lp.isActive).length;
  const totalLandingPageViews = landingPages.reduce((s, lp) => s + (lp.views || 0), 0);
  const pendingFeedback = feedback.filter((f) => f.status === "PENDING").length;
  const approvedFeedback = feedback.filter((f) => f.status === "APPROVED").length;
  const totalSessions = tracking?.sessions || 0;

  // Traffic sources
  const sources = Array.isArray(tracking?.sources) ? tracking.sources.slice(0, 5) : [];

  // Funnel
  const funnel = Array.isArray(tracking?.funnel) ? tracking.funnel : [];

  // Event counts
  const counts = tracking?.counts || {};

  // Recent feedback
  const recentFeedback = [...feedback]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  return (
    <div className="space-y-6 p-6 bg-gray-50/30 min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Growth Overview 🚀</h1>
            <p className="text-indigo-100 text-sm sm:text-base">
              Affiliate, landing pages, tracking, and feedback at a glance.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2 backdrop-blur-sm">
            <Activity size={16} />
            <span className="text-sm">{new Date().toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Affiliates"
          value={affiliates.length}
          icon={<Users size={20} />}
          color="blue"
          subtitle={`${totalAffiliateConversions} conversions`}
          href="/admin/affiliate"
        />
        <StatCard
          title="Affiliate Clicks"
          value={totalAffiliateClicks.toLocaleString()}
          icon={<MousePointerClick size={20} />}
          color="purple"
          subtitle="All time"
          href="/admin/affiliate"
        />
        <StatCard
          title="Landing Pages"
          value={landingPages.length}
          icon={<Layout size={20} />}
          color="orange"
          subtitle={`${activeLandingPages} active`}
          href="/admin/landing-pages"
        />
        <StatCard
          title="Page Views"
          value={totalLandingPageViews.toLocaleString()}
          icon={<Eye size={20} />}
          color="teal"
          subtitle="Landing pages total"
          href="/admin/landing-pages"
        />
        <StatCard
          title="Unique Sessions"
          value={totalSessions.toLocaleString()}
          icon={<Globe size={20} />}
          color="green"
          subtitle="From tracking"
          href="/admin/tracking"
        />
        <StatCard
          title="Feedback"
          value={feedback.length}
          icon={<Star size={20} />}
          color="pink"
          subtitle={`${pendingFeedback} pending review`}
          href="/admin/feedback"
        />
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Traffic Sources */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900">Traffic Sources</h2>
            <Link href="/admin/tracking" className="text-xs text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          {sources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <TrendingUp size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">No traffic data yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sources.map((src, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700 truncate">{src.source || "Direct"}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 ml-2">{src.count || src._count || 0}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Conversion Funnel */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900">Conversion Funnel</h2>
            <Link href="/admin/tracking" className="text-xs text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          {funnel.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <Activity size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">No funnel data yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {funnel.map((step, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span className="truncate pr-2">{step.event || step.step}</span>
                    <span className="font-semibold text-gray-900">{step.count || step._count || 0}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          funnel[0]?.count || funnel[0]?._count
                            ? (((step.count || step._count || 0) / (funnel[0].count || funnel[0]._count || 1)) * 100)
                            : 0
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Feedback Summary */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900">Feedback Summary</h2>
            <Link href="/admin/feedback" className="text-xs text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-3 mb-4">
            {[
              { label: "Approved", count: approvedFeedback, color: "bg-green-500" },
              { label: "Pending", count: pendingFeedback, color: "bg-yellow-500" },
              { label: "Rejected", count: feedback.filter((f) => f.status === "REJECTED").length, color: "bg-red-500" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${item.color}`} />
                  <span className="text-sm text-gray-700">{item.label}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{item.count}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-500">
              Avg rating:{" "}
              <span className="font-semibold text-gray-900">
                {feedback.length > 0
                  ? (feedback.reduce((s, f) => s + (f.rating || 0), 0) / feedback.length).toFixed(1)
                  : "—"}
                ★
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Top Affiliates */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900">Top Affiliates</h2>
            <Link href="/admin/affiliate" className="text-xs text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          {affiliates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <UserCheck size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">No affiliates yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...affiliates]
                .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
                .slice(0, 5)
                .map((aff) => (
                  <div key={aff.id || aff._id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                      {aff.username?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">@{aff.username}</p>
                      <p className="text-xs text-gray-500">{aff.commissionRate || 0}% commission</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{(aff.clicks || 0).toLocaleString()}</p>
                      <p className="text-xs text-gray-500">clicks</p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Recent Feedback */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900">Recent Feedback</h2>
            <Link href="/admin/feedback" className="text-xs text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          {recentFeedback.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <MessageSquare size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">No feedback yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentFeedback.map((fb) => (
                <div key={fb.id || fb._id} className="p-3 rounded-xl bg-gray-50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{fb.authorName || "Anonymous"}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-yellow-500 text-xs">{"★".repeat(Math.min(fb.rating || 0, 5))}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          fb.status === "APPROVED"
                            ? "bg-green-100 text-green-700"
                            : fb.status === "REJECTED"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {fb.status}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2">{fb.textContent || "—"}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(fb.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
