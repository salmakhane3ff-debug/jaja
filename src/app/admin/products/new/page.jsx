"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import ProductForm from "../_ProductForm";

export default function NewProductPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const handleSubmit = async (fields) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/product", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(fields),
      });

      if (res.ok) {
        router.push("/admin/products");
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
        <h1 className="text-xl font-bold text-gray-900">إضافة منتج جديد</h1>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Form */}
      <ProductForm
        onSubmit={handleSubmit}
        loading={loading}
        submitLabel="إنشاء المنتج"
      />
    </div>
  );
}
