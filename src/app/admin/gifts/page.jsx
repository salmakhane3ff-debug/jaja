"use client";

import { useState, useEffect } from "react";
import { Gift, Plus, Trash2, ToggleLeft, ToggleRight, PackageOpen } from "lucide-react";

const CURRENCY = "MAD";

export default function AdminGiftsPage() {
  const [gifts, setGifts]       = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState(null);

  // New gift form state
  const [form, setForm] = useState({
    productId: "",
    thresholdAmount: "",
    active: true,
  });

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [giftsRes, productsRes] = await Promise.all([
          fetch("/api/gifts"),
          fetch("/api/product"),
        ]);
        if (giftsRes.ok)    setGifts(await giftsRes.json());
        if (productsRes.ok) setProducts(await productsRes.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const getProduct = (productId) =>
    products.find((p) => p._id === productId || p.id === productId);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.productId || !form.thresholdAmount) return;
    setSaving(true);
    try {
      const res = await fetch("/api/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      const newGift = await res.json();
      setGifts((prev) => [...prev, newGift].sort((a, b) => a.thresholdAmount - b.thresholdAmount));
      setForm({ productId: "", thresholdAmount: "", active: true });
      showToast("Gift added successfully");
    } catch {
      showToast("Failed to add gift", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (gift) => {
    try {
      const res = await fetch(`/api/gifts/${gift.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...gift, active: !gift.active }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setGifts((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      showToast(updated.active ? "Gift enabled" : "Gift disabled");
    } catch {
      showToast("Failed to update gift", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this gift rule?")) return;
    try {
      const res = await fetch(`/api/gifts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setGifts((prev) => prev.filter((g) => g.id !== id));
      showToast("Gift deleted");
    } catch {
      showToast("Failed to delete gift", "error");
    }
  };

  const getProductImage = (productId) => {
    const p = getProduct(productId);
    if (!p) return null;
    const img = p.images;
    if (!img) return null;
    if (Array.isArray(img)) {
      const first = img[0];
      return first?.url || first?.src || (typeof first === "string" ? first : null);
    }
    return typeof img === "string" ? img : null;
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.type === "error"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-green-50 text-green-700 border border-green-200"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-pink-100 rounded-xl flex items-center justify-center">
          <Gift className="w-5 h-5 text-pink-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Gift System</h1>
          <p className="text-sm text-gray-500">
            Automatically add free gifts when customers reach a cart threshold
          </p>
        </div>
      </div>

      {/* Add Gift Form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Plus className="w-4 h-4 text-pink-500" /> Add Gift Rule
        </h2>

        <form onSubmit={handleAdd} className="space-y-4">
          {/* Product selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Gift Product
            </label>
            <select
              value={form.productId}
              onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent"
            >
              <option value="">— Select a product —</option>
              {products
                .filter((p) => p.status === "Active" || p.isActive)
                .map((p) => (
                  <option key={p._id || p.id} value={p._id || p.id}>
                    {p.title}
                  </option>
                ))}
            </select>
          </div>

          {/* Threshold */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Minimum Cart Total ({CURRENCY})
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                step="1"
                value={form.thresholdAmount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, thresholdAmount: e.target.value }))
                }
                required
                placeholder="e.g. 500"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
                {CURRENCY}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Gift is added to cart when customer&apos;s cart subtotal reaches this
              amount.
            </p>
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
              className="flex items-center gap-2 text-sm text-gray-600"
            >
              {form.active ? (
                <ToggleRight className="w-6 h-6 text-green-500" />
              ) : (
                <ToggleLeft className="w-6 h-6 text-gray-300" />
              )}
              {form.active ? "Enabled" : "Disabled"}
            </button>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-pink-600 hover:bg-pink-700 disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
          >
            {saving ? "Adding…" : "Add Gift Rule"}
          </button>
        </form>
      </div>

      {/* Gift List */}
      <div className="space-y-3">
        <h2 className="font-semibold text-gray-800">
          Active Gift Rules ({gifts.length})
        </h2>

        {gifts.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-10 text-center">
            <PackageOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              No gift rules yet. Add one above.
            </p>
          </div>
        ) : (
          gifts.map((gift) => {
            const product = getProduct(gift.productId);
            const imgUrl  = getProductImage(gift.productId);
            return (
              <div
                key={gift.id}
                className={`bg-white border rounded-2xl p-4 shadow-sm flex items-center gap-4 transition-opacity ${
                  gift.active ? "border-gray-200" : "border-gray-100 opacity-60"
                }`}
              >
                {/* Product image */}
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-100">
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={product?.title || "Gift"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Gift className="w-6 h-6 text-gray-300" />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {product?.title || gift.productId}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs bg-pink-50 text-pink-700 px-2 py-0.5 rounded-full font-medium">
                      🎁 Free Gift
                    </span>
                    <span className="text-xs text-gray-500">
                      Unlocks at {gift.thresholdAmount} {CURRENCY}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleToggle(gift)}
                    title={gift.active ? "Disable" : "Enable"}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {gift.active ? (
                      <ToggleRight className="w-5 h-5 text-green-500" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-gray-300" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(gift.id)}
                    title="Delete"
                    className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-800 space-y-1.5">
        <p className="font-semibold">How it works</p>
        <ul className="space-y-1 text-blue-700 text-xs list-disc list-inside">
          <li>
            When the customer&apos;s cart subtotal reaches the threshold, the gift
            is automatically added at price 0.
          </li>
          <li>
            If the customer removes items and the subtotal drops below the
            threshold, the gift is removed automatically.
          </li>
          <li>
            Multiple thresholds are supported (e.g. Gift A at 500 {CURRENCY}, Gift
            B at 1000 {CURRENCY}).
          </li>
          <li>
            The gift appears in both the mini-cart and the full cart page with a
            &quot;Free Gift&quot; label.
          </li>
        </ul>
      </div>
    </div>
  );
}
