"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Pencil, EyeOff, RotateCw } from "lucide-react";
import CustomButton from "@/components/block/CustomButton";
import Empty from "@/components/block/Empty";

// Arabic labels for each machine reason emitted by src/lib/duplicates.js.
const REASON_LABEL = {
  identical_title:               "عنوان مطابق",
  identical_sku:                 "SKU مطابق",
  identical_barcode:             "باركود مطابق",
  normalized_title:              "عنوان متطابق بعد التنسيق",
  same_first_image:              "نفس الصورة الأولى",
  same_brand_collections_price:  "نفس العلامة والمجموعات وسعر مقارب",
};

const CONFIDENCE_META = {
  high:   { label: "مؤكد",  cls: "bg-red-50 text-red-700 border-red-200" },
  medium: { label: "محتمل", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  low:    { label: "ضعيف",  cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

// Mirrors the badge on the Products page — same classes, no redesign.
function StatusBadge({ status }) {
  const active = (status || "").toLowerCase() === "active";
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border
      ${active
        ? "bg-green-50 text-green-700 border-green-200"
        : "bg-gray-100 text-gray-500 border-gray-200"}`}>
      {active ? "نشط" : "غير نشط"}
    </span>
  );
}

function ConfidenceBadge({ confidence }) {
  const meta = CONFIDENCE_META[confidence] || CONFIDENCE_META.low;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

function firstImage(product) {
  const first = Array.isArray(product.images) ? product.images[0] : null;
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && first.url) return first.url;
  return "https://placehold.co/80x80?text=No+Image";
}

const fmtDate = (d) => {
  try { return new Date(d).toLocaleDateString("fr-FR"); } catch { return ""; }
};

function ProductRow({ product, currency }) {
  const price = product.salePrice || product.regularPrice || 0;
  return (
    <div className="flex items-center gap-3 p-2 rounded-xl border border-gray-100 bg-gray-50/50">
      <img
        src={firstImage(product)}
        alt={product.title}
        loading="lazy"
        className="w-14 h-14 rounded-lg object-cover bg-gray-100 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 truncate">{product.title}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs font-bold text-gray-700">{price} {currency}</span>
          <StatusBadge status={product.status} />
          <span className="text-[11px] text-gray-400">{fmtDate(product.createdAt)}</span>
          {product.sku ? <span className="text-[11px] text-gray-400">SKU: {product.sku}</span> : null}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <CustomButton
          as={Link} href={`/products/${product._id || product.id}`} target="_blank"
          intent="secondary" size="sm" tooltip="فتح صفحة المنتج"
          startContent={<ExternalLink className="w-3.5 h-3.5" />}
        >
          فتح
        </CustomButton>
        <CustomButton
          as={Link}
          href={{ pathname: "/admin/products/new", query: { productId: product._id || product.id, isUpdate: true } }}
          intent="secondary" size="sm" tooltip="تعديل المنتج"
          startContent={<Pencil className="w-3.5 h-3.5" />}
        >
          تعديل
        </CustomButton>
      </div>
    </div>
  );
}

export default function DuplicatesPage() {
  const [groups,    setGroups]    = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [ignoring,  setIgnoring]  = useState(null);

  const [confidence, setConfidence] = useState("");
  const [collection, setCollection] = useState("");
  const [brand,      setBrand]      = useState("");
  const [status,     setStatus]     = useState("");

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (confidence) params.set("confidence", confidence);
      if (collection) params.set("collection", collection);
      if (brand)      params.set("brand", brand);
      if (status)     params.set("status", status);
      const r = await fetch(`/api/admin/duplicates?${params.toString()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setGroups(Array.isArray(d.groups) ? d.groups : []);
      setTruncated(Boolean(d.truncated));
    } catch (e) {
      setError(e?.message || "failed");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [confidence, collection, brand, status]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // Ignore is idempotent server-side (unique groupKey + upsert), so a double
  // click cannot create a second record. Drop the group locally on success.
  const handleIgnore = async (group) => {
    setIgnoring(group.groupKey);
    try {
      const r = await fetch("/api/admin/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupKey:    group.groupKey,
          fingerprint: group.fingerprint,
          productIds:  group.products.map((p) => p._id || p.id),
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setGroups((prev) => prev.filter((g) => g.groupKey !== group.groupKey));
    } catch {
      setError("تعذر تجاهل المجموعة");
    } finally {
      setIgnoring(null);
    }
  };

  // Filter options come from what is actually on screen — no extra fetch.
  const brandOptions = useMemo(() => {
    const s = new Set();
    groups.forEach((g) => g.products.forEach((p) => p.brand && s.add(p.brand)));
    return [...s].sort();
  }, [groups]);

  const collectionOptions = useMemo(() => {
    const s = new Set();
    groups.forEach((g) => g.products.forEach((p) =>
      Array.isArray(p.collections) && p.collections.forEach((c) => typeof c === "string" && c.trim() && s.add(c))));
    return [...s].sort();
  }, [groups]);

  const selectCls = "text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white min-w-[140px]";

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-full">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-row sm:items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المنتجات المكررة</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? "جاري الفحص..." : `${groups.length} مجموعة محتملة — للمراجعة فقط`}
          </p>
        </div>
        <CustomButton
          onPress={fetchGroups} intent="secondary" size="sm"
          startContent={<RotateCw className="w-4 h-4" />} tooltip="إعادة الفحص"
        >
          إعادة الفحص
        </CustomButton>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap bg-white rounded-2xl border border-gray-100 p-3">
        <select value={confidence} onChange={(e) => setConfidence(e.target.value)} className={selectCls}>
          <option value="">كل المستويات</option>
          <option value="high">مؤكد</option>
          <option value="medium">محتمل</option>
          <option value="low">ضعيف</option>
        </select>
        <select value={collection} onChange={(e) => setCollection(e.target.value)} className={selectCls}>
          <option value="">كل المجموعات</option>
          {collectionOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} className={selectCls}>
          <option value="">كل العلامات</option>
          {brandOptions.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="">كل الحالات</option>
          <option value="Active">نشط</option>
          <option value="Inactive">غير نشط</option>
        </select>
      </div>

      {truncated && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
          تم عرض أول 500 مجموعة فقط. عالج هذه المجموعات ثم أعد الفحص.
        </p>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-sm text-red-700">تعذر تحميل المنتجات المكررة.</p>
          <CustomButton onPress={fetchGroups} intent="secondary" size="sm">إعادة المحاولة</CustomButton>
        </div>
      )}

      {/* ── Groups ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse space-y-3">
              <div className="h-4 w-32 bg-gray-100 rounded" />
              <div className="h-16 bg-gray-50 rounded-xl" />
              <div className="h-16 bg-gray-50 rounded-xl" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 && !error ? (
        <Empty title="لا توجد منتجات مكررة" description="لم يتم العثور على أي مجموعة مكررة بهذه الفلاتر." />
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.groupKey} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              {/* Group header: confidence + reasons */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Copy className="w-4 h-4 text-gray-400" />
                  <ConfidenceBadge confidence={group.confidence} />
                  <span className="text-xs text-gray-400">{group.products.length} منتجات</span>
                  {group.reasons.map((r) => (
                    <span key={r} className="text-[11px] text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">
                      {REASON_LABEL[r] || r}
                    </span>
                  ))}
                </div>
                <CustomButton
                  onPress={() => handleIgnore(group)}
                  isLoading={ignoring === group.groupKey}
                  intent="secondary" size="sm"
                  startContent={<EyeOff className="w-3.5 h-3.5" />}
                  tooltip="تجاهل هذه المجموعة (ستظهر مجددا إذا تغير أحد المنتجات)"
                >
                  تجاهل
                </CustomButton>
              </div>

              {/* Members */}
              <div className="space-y-2">
                {group.products.map((p) => (
                  <ProductRow key={p._id || p.id} product={p} currency={p.currencySymbol || "MAD"} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
