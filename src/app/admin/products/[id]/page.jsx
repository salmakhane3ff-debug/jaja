"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, CheckCircle, XCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import ProductForm from "../_ProductForm";

export default function EditProductPage() {
  const { id } = useParams();

  const [product,  setProduct]  = useState(null);
  const [fetching, setFetching] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [success,  setSuccess]  = useState(false);

  // ── Fetch product ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    fetch(`/api/product/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => {
        if (d) setProduct(d);
      })
      .catch(() => setNotFound(true))
      .finally(() => setFetching(false));
  }, [id]);

  // ── Submit handler ───────────────────────────────────────────────────────────
  const handleSubmit = async (fields) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/product", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ _id: id, ...fields }),
      });

      if (res.ok) {
        setSuccess(true);
        // refresh product data so form reflects saved values
        const updated = await res.json().catch(() => null);
        if (updated) setProduct(updated);
        setTimeout(() => setSuccess(false), 4000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `خطأ في الخادم (${res.status})`);
      }
    } catch {
      setError("فشل الاتصال بالخادم. تحقق من اتصالك وحاول مجدداً.");
    } finally {
      setLoading(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (fetching) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────
  if (notFound || !product) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-gray-500 text-sm">المنتج غير موجود أو تم حذفه.</p>
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:underline"
        >
          <ArrowRight className="w-4 h-4" />
          العودة إلى المنتجات
        </Link>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="py-6 max-w-2xl space-y-5">

      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/products"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          رجوع
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900 truncate">
          {product.title || "تعديل المنتج"}
        </h1>
      </div>

      {/* Success banner */}
      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm text-green-700">
          <CheckCircle className="w-4 h-4 shrink-0" />
          تم حفظ التعديلات بنجاح.
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Form */}
      <ProductForm
        initial={{
          title:            product.title            ?? "",
          slug:             product.slug             ?? "",
          shortDescription: product.shortDescription ?? "",
          description:      product.description      ?? "",
          regularPrice:     product.regularPrice     ?? "",
          salePrice:        product.salePrice        ?? "",
          stockQuantity:    product.stockQuantity     ?? "",
          stockStatus:      product.stockStatus      ?? "In Stock",
          sku:              product.sku              ?? "",
          status:           product.status           ?? "Active",
          images:           Array.isArray(product.images)   ? product.images   : [],
          variants:         Array.isArray(product.variants) ? product.variants : [],
          // ── New control fields ────────────────────────────────────────────
          redirectMode:     product.redirectMode     ?? "default",
          redirectUrl:      product.redirectUrl      ?? "",
          allowCOD:         product.allowCOD         !== false,
          allowPrepaid:     product.allowPrepaid     !== false,
        }}
        onSubmit={handleSubmit}
        loading={loading}
        submitLabel="حفظ التعديلات"
      />
    </div>
  );
}
