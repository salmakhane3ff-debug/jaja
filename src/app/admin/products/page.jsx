"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Edit3, Package, Loader2, TrendingUp, AlertCircle } from "lucide-react";
import Link from "next/link";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-MA", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function imgSrc(v) {
  if (!v) return "";
  return typeof v === "string" ? v : v.url || v.src || "";
}

function StatusBadge({ status }) {
  const active = (status || "").toLowerCase() !== "inactive";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
      active ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-500 border border-gray-200"
    }`}>
      {active ? "نشط" : "غير نشط"}
    </span>
  );
}

const LEVEL_META = {
  HIGH:              { label: "HIGH",    bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200" },
  MEDIUM:            { label: "MED",     bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  LOW:               { label: "LOW",     bg: "bg-red-50",    text: "text-red-600",    border: "border-red-200" },
  INSUFFICIENT_DATA: { label: "—",       bg: "bg-gray-50",   text: "text-gray-400",   border: "border-gray-100" },
};

function EngagementBadge({ level }) {
  const m = LEVEL_META[level] ?? LEVEL_META.INSUFFICIENT_DATA;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${m.bg} ${m.text} ${m.border}`}>
      {m.label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProductsListPage() {
  const router = useRouter();

  const [products,   setProducts]   = useState([]);
  const [analytics,  setAnalytics]  = useState({});
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/product?status=all").then((r) => r.json()).catch(() => []),
      fetch("/api/admin/product-analytics").then((r) => r.json()).catch(() => ({})),
    ]).then(([prods, ana]) => {
      setProducts(Array.isArray(prods) ? prods : []);
      setAnalytics(ana && typeof ana === "object" ? ana : {});
    }).finally(() => setLoading(false));
  }, []);

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.title?.toLowerCase().includes(q) || (p.slug || "").toLowerCase().includes(q)
    );
  }, [products, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="py-6 space-y-5 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المنتجات</h1>
          <p className="text-sm text-gray-500 mt-0.5">{displayed.length} من {products.length} منتج</p>
        </div>
        <Link href="/admin/products/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold rounded-xl transition-colors">
          <Plus className="w-4 h-4" />
          منتج جديد
        </Link>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="relative max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالعنوان أو Slug..."
            className="w-full pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 bg-gray-50" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Package className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">لا توجد منتجات</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["الصورة", "العنوان", "Slug", "السعر", "المخزون", "الحالة", "التحليلات", "التاريخ", "إجراءات"].map((h) => (
                    <th key={h} className="text-right text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayed.map((p) => {
                  const thumb  = imgSrc((Array.isArray(p.images) ? p.images : [])[0]);
                  const price  = p.salePrice || p.regularPrice;
                  const stock  = p.stockQuantity;
                  const ana    = analytics[p._id] ?? null;

                  return (
                    <tr key={p._id} className="hover:bg-gray-50 transition-colors">

                      {/* Image */}
                      <td className="px-4 py-3">
                        {thumb ? (
                          <img src={thumb} alt={p.title} className="w-10 h-10 rounded-xl object-cover border border-gray-100" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                            <Package className="w-4 h-4 text-gray-300" />
                          </div>
                        )}
                      </td>

                      {/* Title */}
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="font-medium text-gray-900 truncate">{p.title}</p>
                        {p.shortDescription && <p className="text-xs text-gray-400 truncate">{p.shortDescription}</p>}
                      </td>

                      {/* Slug */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-gray-500">{p.slug || "—"}</span>
                      </td>

                      {/* Price */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-semibold text-gray-900">
                          {price != null ? `${Number(price).toFixed(0)} MAD` : "—"}
                        </span>
                        {p.salePrice && p.regularPrice > p.salePrice && (
                          <span className="block text-xs text-gray-400 line-through">
                            {Number(p.regularPrice).toFixed(0)} MAD
                          </span>
                        )}
                      </td>

                      {/* Stock */}
                      <td className="px-4 py-3">
                        {stock != null ? (
                          <span className={`text-sm font-medium ${stock === 0 ? "text-red-500" : "text-gray-700"}`}>{stock}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">{p.stockStatus === "In Stock" ? "متوفر" : "غير متوفر"}</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>

                      {/* Analytics */}
                      <td className="px-4 py-3">
                        {ana ? (
                          <div className="flex flex-col gap-1 min-w-[120px]">
                            <div className="flex items-center gap-1.5">
                              <EngagementBadge level={ana.engagementLevel} />
                              <span className="text-xs text-gray-500 font-mono">{ana.totalCTR}</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <TrendingUp className="w-3 h-3 shrink-0" />
                              <span>{(ana.stickyImpressions ?? 0).toLocaleString()} imp</span>
                            </div>
                            {ana.recommendation && (
                              <div className="flex items-start gap-1 text-xs text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 max-w-[160px]">
                                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                                <span className="leading-tight">{ana.recommendation}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-gray-400">{fmtDate(p.createdAt)}</span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <button onClick={() => router.push(`/admin/products/${p._id}`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors whitespace-nowrap">
                          <Edit3 className="w-3.5 h-3.5" />
                          تعديل
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
