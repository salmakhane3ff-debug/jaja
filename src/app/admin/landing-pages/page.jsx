"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Chip, Spinner, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Switch, Pagination, useDisclosure,
} from "@heroui/react";
import {
  Trash2, Edit3, Layout, Plus, Eye, MousePointerClick, X,
  ExternalLink, Wand2, ShoppingBag, TrendingUp,
} from "lucide-react";
import Link from "next/link";
import DeleteConfirmationModal from "@/components/block/DeleteConfirmationModal";
import CustomButton from "@/components/block/CustomButton";
import formatDate from "@/utils/formatDate";

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: "", slug: "", isActive: true,
  heroTitle: "", heroSubtitle: "", description: "",
  images: [], productId: "",
};

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function pct(num, denom) {
  if (!denom) return "—";
  return `${((num / denom) * 100).toFixed(1)}%`;
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

// ── Image list editor ─────────────────────────────────────────────────────────

function ImageEditor({ images, onChange }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const url = draft.trim();
    if (!url) return;
    onChange([...images, url]);
    setDraft("");
  };
  const remove = (i) => onChange(images.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="https://example.com/image.jpg"
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 bg-gray-50"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 bg-gray-800 text-white text-xs rounded-lg hover:bg-gray-700"
        >
          Add
        </button>
      </div>
      {images.length > 0 && (
        <div className="space-y-1.5 max-h-36 overflow-y-auto">
          {images.map((url, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <img src={url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" onError={(e) => (e.currentTarget.style.display = "none")} />
              <span className="flex-1 text-xs text-gray-500 truncate">{url}</span>
              <button type="button" onClick={() => remove(i)} className="text-gray-300 hover:text-red-500">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LandingPagesPage() {
  const [landingPages, setLandingPages] = useState([]);
  const [products, setProducts]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [page, setPage]                 = useState(1);
  const rowsPerPage                     = 10;
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedId, setSelectedId]     = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [editId, setEditId]             = useState(null);
  const [saving, setSaving]             = useState(false);
  const [formError, setFormError]       = useState("");
  const [search, setSearch]             = useState("");
  const { isOpen, onOpen, onClose }     = useDisclosure();

  const totalPages = Math.ceil(landingPages.length / rowsPerPage);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return landingPages;
    return landingPages.filter(
      (lp) => lp.title?.toLowerCase().includes(q) || lp.slug?.toLowerCase().includes(q)
    );
  }, [landingPages, search]);

  const paginated = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  useEffect(() => {
    fetchLandingPages();
    fetchProducts();
  }, []);

  const fetchLandingPages = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/landing-page?admin=true");
      const data = await res.json();
      setLandingPages(Array.isArray(data) ? data : []);
    } catch {}
    finally { setLoading(false); }
  };

  const fetchProducts = async () => {
    try {
      const res  = await fetch("/api/product?status=all");
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch {}
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    onOpen();
  };

  const openEdit = (lp) => {
    setEditId(lp.id || lp._id);
    setForm({
      title:        lp.title        || "",
      slug:         lp.slug         || "",
      isActive:     lp.isActive     ?? true,
      heroTitle:    lp.heroTitle    || "",
      heroSubtitle: lp.heroSubtitle || "",
      description:  lp.description  || "",
      images:       Array.isArray(lp.images) ? lp.images : [],
      productId:    lp.productId    || "",
    });
    setFormError("");
    onOpen();
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setFormError("Title is required"); return; }
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        title:        form.title.trim(),
        slug:         form.slug.trim() || undefined,
        isActive:     form.isActive,
        heroTitle:    form.heroTitle.trim()    || null,
        heroSubtitle: form.heroSubtitle.trim() || null,
        description:  form.description.trim()  || null,
        images:       form.images,
        productId:    form.productId           || null,
        ...(editId ? { _id: editId } : {}),
      };
      const res  = await fetch("/api/landing-page", {
        method:  editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data?.error || "Failed to save"); return; }
      if (editId) {
        setLandingPages((prev) => prev.map((lp) => (lp.id === editId || lp._id === editId ? data : lp)));
      } else {
        setLandingPages((prev) => [data, ...prev]);
      }
      onClose();
    } catch { setFormError("Unexpected error. Please try again."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await fetch("/api/landing-page", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ _id: selectedId }),
      });
      setLandingPages((prev) => prev.filter((lp) => lp.id !== selectedId && lp._id !== selectedId));
    } catch {}
    finally { setDeleteModalOpen(false); setSelectedId(null); }
  };

  const totalViews    = landingPages.reduce((s, lp) => s + (lp.views  || 0), 0);
  const totalClicks   = landingPages.reduce((s, lp) => s + (lp.clicks || 0), 0);
  const totalOrders   = landingPages.reduce((s, lp) => s + (lp.sales  || 0), 0);
  const activeCount   = landingPages.filter((lp) => lp.isActive).length;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-80px)]">
        <Spinner color="secondary" variant="gradient" size="md" />
      </div>
    );
  }

  return (
    <div className="p-0 md:p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Landing Pages</h1>
          <p className="text-gray-600 text-sm mt-1">
            {landingPages.length} {landingPages.length === 1 ? "page" : "pages"} · {activeCount} active
          </p>
        </div>
        <CustomButton onClick={openCreate} intent="primary" size="sm" startContent={<Plus className="w-4 h-4" />}>
          Add Page
        </CustomButton>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Pages",   value: landingPages.length,           icon: <Layout size={18} />,             color: "bg-orange-50 text-orange-600" },
          { label: "Total Views",   value: totalViews.toLocaleString(),   icon: <Eye size={18} />,                color: "bg-teal-50 text-teal-600" },
          { label: "Total Clicks",  value: totalClicks.toLocaleString(),  icon: <MousePointerClick size={18} />,  color: "bg-purple-50 text-purple-600" },
          { label: "Total Orders",  value: totalOrders.toLocaleString(),  icon: <ShoppingBag size={18} />,        color: "bg-green-50 text-green-600" },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl ${card.color} flex items-center justify-center flex-shrink-0`}>
              {card.icon}
            </div>
            <div>
              <p className="text-xs text-gray-500">{card.label}</p>
              <p className="text-lg font-bold text-gray-900">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or slug..."
          className="w-full max-w-sm text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-gray-400 bg-gray-50"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl overflow-hidden border border-gray-100">
        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-gray-50 rounded-xl">
                <Layout className="w-8 h-8 text-gray-400" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No landing pages yet</h3>
            <p className="text-gray-500 mb-4 text-sm">Create your first landing page to start driving conversions.</p>
            <CustomButton onClick={openCreate} intent="primary" size="sm" startContent={<Plus className="w-4 h-4" />}>
              Create First Page
            </CustomButton>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="block lg:hidden p-4 space-y-3">
              {paginated.map((lp) => {
                const id = lp.id || lp._id;
                const ctr = lp.views ? `${((lp.clicks / lp.views) * 100).toFixed(1)}%` : "—";
                const cr  = lp.views ? `${((lp.sales  / lp.views) * 100).toFixed(1)}%` : "—";
                return (
                  <div key={id} className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-gray-900 text-sm truncate">{lp.title}</h4>
                          <Chip size="sm" color={lp.isActive ? "success" : "default"} variant="flat">
                            {lp.isActive ? "Active" : "Inactive"}
                          </Chip>
                        </div>
                        <p className="text-xs text-gray-500 font-mono mb-1">/offer/{lp.slug || "—"}</p>
                        <div className="flex gap-3 text-xs text-gray-500 mt-1">
                          <span>{(lp.views  || 0).toLocaleString()} views</span>
                          <span>{(lp.clicks || 0).toLocaleString()} clicks</span>
                          <span>{(lp.sales  || 0).toLocaleString()} orders</span>
                          <span className="text-purple-600 font-medium">CTR {ctr}</span>
                          <span className="text-green-600 font-medium">Conv. {cr}</span>
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        <a href={`/offer/${lp.slug}`} target="_blank" rel="noopener noreferrer"
                          className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <Link href={`/admin/landing-pages/${id}/builder`}
                          className="p-2 bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100">
                          <Wand2 className="w-4 h-4" />
                        </Link>
                        <button className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100" onClick={() => openEdit(lp)}>
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                          onClick={() => { setSelectedId(id); setDeleteModalOpen(true); }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {["Title", "Slug", "Product", "Status", "Views", "Clicks", "Orders", "CTR", "Conv. Rate", "Created", "Actions"].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map((lp) => {
                    const id = lp.id || lp._id;
                    const linkedProduct = products.find((p) => p._id === lp.productId || p.id === lp.productId);
                    const ctr = pct(lp.clicks || 0, lp.views || 0);
                    const cr  = pct(lp.sales  || 0, lp.views || 0);
                    return (
                      <tr key={id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 max-w-[140px] truncate">{lp.title}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-gray-500">/offer/{lp.slug || "—"}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[120px] truncate">
                          {linkedProduct ? linkedProduct.title : lp.productId ? "…" : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Chip size="sm" color={lp.isActive ? "success" : "default"} variant="flat">
                            {lp.isActive ? "Active" : "Inactive"}
                          </Chip>
                        </td>
                        <td className="px-4 py-3 text-gray-700 text-sm">{(lp.views  || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-700 text-sm">{(lp.clicks || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-700 text-sm">{(lp.sales  || 0).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold text-purple-600">{ctr}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold text-green-600">{cr}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(lp.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <a href={`/offer/${lp.slug}`} target="_blank" rel="noopener noreferrer"
                              className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors" title="Preview">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <Link href={`/admin/landing-pages/${id}/builder`}
                              className="p-1.5 bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 transition-colors" title="Visual Builder">
                              <Wand2 className="w-3.5 h-3.5" />
                            </Link>
                            <button className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" onClick={() => openEdit(lp)} title="Edit">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                              onClick={() => { setSelectedId(id); setDeleteModalOpen(true); }}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filtered.length > rowsPerPage && (
              <div className="p-4 border-t border-gray-100 flex justify-center">
                <Pagination isCompact showControls color="primary" page={page} total={totalPages} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Create / Edit Modal ── */}
      <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="text-gray-900 font-semibold">
            {editId ? "Edit Landing Page" : "New Landing Page"}
          </ModalHeader>
          <ModalBody className="space-y-4 pb-2">
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
                {formError}
              </div>
            )}
            {editId && (
              <div className="bg-violet-50 border border-violet-200 text-violet-700 text-sm rounded-lg px-4 py-2 flex items-center gap-2">
                <Wand2 className="w-4 h-4 flex-shrink-0" />
                <span>
                  Want drag-and-drop blocks?{" "}
                  <Link href={`/admin/landing-pages/${editId}/builder`} className="font-semibold underline">
                    Open Visual Builder →
                  </Link>
                </span>
              </div>
            )}

            {/* Title + Slug */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Title *">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => {
                    set("title", e.target.value);
                    if (!editId) set("slug", slugify(e.target.value));
                  }}
                  placeholder="Summer Sale 2025"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-gray-400 bg-gray-50"
                />
              </Field>
              <Field label="Slug (URL)" hint="Auto-generated — /offer/[slug]">
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => set("slug", slugify(e.target.value))}
                  placeholder="summer-sale-2025"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-gray-400 bg-gray-50 font-mono"
                />
              </Field>
            </div>

            {/* Hero Title + Subtitle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Hero Title" hint="Shown over the hero image">
                <input type="text" value={form.heroTitle} onChange={(e) => set("heroTitle", e.target.value)}
                  placeholder="احصل على أفضل سعر اليوم"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-gray-400 bg-gray-50"
                />
              </Field>
              <Field label="Hero Subtitle">
                <input type="text" value={form.heroSubtitle} onChange={(e) => set("heroSubtitle", e.target.value)}
                  placeholder="عرض محدود — اطلب الآن"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-gray-400 bg-gray-50"
                />
              </Field>
            </div>

            {/* Product selector */}
            <Field label="Linked Product" hint="Product used for pricing, reviews and buy button">
              <select value={form.productId} onChange={(e) => set("productId", e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-gray-400 bg-gray-50"
              >
                <option value="">— No product —</option>
                {products.map((p) => (
                  <option key={p._id || p.id} value={p._id || p.id}>
                    {p.title}{(p.salePrice || p.regularPrice) ? ` — ${(p.salePrice || p.regularPrice)} MAD` : ""}
                  </option>
                ))}
              </select>
            </Field>

            {/* Description */}
            <Field label="Description" hint="Supports HTML">
              <textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)}
                placeholder="<ul><li>Feature one</li><li>Feature two</li></ul>"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-gray-400 bg-gray-50 resize-y font-mono"
              />
            </Field>

            {/* Images */}
            <Field label="Images" hint="Hero image is first in the list">
              <ImageEditor images={form.images} onChange={(imgs) => set("images", imgs)} />
            </Field>

            {/* Active toggle */}
            <div className="flex items-center justify-between py-2 border-t border-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">Active</p>
                <p className="text-xs text-gray-400">Visible to public visitors at /offer/{form.slug || "…"}</p>
              </div>
              <Switch isSelected={form.isActive} onValueChange={(val) => set("isActive", val)} color="success" />
            </div>
          </ModalBody>
          <ModalFooter>
            <button onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
              Cancel
            </button>
            <CustomButton onClick={handleSave} isLoading={saving} intent="primary" size="sm">
              {editId ? "Save Changes" : "Create Page"}
            </CustomButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Landing Page"
        message="Are you sure you want to delete this landing page? This action cannot be undone."
      />
    </div>
  );
}
