"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Users, ShoppingBag, DollarSign, TrendingUp,
  Bell, LogOut, RefreshCw, Copy, Check, Loader2,
  ChevronDown, AlertCircle, Package, Truck,
  XCircle, CheckCircle, Building2, CreditCard,
  Target, Star, UserPlus, Eye, AlertTriangle, Settings,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n) {
  if (n == null || isNaN(n)) return "—";
  return `${Number(n).toFixed(0)} MAD`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function authHeaders() {
  const token = localStorage.getItem("affiliateToken") || "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending:   { label: "En attente",  cls: "bg-yellow-100 text-yellow-700" },
  confirmed: { label: "Confirmée",   cls: "bg-blue-100   text-blue-700"   },
  shipped:   { label: "En livraison",cls: "bg-purple-100 text-purple-700" },
  delivered: { label: "Livrée",      cls: "bg-green-100  text-green-700"  },
  cancelled: { label: "Annulée",     cls: "bg-red-100    text-red-700"    },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>{cfg.label}</span>;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = "gray" }) {
  const colors = {
    gray:   "bg-gray-100   text-gray-700",
    blue:   "bg-blue-50    text-blue-600",
    green:  "bg-green-50   text-green-600",
    purple: "bg-purple-50  text-purple-600",
    red:    "bg-red-50     text-red-600",
    amber:  "bg-amber-50   text-amber-600",
    teal:   "bg-teal-50    text-teal-600",
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2.5">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-4.5 h-4.5 w-[18px] h-[18px]" />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-1">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function Section({ title, children, icon: Icon }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60 flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-gray-500" />}
        <h2 className="text-sm font-bold text-gray-700">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ progress, target, remaining, validReferrals }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-gray-700">Parrainages valides</span>
        <span className="font-bold text-gray-900">{validReferrals} / {target}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="font-medium text-blue-600">{progress}% complété</span>
        {remaining > 0 ? (
          <span>{remaining} parrainage{remaining !== 1 ? "s" : ""} valide{remaining !== 1 ? "s" : ""} restant{remaining !== 1 ? "s" : ""}</span>
        ) : (
          <span className="text-green-600 font-semibold">✓ Objectif atteint !</span>
        )}
      </div>
    </div>
  );
}

