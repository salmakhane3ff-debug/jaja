import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-4xl mb-4">🔍</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">المنتج غير موجود</h1>
        <p className="text-gray-500 text-sm mb-6">هذا المنتج غير متاح أو تم حذفه.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-400 text-white rounded-2xl font-semibold text-sm hover:bg-amber-500 transition-colors"
        >
          <Home className="w-4 h-4" />
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}