// ── Copy helper ───────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copier" }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all
        ${copied ? "bg-green-600 text-white" : "bg-gray-900 hover:bg-gray-800 text-white"}`}
    >
      {copied ? <><Check className="w-3 h-3" />Copié</> : <><Copy className="w-3 h-3" />{label}</>}
    </button>
  );
}

// ── Product preview (Part 7 — multi-item inline summary) ──────────────────────

function productPreview(order) {
  const items = order.orderItems;
  if (!items || items.length === 0) return order.productTitle || '—';
  if (items.length === 1) {
    const { productName, quantity } = items[0];
    return quantity > 1 ? `${productName} ×${quantity}` : (productName || order.productTitle || '—');
  }
  const { productName, quantity } = items[0];
  const rest = items.length - 1;
  return `${productName} ×${quantity} + ${rest} autre${rest > 1 ? 's' : ''}`;
}

// ── Phone formatter (+212XXXXXXXXX) ──────────────────────────────────────────

function formatPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('212')) return '+' + digits;
  if (digits.startsWith('0'))   return '+212' + digits.slice(1);
  return '+212' + digits;
}

// ── Order details modal — call-center style (Parts 2–5) ───────────────────────

function OrderDetailsModal({ order, onClose, onStatusChange, updatingOrder }) {
  if (!order) return null;

  // shippingAddress shape: { name, phone, address: { city, address1 } }
  const shipping  = (order.shippingAddress && typeof order.shippingAddress === 'object')
    ? order.shippingAddress : {};
  const addrObj   = (shipping.address && typeof shipping.address === 'object')
    ? shipping.address : shipping;
  const phone     = formatPhone(order.clientPhone || shipping.phone);
  const waPhone   = phone?.replace('+', '') || null;
  const city      = addrObj.city  || addrObj.state  || null;
  const addrLine  = [addrObj.address1, addrObj.address2].filter(Boolean).join(', ') || null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Détails de la commande</h3>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              {order.orderId ? `#${order.orderId.slice(0, 8).toUpperCase()}` : 'ID non lié'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <XCircle className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1">

          {/* Client info — Parts 2 & 3 */}
          <div className="px-5 py-4 border-b border-gray-100 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-gray-900">{order.clientName || '—'}</p>
                {city     && <p className="text-xs text-gray-500">📍 {city}</p>}
                {addrLine && <p className="text-xs text-gray-400">{addrLine}</p>}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <StatusBadge status={order.status} />
                <span className="text-[10px] text-gray-400">{fmtDate(order.createdAt)}</span>
              </div>
            </div>

            {/* Phone + action buttons — Part 3 & 4 */}
            {phone && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg">
                  {phone}
                </span>
                <a
                  href={`tel:${phone}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors"
                >
                  📞 Appeler
                </a>
                <a
                  href={`https://wa.me/${waPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-xl transition-colors"
                >
                  💬 WhatsApp
                </a>
              </div>
            )}
          </div>

          {/* Products list */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
              📦 المنتجات
            </p>
            <div className="space-y-2">
              {order.orderItems && order.orderItems.length > 0 ? (
                order.orderItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 px-3 bg-gray-50 rounded-xl">
                    {item.productImage ? (
                      <img
                        src={item.productImage}
                        alt={item.productName}
                        className="w-12 h-12 rounded-xl object-cover shrink-0 border border-gray-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gray-200 flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 leading-snug">{item.productName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">×{item.quantity} — {fmtMoney(item.price)} / u</p>
                    </div>
                    <p className="text-sm font-bold text-gray-800 whitespace-nowrap shrink-0">
                      {fmtMoney(item.price * item.quantity)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="py-2.5 px-3 bg-gray-50 rounded-xl text-sm text-gray-700">
                  {order.productTitle || '—'}
                </div>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="px-5 py-4 border-t border-gray-100 mt-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-900">Total commande</span>
              <span className="text-base font-black text-gray-900">{fmtMoney(order.total)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Commission affilié</span>
              <span className="text-sm font-bold text-green-700">{fmtMoney(order.commissionAmount)}</span>
            </div>
          </div>
        </div>

        {/* ── Confirm / Cancel actions — Part 5 ── */}
        {onStatusChange && (order.status === 'pending' || order.status === 'shipped') && (
          <div className="px-5 py-4 border-t border-gray-100 flex gap-2 shrink-0">
            {order.status === 'pending' && (
              <button
                onClick={() => { onStatusChange(order.id, 'confirmed'); onClose(); }}
                disabled={updatingOrder === order.id}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                {updatingOrder === order.id ? '...' : '✅ Confirmer'}
              </button>
            )}
            <button
              onClick={() => { onStatusChange(order.id, 'cancelled'); onClose(); }}
              disabled={updatingOrder === order.id}
              className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              ❌ Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Avatar Upload Component ───────────────────────────────────────────────────

function AvatarUpload({ affiliate, authHeaders, onUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [preview,   setPreview]   = useState(null);
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Local preview
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(file);

    // Upload
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await fetch("/api/affiliate/avatar", {
        method:  "POST",
        headers: authHeaders(),
        body:    form,
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || "Erreur upload"); setPreview(null); return; }
      onUpdate(json.affiliate);
    } catch { alert("Erreur réseau"); setPreview(null); }
    finally  { setUploading(false); }
  };

  const current = preview || affiliate?.avatarUrl;

  return (
    <div className="flex items-center gap-5">
      {/* Avatar preview */}
      <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200">
        {current ? (
          <img src={current} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-900">
            <Users className="w-8 h-8 text-white" />
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="px-4 py-2 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {uploading ? "Téléversement…" : "Changer la photo"}
        </button>
        <p className="text-xs text-gray-400">JPG, PNG — max 2 Mo</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function AffiliateDashboard() {
  const router = useRouter();

  const [affiliateId, setAffiliateId] = useState(null);
  const [token,       setToken]       = useState(null);

  const [data,       setData]       = useState(null);  // { affiliate, stats, gamification, team, bonusConfig }
  const [orders,     setOrders]     = useState([]);
  const [notifs,     setNotifs]     = useState([]);
  const [claiming,   setClaiming]   = useState(false);
  const [claimMsg,   setClaimMsg]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  const [activeTab,  setActiveTab]  = useState("overview");

  // Bank form state
  const [bankForm,      setBankForm]      = useState({ bankName: "", rib: "", accountName: "" });
  const [bankSaving,    setBankSaving]    = useState(false);
  const [bankSuccess,   setBankSuccess]   = useState(false);
  const [bankError,     setBankError]     = useState(null);

  // Payout state
  const [payoutAmount,  setPayoutAmount]  = useState("");
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMsg,     setPayoutMsg]     = useState(null);

  // Order status update
  const [updatingOrder, setUpdatingOrder] = useState(null);

  // Order details modal
  const [detailsOrder,  setDetailsOrder]  = useState(null);

  // Store bank info (for payout tab)
  const [storeBankInfo, setStoreBankInfo] = useState(null);

  // ── Bootstrap ────────────────────────────────────────────────────────────
  useEffect(() => {
    const tok = localStorage.getItem("affiliateToken");
    const id  = localStorage.getItem("affiliateId");
    if (!tok || !id) {
      router.replace("/affiliate/login");
      return;
    }
    setToken(tok);
    setAffiliateId(id);
  }, [router]);

  // ── Fetch all data ────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (tok) => {
    if (!tok) return;
    setLoading(true);
    setError(null);
    try {
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${tok}` };
      const [meRes, ordersRes, notifsRes] = await Promise.all([
        fetch("/api/affiliate/me",            { headers }),
        fetch("/api/affiliate/orders",        { headers }),
        fetch("/api/affiliate/notifications", { headers }),
      ]);

      if (meRes.status === 401) {
        localStorage.removeItem("affiliateToken");
        router.replace("/affiliate/login");
        return;
      }

      const [meData, ordersData, notifsData] = await Promise.all([
        meRes.json(),
        ordersRes.ok ? ordersRes.json() : [],
        notifsRes.ok ? notifsRes.json() : [],
      ]);

      setData(meData);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setNotifs(Array.isArray(notifsData) ? notifsData : []);

      // Pre-fill bank form
      if (meData?.affiliate) {
        setBankForm({
          bankName:    meData.affiliate.bankName    || "",
          rib:         meData.affiliate.rib         || "",
          accountName: meData.affiliate.accountName || "",
        });
      }
    } catch {
      setError("Impossible de charger les données. Réessayez.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { if (token) fetchAll(token); }, [token, fetchAll]);

  // Fetch store bank settings (public — no auth needed)
  useEffect(() => {
    fetch("/api/setting?type=bank-settings")
      .then((r) => r.json())
      .then((data) => {
        if (data && (data.bankName || data.rib || data.accountName)) {
          setStoreBankInfo(data);
        }
      })
      .catch(() => {});
  }, []);

  // ── Logout ───────────────────────────────────────────────────────────────
  const handleLogout = () => {
    ["affiliateToken","affiliateId","affiliateUsername","affiliateName"].forEach((k) => {
      try { localStorage.removeItem(k); } catch {}
    });
    router.push("/affiliate/login");
  };

  // ── Bank save ────────────────────────────────────────────────────────────
  const handleBankSave = async (e) => {
    e.preventDefault();
    setBankSaving(true);
    setBankError(null);
    setBankSuccess(false);
    try {
      const res = await fetch("/api/affiliate/me", {
        method:  "PUT",
        headers: authHeaders(),
        body:    JSON.stringify(bankForm),
      });
      const d = await res.json();
      if (res.ok) {
        setBankSuccess(true);
        setTimeout(() => setBankSuccess(false), 3000);
      } else {
        setBankError(d.error || "Erreur");
      }
    } catch {
      setBankError("Erreur réseau");
    } finally {
      setBankSaving(false);
    }
  };

  // ── Payout request ───────────────────────────────────────────────────────
  const handlePayout = async (e) => {
    e.preventDefault();
    if (!payoutAmount || parseFloat(payoutAmount) <= 0) return;
    setPayoutLoading(true);
    setPayoutMsg(null);
    try {
      const res = await fetch("/api/affiliate/payout", {
        method:  "POST",
        headers: authHeaders(),
        body:    JSON.stringify({ amount: parseFloat(payoutAmount) }),
      });
      const d = await res.json();
      if (res.ok) {
        setPayoutMsg({ type: "success", text: "Demande de retrait envoyée avec succès !" });
        setPayoutAmount("");
        fetchAll(token);
      } else {
        setPayoutMsg({ type: "error", text: d.error || "Erreur" });
      }
    } catch {
      setPayoutMsg({ type: "error", text: "Erreur réseau" });
    } finally {
      setPayoutLoading(false);
    }
  };

  // ── Order status update ──────────────────────────────────────────────────
  const handleOrderStatus = async (orderId, status) => {
    setUpdatingOrder(orderId);
    try {
      const res = await fetch("/api/affiliate/orders", {
        method:  "PUT",
        headers: authHeaders(),
        body:    JSON.stringify({ id: orderId, status }),
      });
      if (res.ok) {
        setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status } : o));
      }
    } catch { }
    setUpdatingOrder(null);
  };

  // ── Mark notifs read ─────────────────────────────────────────────────────
  const markNotifsRead = async () => {
    try {
      await fetch("/api/affiliate/notifications", {
        method:  "PUT",
        headers: authHeaders(),
      });
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  };

  // ── Guard ────────────────────────────────────────────────────────────────
  if (!affiliateId || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-sm w-full text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-gray-700 text-sm">{error}</p>
          <button onClick={() => fetchAll(token)} className="px-6 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const affiliate  = data?.affiliate;
  const stats      = data?.stats;
  const gami       = data?.gamification;
  const team       = data?.team || [];
  const bonusConfig = data?.bonusConfig ?? { requiredActiveAffiliates: 10, bonusAmount: 2000, commissionTiers: [] };
  const validReferrals = stats?.validReferrals ?? 0;
  const bonusGoal      = bonusConfig.requiredActiveAffiliates ?? 10;
  const bonusAmount    = bonusConfig.bonusAmount ?? 2000;
  const bonusProgress  = Math.min(100, Math.round((validReferrals / bonusGoal) * 100));
  const bonusUnlocked  = validReferrals >= bonusGoal;
  const bonusClaimed   = affiliate?.teamBonusClaimed ?? false;
  const lang = typeof navigator !== "undefined" && navigator.language?.startsWith("fr") ? "fr" : "ar";
  const refLink   = typeof window !== "undefined" ? `${window.location.origin}?ref=${affiliate?.username}` : "";
  const unread    = notifs.filter((n) => !n.read).length;
  const balance   = stats?.balance ?? 0;

  // Phone-based order count — used to show repeat-client indicator
  const phoneCounts = orders.reduce((acc, o) => {
    if (o.clientPhone) acc[o.clientPhone] = (acc[o.clientPhone] || 0) + 1;
    return acc;
  }, {});

  // Total items across all orders (Part 5: each item quantity = 1 order unit)
  const totalItemsAll = orders.reduce((s, o) => s + (o.totalItems || 0), 0);

  // ── Tabs ─────────────────────────────────────────────────────────────────

  const tabs = [
    { id: "overview",      label: "Vue d'ensemble" },
    { id: "orders",        label: `Commandes (${orders.length})` },
    { id: "bank",          label: "Coordonnées" },
    { id: "payout",        label: "Retraits" },
    { id: "notifications", label: `Notifs ${unread > 0 ? `(${unread})` : ""}` },
    { id: "team",          label: `Équipe (${team.length})` },
    { id: "settings",      label: "Paramètres" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top nav ── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {/* Avatar */}
            <button
              onClick={() => setActiveTab("settings")}
              className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0 focus:outline-none"
              title="Paramètres"
            >
              {affiliate?.avatarUrl ? (
                <img src={affiliate.avatarUrl} alt="avatar"
                  className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                  <Users className="w-4 h-4 text-white" />
                </div>
              )}
            </button>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-gray-900 leading-none">Tableau de bord</p>
              <p className="text-xs text-gray-500">@{affiliate?.username}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Notifications bell */}
            <button
              onClick={() => { setActiveTab("notifications"); markNotifsRead(); }}
              className="relative p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>

            {/* Refresh */}
            <button
              onClick={() => fetchAll(token)}
              className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Settings */}
            <button
              onClick={() => setActiveTab("settings")}
              className={`p-2 rounded-xl transition-colors ${
                activeTab === "settings"
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
              title="Paramètres"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors font-semibold"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">

        {/* ── Tab nav ── */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-semibold transition-colors
                ${activeTab === t.id
                  ? "bg-gray-900 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-gray-400"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ OVERVIEW ══════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-5">

            {/* ── Loyalty / Progress Banner ── */}
            {affiliate && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4 text-white"
                style={{ background: "linear-gradient(135deg, #0f5f52 0%, #1a7a69 60%, #0d4d43 100%)" }}>

                {/* Left: greeting + reward */}
                <div className="flex items-center gap-3">
                  <span className="text-4xl select-none">🏆</span>
                  <div>
                    <p className="text-xs opacity-80">Bonjour, {affiliate.name || affiliate.username}</p>
                    <h3 className="text-sm font-bold md:text-base">
                      Gagnez {((affiliate.commissionRate || 0) * 100).toFixed(0)}% sur chaque commande livrée
                    </h3>
                  </div>
                </div>

                {/* Right: progress bars */}
                <div className="flex w-full flex-col gap-2 self-start lg:w-auto lg:min-w-72">
                  <div className="flex items-center justify-between text-xs font-medium opacity-80">
                    <span>Votre progression</span>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.43 5.93L20.5 12l-6.07 6.07M3.5 12h16.83"/>
                    </svg>
                  </div>

                  {/* Orders progress */}
                  <div>
                    <p className="mb-1.5 text-xs font-bold">
                      {stats?.validReferrals ?? 0} / {gami?.target || 5} parrainages valides
                    </p>
                    <div className="w-full overflow-hidden rounded-full h-2" style={{ background: "rgba(255,255,255,0.25)" }}>
                      <div className="h-full rounded-full bg-white transition-all duration-700"
                        style={{ width: `${gami?.progress || 0}%` }} />
                    </div>
                  </div>

                  {/* Total vs valid referrals */}
                  <div>
                    <p className="mb-1.5 text-xs font-bold">
                      {stats?.totalReferrals ?? 0} invités · {stats?.validReferrals ?? 0} valides
                    </p>
                    <div className="w-full overflow-hidden rounded-full h-2" style={{ background: "rgba(255,255,255,0.25)" }}>
                      <div className="h-full rounded-full bg-white transition-all duration-700"
                        style={{ width: `${(stats?.totalReferrals ?? 0) > 0 ? Math.min(100, ((stats?.validReferrals ?? 0) / (stats?.totalReferrals ?? 1)) * 100) : 0}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard icon={ShoppingBag} label="Ventes aujourd'hui"   value={stats?.todaySales  ?? "—"} color="blue"   />
              <StatCard icon={CheckCircle} label="Confirmées"           value={stats?.confirmed   ?? "—"} color="green"  />
              <StatCard icon={XCircle}     label="Annulées"             value={stats?.cancelled   ?? "—"} color="red"    />
              <StatCard icon={Truck}       label="En livraison"         value={stats?.shipping    ?? "—"} color="purple" />
              <StatCard icon={Package}     label="Livrées"              value={stats?.delivered   ?? "—"} color="teal"   />
              <StatCard icon={TrendingUp}  label="Chiffre d'affaires"   value={fmtMoney(stats?.totalRevenue)}    color="amber"  />
              <StatCard icon={DollarSign}  label="Commission totale"    value={fmtMoney(stats?.totalCommission)} color="green"
                sub={`Taux : ${((affiliate?.commissionRate || 0) * 100).toFixed(0)}%`} />
              <StatCard icon={CreditCard}  label="Solde disponible"     value={fmtMoney(balance)}                color="blue"   />
              {/* Tracking stats */}
              <StatCard icon={Eye}         label="Total clics"          value={stats?.totalClicks ?? affiliate?.totalClicks ?? "—"} color="blue"   />
              <StatCard icon={ShoppingBag} label="Total commandes"      value={orders.length > 0 ? totalItemsAll : (stats?.totalOrders ?? affiliate?.totalOrders ?? "—")} color="teal" sub="articles commandés" />
              <StatCard icon={TrendingUp}  label="Taux de conversion"   value={stats?.conversionRate != null ? `${stats.conversionRate}%` : "—"} color="amber"
                sub="commandes / clics" />
              <StatCard icon={Users}       label="Commission Équipe"    value={fmtMoney(stats?.teamCommission)} color="teal"
                sub={`${team.length} membre${team.length !== 1 ? "s" : ""}`} />
            </div>

            {/* Gamification */}
            {gami && (
              <Section title="Progression du bonus" icon={Target}>
                {/* Referral counters */}
                <div className="flex gap-3 mb-4">
                  <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-gray-900">{stats?.totalReferrals ?? 0}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Total parrainés</p>
                  </div>
                  <div className="flex-1 bg-green-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-green-700">{stats?.validReferrals ?? 0}</p>
                    <p className="text-xs text-green-600 mt-0.5">Parrainages valides</p>
                  </div>
                </div>
                <ProgressBar
                  progress={gami.progress}
                  target={gami.target}
                  remaining={gami.remaining}
                  validReferrals={gami.validReferrals ?? stats?.validReferrals ?? 0}
                />
                <p className="text-xs text-gray-400 mt-3">
                  Un parrainage est <strong>valide</strong> uniquement si le filleul a au moins
                  1 commande <strong>livrée</strong>. Les commandes en attente, confirmées ou annulées
                  ne comptent pas.
                </p>
              </Section>
            )}

            {/* Referral link */}
            <Section title="Lien de parrainage" icon={Users}>
              <div className="flex gap-2">
                <div className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-700 truncate">
                  {refLink}
                </div>
                <CopyButton text={refLink} label="Copier" />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Partagez ce lien. Chaque commande passée via votre lien vous rapporte{" "}
                <strong>{((affiliate?.commissionRate || 0) * 100).toFixed(0)}%</strong> de commission.
              </p>
            </Section>

            {/* Last 5 orders */}
            {orders.length > 0 && (
              <Section title="Dernières commandes" icon={ShoppingBag}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {["ID","Client","Nb articles","Produit","Statut","Total","Commission","Date","Voir"].map((h) => (
                          <th key={h} className="text-left text-xs text-gray-500 font-semibold pb-2 pr-4 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {orders.slice(0, 5).map((o) => (
                        <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-2.5 pr-4 font-mono text-xs text-gray-400 whitespace-nowrap">
                            {o.orderId ? `#${o.orderId.slice(0, 8).toUpperCase()}` : "—"}
                          </td>
                          <td className="py-2.5 pr-4 text-gray-800 font-medium whitespace-nowrap">{o.clientName || "—"}</td>
                          <td className="py-2.5 pr-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                              {o.totalItems > 0 ? o.totalItems : 1}
                            </span>
                          </td>
                          <td className="py-2.5 pr-4 text-gray-600 max-w-[150px] truncate text-xs">{productPreview(o)}</td>
                          <td className="py-2.5 pr-4"><StatusBadge status={o.status} /></td>
                          <td className="py-2.5 pr-4 font-semibold whitespace-nowrap">{fmtMoney(o.total)}</td>
                          <td className="py-2.5 pr-4 text-green-700 font-semibold whitespace-nowrap">{fmtMoney(o.commissionAmount)}</td>
                          <td className="py-2.5 pr-4 text-xs text-gray-400 whitespace-nowrap">{fmtDate(o.createdAt)}</td>
                          <td className="py-2.5">
                            <button
                              onClick={() => setDetailsOrder(o)}
                              className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                            >
                              Voir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {orders.length > 5 && (
                  <button onClick={() => setActiveTab("orders")} className="mt-3 text-xs text-blue-600 font-semibold hover:underline">
                    Voir toutes les commandes →
                  </button>
                )}
              </Section>
            )}
          </div>
        )}

        {/* ══ ORDERS ════════════════════════════════════════════════════════ */}
        {activeTab === "orders" && (
          <Section title="Mes commandes" icon={ShoppingBag}>
            {orders.length === 0 ? (
              <div className="text-center py-10">
                <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Aucune commande pour l&apos;instant</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {["ID","Client","Nb cmd","Nb articles","Produit","Statut","Total","Commission","Date","Action"].map((h) => (
                        <th key={h} className="text-left text-xs text-gray-500 font-semibold pb-2.5 pr-4 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {orders.map((o) => (
                      <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 pr-4 font-mono text-xs text-gray-400 whitespace-nowrap">
                          {o.orderId ? `#${o.orderId.slice(0, 8).toUpperCase()}` : "—"}
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-gray-800">{o.clientName || "—"}</span>
                            {o.isSuspicious && (
                              <span
                                title={o.suspicionReason || "Activité suspecte détectée"}
                                className="text-amber-500 cursor-help"
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold ${(phoneCounts[o.clientPhone] || 1) > 1 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                            {phoneCounts[o.clientPhone] || 1}
                          </span>
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                            {o.totalItems > 0 ? o.totalItems : 1}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-gray-600 max-w-[150px] truncate text-xs">{productPreview(o)}</td>
                        <td className="py-3 pr-4"><StatusBadge status={o.status} /></td>
                        <td className="py-3 pr-4 font-semibold whitespace-nowrap">{fmtMoney(o.total)}</td>
                        <td className="py-3 pr-4 text-green-700 font-semibold whitespace-nowrap">{fmtMoney(o.commissionAmount)}</td>
                        <td className="py-3 pr-4 text-xs text-gray-400 whitespace-nowrap">{fmtDate(o.createdAt)}</td>
                        <td className="py-3">
                          <div className="flex gap-1.5 flex-wrap">
                            {/* Voir — always visible (Part 4) */}
                            <button
                              onClick={() => setDetailsOrder(o)}
                              className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                            >
                              Voir
                            </button>
                            {/* Confirm / Cancel — Part 6: keep unchanged */}
                            {o.status === "pending" && (
                              <button
                                onClick={() => handleOrderStatus(o.id, "confirmed")}
                                disabled={updatingOrder === o.id}
                                className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 whitespace-nowrap"
                              >
                                {updatingOrder === o.id ? "..." : "Confirmer"}
                              </button>
                            )}
                            {(o.status === "pending" || o.status === "shipped") && (
                              <button
                                onClick={() => handleOrderStatus(o.id, "cancelled")}
                                disabled={updatingOrder === o.id}
                                className="px-2.5 py-1 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 whitespace-nowrap"
                              >
                                Annuler
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {/* ══ BANK ══════════════════════════════════════════════════════════ */}
        {activeTab === "bank" && (
          <Section title="Coordonnées bancaires" icon={Building2}>
            <form onSubmit={handleBankSave} className="space-y-4 max-w-sm">

              {bankSuccess && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-700">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  Coordonnées enregistrées avec succès !
                </div>
              )}
              {bankError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {bankError}
                </div>
              )}

              {[
                { key: "bankName",    label: "Nom de la banque",  placeholder: "CIH, Attijariwafa, BMCE..." },
                { key: "rib",         label: "RIB",               placeholder: "XXXXXXXXXXXXXXXXXXXXXXXXXX" },
                { key: "accountName", label: "Titulaire du compte",placeholder: "Prénom Nom" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
                  <input
                    type="text"
                    value={bankForm[key]}
                    onChange={(e) => setBankForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
                    dir="ltr"
                  />
                </div>
              ))}

              <button
                type="submit"
                disabled={bankSaving}
                className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              >
                {bankSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {bankSaving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </form>
          </Section>
        )}

        {/* ══ PAYOUT ════════════════════════════════════════════════════════ */}
        {activeTab === "payout" && (
          <div className="space-y-4">
            {/* Balance */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white">
              <p className="text-sm font-medium opacity-70 mb-1">Solde disponible</p>
              <p className="text-4xl font-black">{fmtMoney(balance)}</p>
              <p className="text-xs opacity-50 mt-2">Commissions des commandes livrées</p>
            </div>

            {/* Request form */}
            <Section title="Demande de retrait" icon={CreditCard}>
              <form onSubmit={handlePayout} className="space-y-4 max-w-sm">
                {payoutMsg && (
                  <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium
                    ${payoutMsg.type === "success"
                      ? "bg-green-50 border border-green-100 text-green-700"
                      : "bg-red-50 border border-red-100 text-red-700"}`}>
                    {payoutMsg.type === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {payoutMsg.text}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Montant à retirer (MAD)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={balance}
                    step="0.01"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
                    dir="ltr"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Maximum disponible : <strong>{fmtMoney(balance)}</strong>
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={payoutLoading || !payoutAmount || parseFloat(payoutAmount) <= 0 || parseFloat(payoutAmount) > balance}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-all"
                >
                  {payoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  {payoutLoading ? "Envoi..." : "Demander le retrait"}
                </button>
              </form>
            </Section>

            {/* Payout history */}
            {stats?.payouts?.length > 0 && (
              <Section title="Historique des retraits" icon={TrendingUp}>
                <div className="space-y-2">
                  {stats.payouts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{fmtMoney(p.amount)}</p>
                        <p className="text-xs text-gray-400">{fmtDate(p.createdAt)}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold
                        ${p.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {p.status === "paid" ? "Payé" : "En attente"}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Store bank info for payouts */}
            {storeBankInfo && (storeBankInfo.bankName || storeBankInfo.rib) && (
              <Section title="Informations bancaires du paiement" icon={Building2}>
                <p className="text-xs text-gray-400 mb-3">
                  Vos commissions seront versées sur le compte suivant. Assurez-vous que vos coordonnées bancaires (onglet Banque) sont à jour.
                </p>
                <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
                  {storeBankInfo.bankLogo && (
                    <div className="px-4 py-3 flex items-center gap-3">
                      <img
                        src={storeBankInfo.bankLogo}
                        alt={storeBankInfo.bankName}
                        className="h-8 w-auto object-contain"
                      />
                    </div>
                  )}
                  {[
                    { label: "Banque",    value: storeBankInfo.bankName    },
                    { label: "Titulaire", value: storeBankInfo.accountName },
                    { label: "RIB",       value: storeBankInfo.rib,    mono: true },
                    { label: "SWIFT",     value: storeBankInfo.swift,  mono: true },
                  ].map(({ label, value, mono }) =>
                    value ? (
                      <div key={label} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs text-gray-400 font-medium">{label}</span>
                        <span className={`text-sm font-semibold text-gray-800 text-right max-w-[200px] break-all ${mono ? "font-mono text-xs" : ""}`}>
                          {value}
                        </span>
                      </div>
                    ) : null
                  )}
                </div>
              </Section>
            )}
          </div>
        )}

        {/* ══ NOTIFICATIONS ═════════════════════════════════════════════════ */}
        {activeTab === "notifications" && (
          <Section title="Notifications" icon={Bell}>
            {notifs.length === 0 ? (
              <div className="text-center py-10">
                <Bell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Aucune notification</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notifs.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 p-3.5 rounded-xl transition-colors
                      ${n.read ? "bg-gray-50" : "bg-blue-50 border border-blue-100"}`}
                  >
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.read ? "bg-gray-300" : "bg-blue-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${n.read ? "text-gray-600" : "text-gray-800 font-medium"}`}>
                        {n.message}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(n.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* ══ TEAM ══════════════════════════════════════════════════════════ */}
        {activeTab === "team" && (() => {
          const handleClaimBonus = async () => {
            setClaiming(true);
            setClaimMsg(null);
            try {
              const res = await fetch("/api/affiliate/claim-bonus", {
                method: "POST",
                headers: authHeaders(),
              });
              const d = await res.json();
              if (res.ok) {
                setClaimMsg({ type: "success", text: lang === "fr" ? `Félicitations ! ${d.bonus} MAD ajoutés à votre solde.` : `مبروك! تمت إضافة ${d.bonus} درهم إلى رصيدك.` });
                fetchAll(token);
              } else {
                setClaimMsg({ type: "error", text: d.error || (lang === "fr" ? "Erreur" : "خطأ") });
              }
            } catch { setClaimMsg({ type: "error", text: lang === "fr" ? "Erreur réseau" : "خطأ في الشبكة" }); }
            finally { setClaiming(false); }
          };
          return (
          <div className="space-y-4">

            {/* ── GOLD BONUS SECTION ── */}
            <div className={`relative overflow-hidden rounded-2xl p-5
              ${bonusClaimed
                ? "bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-200"
                : bonusUnlocked
                  ? "bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 border border-amber-300 shadow-lg shadow-amber-100"
                  : "bg-gradient-to-br from-amber-900 via-yellow-900 to-amber-800 border border-amber-700"
              }`}>

              {/* Shine overlay */}
              {!bonusClaimed && (
                <div className="absolute inset-0 opacity-10"
                  style={{ background: "linear-gradient(135deg, white 0%, transparent 50%, white 100%)" }} />
              )}

              <div className="relative">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🏆</span>
                    <div>
                      <p className={`text-sm font-black ${bonusClaimed ? "text-gray-500" : bonusUnlocked ? "text-amber-900" : "text-amber-100"}`}>
                        {lang === "fr" ? "Bonus d'équipe" : "مكافأة الفريق"}
                      </p>
                      <p className={`text-xs font-semibold ${bonusClaimed ? "text-gray-400" : bonusUnlocked ? "text-amber-800" : "text-amber-300"}`}>
                        {bonusClaimed
                          ? (lang === "fr" ? "Bonus déjà réclamé ✓" : "تم استلام المكافأة ✓")
                          : lang === "fr"
                            ? `Gagnez ${bonusAmount} MAD avec ${bonusGoal} filleuls actifs`
                            : `احصل على ${bonusAmount} درهم عند ${bonusGoal} إحالات نشطة`}
                      </p>
                    </div>
                  </div>
                  <div className={`text-right px-3 py-1.5 rounded-xl ${bonusClaimed ? "bg-gray-200" : bonusUnlocked ? "bg-amber-900/20" : "bg-amber-950/40"}`}>
                    <p className={`text-xl font-black ${bonusClaimed ? "text-gray-500" : bonusUnlocked ? "text-amber-900" : "text-amber-100"}`}>
                      {bonusAmount} <span className="text-sm font-semibold">MAD</span>
                    </p>
                  </div>
                </div>

                {/* Counters */}
                <div className="flex gap-2 mb-3">
                  <div className={`flex-1 rounded-xl p-2.5 text-center ${bonusClaimed ? "bg-gray-200/60" : bonusUnlocked ? "bg-amber-900/15" : "bg-amber-950/40"}`}>
                    <p className={`text-xl font-black ${bonusClaimed ? "text-gray-500" : bonusUnlocked ? "text-amber-900" : "text-amber-100"}`}>{stats?.totalReferrals ?? team.length}</p>
                    <p className={`text-xs ${bonusClaimed ? "text-gray-400" : bonusUnlocked ? "text-amber-800" : "text-amber-300"}`}>
                      {lang === "fr" ? "Total parrainés" : "إجمالي المُحالين"}
                    </p>
                  </div>
                  <div className={`flex-1 rounded-xl p-2.5 text-center ${bonusClaimed ? "bg-green-100" : bonusUnlocked ? "bg-amber-900/15" : "bg-amber-950/40"}`}>
                    <p className={`text-xl font-black ${bonusClaimed ? "text-green-600" : bonusUnlocked ? "text-amber-900" : "text-amber-100"}`}>{validReferrals}</p>
                    <p className={`text-xs ${bonusClaimed ? "text-green-500" : bonusUnlocked ? "text-amber-800" : "text-amber-300"}`}>
                      {lang === "fr" ? "Actifs" : "نشطون"}
                    </p>
                  </div>
                  <div className={`flex-1 rounded-xl p-2.5 text-center ${bonusClaimed ? "bg-gray-200/60" : bonusUnlocked ? "bg-amber-900/15" : "bg-amber-950/40"}`}>
                    <p className={`text-xl font-black ${bonusClaimed ? "text-gray-500" : bonusUnlocked ? "text-amber-900" : "text-amber-100"}`}>{bonusGoal}</p>
                    <p className={`text-xs ${bonusClaimed ? "text-gray-400" : bonusUnlocked ? "text-amber-800" : "text-amber-300"}`}>
                      {lang === "fr" ? "Objectif" : "الهدف"}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className={`w-full rounded-full h-3 overflow-hidden mb-3 ${bonusClaimed ? "bg-gray-300" : bonusUnlocked ? "bg-amber-900/20" : "bg-amber-950/50"}`}>
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${bonusClaimed ? "bg-gray-400" : bonusUnlocked ? "bg-amber-900" : "bg-gradient-to-r from-amber-400 to-yellow-300"}`}
                    style={{ width: `${bonusProgress}%` }}
                  />
                </div>
                <div className={`flex justify-between text-xs mb-4 ${bonusClaimed ? "text-gray-400" : bonusUnlocked ? "text-amber-800" : "text-amber-300"}`}>
                  <span>{validReferrals} / {bonusGoal} {lang === "fr" ? "filleuls actifs" : "إحالة نشطة"}</span>
                  <span className="font-semibold">{bonusProgress}%</span>
                </div>

                {/* Claim button / status */}
                {bonusClaimed ? (
                  <div className="flex items-center justify-center gap-2 py-2.5 bg-gray-300 rounded-xl text-gray-500 text-sm font-bold">
                    <CheckCircle className="w-4 h-4" />
                    {lang === "fr" ? "Bonus réclamé" : "تم استلام المكافأة"}
                  </div>
                ) : bonusUnlocked ? (
                  <button
                    onClick={handleClaimBonus}
                    disabled={claiming}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-amber-900 hover:bg-amber-950 active:scale-[0.98] text-amber-100 rounded-xl text-sm font-black transition-all shadow-lg disabled:opacity-60"
                  >
                    {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>🎁</span>}
                    {lang === "fr" ? "Réclamer la récompense" : "احصل على المكافأة"}
                  </button>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-2.5 bg-amber-950/40 rounded-xl text-amber-300 text-xs font-semibold">
                    🔒 {lang === "fr"
                      ? `Encore ${Math.max(0, bonusGoal - validReferrals)} filleul(s) actif(s) requis`
                      : `تحتاج ${Math.max(0, bonusGoal - validReferrals)} إحالة نشطة أخرى`}
                  </div>
                )}

                {claimMsg && (
                  <div className={`mt-2 text-xs text-center font-semibold rounded-xl py-2 ${claimMsg.type === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {claimMsg.text}
                  </div>
                )}
              </div>
            </div>

            {/* ── Commission tiers legend ── */}
            {bonusConfig.commissionTiers?.length > 0 && (
              <Section title={lang === "fr" ? "Barème de commission dynamique" : "جدول العمولة الديناميكية"} icon={TrendingUp}>
                <div className="space-y-2">
                  {bonusConfig.commissionTiers.map((t, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-xs font-bold text-blue-600">
                          {i + 1}
                        </div>
                        <span className="text-sm text-gray-700">
                          {t.maxDelivered == null
                            ? (lang === "fr" ? `${t.minDelivered}+ livraisons` : `${t.minDelivered}+ توصيل`)
                            : (lang === "fr" ? `${t.minDelivered}–${t.maxDelivered} livraisons` : `${t.minDelivered}–${t.maxDelivered} توصيل`)}
                        </span>
                      </div>
                      <span className="text-sm font-black text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full">
                        {t.commissionPct}%
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {lang === "fr"
                    ? "La commission augmente automatiquement selon les livraisons du filleul."
                    : "تزيد العمولة تلقائياً مع زيادة توصيلات المُحال."}
                </p>
              </Section>
            )}

            {/* ── Invite link ── */}
            <Section title={lang === "fr" ? "Inviter un partenaire" : "دعوة شريك"} icon={UserPlus}>
              <div className="flex gap-2">
                <div className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-700 truncate">
                  {refLink}
                </div>
                <CopyButton text={refLink} />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {lang === "fr"
                  ? "Partagez ce lien. Les personnes qui s'inscrivent via ce lien rejoindront votre équipe."
                  : "شارك هذا الرابط. من يسجل عبره سينضم لفريقك."}
              </p>
            </Section>

            {/* ── Team list ── */}
            <Section title={`${lang === "fr" ? "Mon équipe" : "فريقي"} (${team.length}/10)`} icon={Users}>
              {team.length === 0 ? (
                <div className="text-center py-10">
                  <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">
                    {lang === "fr" ? "Votre équipe est vide pour l'instant" : "فريقك فارغ حالياً"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {team.map((m) => {
                    const isActive    = m.referralStatus === "active";
                    const commPct     = m.commissionPct ?? 0;
                    const revenue     = m.generatedRevenue ?? 0;
                    const parentEarn  = m.parentEarnings ?? 0;
                    return (
                      <div key={m.id} className={`rounded-xl border overflow-hidden ${isActive ? "border-green-100" : "border-gray-100"}`}>
                        {/* Member header */}
                        <div className={`flex items-center justify-between px-3.5 py-2.5 ${isActive ? "bg-green-50" : "bg-gray-50"}`}>
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${isActive ? "bg-green-200 text-green-800" : "bg-gray-200 text-gray-500"}`}>
                              {(m.name || m.username || "?")[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-800">{m.name || m.username}</p>
                              <p className="text-xs text-gray-400 font-mono">@{m.username}</p>
                            </div>
                          </div>
                          <span className={`text-xs px-2.5 py-1 rounded-full font-bold
                            ${isActive ? "bg-green-200 text-green-800" : "bg-amber-100 text-amber-700"}`}>
                            {isActive
                              ? (lang === "fr" ? "Actif" : "نشط")
                              : (lang === "fr" ? "En attente" : "قيد الانتظار")}
                          </span>
                        </div>

                        {/* Member stats */}
                        <div className="grid grid-cols-3 divide-x divide-gray-100 px-0 py-0 bg-white">
                          <div className="text-center py-2.5 px-2">
                            <p className="text-base font-black text-gray-800">{m.deliveredOrdersCount ?? 0}</p>
                            <p className="text-xs text-gray-400">{lang === "fr" ? "Livrées" : "مُوصّل"}</p>
                          </div>
                          <div className="text-center py-2.5 px-2">
                            <p className="text-base font-black text-blue-700">{commPct}%</p>
                            <p className="text-xs text-gray-400">{lang === "fr" ? "Commission" : "عمولتك"}</p>
                          </div>
                          <div className="text-center py-2.5 px-2">
                            <p className="text-base font-black text-amber-700">{revenue.toFixed(0)} <span className="text-xs font-semibold">MAD</span></p>
                            <p className="text-xs text-gray-400">{lang === "fr" ? "CA généré" : "الإيرادات"}</p>
                          </div>
                        </div>

                        {/* Earnings row */}
                        {isActive && (
                          <div className="flex items-center justify-between px-3.5 py-2 bg-blue-50 border-t border-blue-100">
                            <span className="text-xs text-blue-700">
                              {lang === "fr" ? "Vos gains de ce filleul" : "أرباحك من هذا المُحال"}
                            </span>
                            <span className="text-sm font-black text-blue-800">+{parentEarn.toFixed(0)} MAD</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-3">
                {lang === "fr"
                  ? "Commission calculée sur le CA livré du filleul. Augmente automatiquement avec ses performances."
                  : "العمولة محسوبة على إيرادات المُحال المُوصَّلة. تزيد تلقائياً مع تحسّن أدائه."}
              </p>
            </Section>
          </div>
          );
        })()}

        {/* ══ SETTINGS ══════════════════════════════════════════════════════ */}
        {activeTab === "settings" && (
          <div className="space-y-5 max-w-md">

            {/* ── Profile Picture ── */}
            <Section title="Photo de profil" icon={Users}>
              <AvatarUpload
                affiliate={affiliate}
                authHeaders={authHeaders}
                onUpdate={(updated) => setData(d => ({ ...d, affiliate: updated }))}
              />
            </Section>

            {/* ── Edit Profile ── */}
            <Section title="Modifier le profil" icon={Star}>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const name  = fd.get("name");
                const phone = fd.get("phone");
                try {
                  const res = await fetch("/api/affiliate/me", {
                    method: "PUT",
                    headers: authHeaders(),
                    body: JSON.stringify({ type: "profile", name, phone: phone || undefined }),
                  });
                  const json = await res.json();
                  if (!res.ok) { alert(json.error || "Erreur"); return; }
                  setData(d => ({ ...d, affiliate: json.affiliate }));
                  alert("Profil mis à jour ✓");
                } catch { alert("Erreur réseau"); }
              }} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Nom complet</label>
                  <input name="name" defaultValue={affiliate?.name || ""}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
                    placeholder="Votre nom" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Nom d'utilisateur</label>
                  <input value={affiliate?.username ?? ""} disabled
                    className="w-full px-4 py-2.5 text-sm border border-gray-100 rounded-xl bg-gray-100 text-gray-400 cursor-not-allowed" />
                  <p className="text-xs text-gray-400 mt-1">Le nom d'utilisateur ne peut pas être modifié.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Numéro de téléphone</label>
                  {affiliate?.phone ? (
                    <>
                      <input value={affiliate.phone ?? ""} disabled
                        className="w-full px-4 py-2.5 text-sm border border-gray-100 rounded-xl bg-gray-100 text-gray-400 cursor-not-allowed font-mono" />
                      <p className="text-xs text-gray-400 mt-1">Le numéro de téléphone ne peut pas être modifié.</p>
                    </>
                  ) : (
                    <>
                      <input name="phone" type="tel"
                        className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400 font-mono"
                        placeholder="0612345678" dir="ltr" />
                      <p className="text-xs text-amber-500 mt-1">⚠ Une fois enregistré, le numéro ne pourra plus être modifié.</p>
                    </>
                  )}
                </div>
                <button type="submit"
                  className="w-full py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors">
                  Enregistrer le profil
                </button>
              </form>
            </Section>

            {/* ── Change Password ── */}
            <Section title="Changer le mot de passe" icon={AlertCircle}>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const currentPassword = fd.get("currentPassword");
                const newPassword     = fd.get("newPassword");
                const confirmPassword = fd.get("confirmPassword");
                if (newPassword !== confirmPassword) { alert("Les mots de passe ne correspondent pas"); return; }
                if (newPassword.length < 6) { alert("Le mot de passe doit contenir au moins 6 caractères"); return; }
                try {
                  const res = await fetch("/api/affiliate/me", {
                    method: "PUT",
                    headers: authHeaders(),
                    body: JSON.stringify({ type: "profile", currentPassword, newPassword }),
                  });
                  const json = await res.json();
                  if (!res.ok) { alert(json.error || "Erreur"); return; }
                  e.target.reset();
                  alert("Mot de passe changé ✓");
                } catch { alert("Erreur réseau"); }
              }} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Mot de passe actuel</label>
                  <input name="currentPassword" type="password" required
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
                    placeholder="••••••••" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Nouveau mot de passe</label>
                  <input name="newPassword" type="password" required minLength={6}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
                    placeholder="••••••••" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Confirmer le mot de passe</label>
                  <input name="confirmPassword" type="password" required minLength={6}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-gray-400"
                    placeholder="••••••••" />
                </div>
                <button type="submit"
                  className="w-full py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors">
                  Changer le mot de passe
                </button>
              </form>
            </Section>

          </div>
        )}

      </main>

      {/* ── Order details modal (Parts 2–5) ── */}
      <OrderDetailsModal
        order={detailsOrder}
        onClose={() => setDetailsOrder(null)}
        onStatusChange={handleOrderStatus}
        updatingOrder={updatingOrder}
      />

    </div>
  );
}
