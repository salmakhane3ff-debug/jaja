"use client";

import React, { useState, useEffect, Suspense, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Input, Select, SelectItem, Textarea, Switch } from "@heroui/react";
import { ArrowLeft, Package, Plus, X, Save, ExternalLink, AlertTriangle, Link2, Loader2, Check, CircleAlert } from "lucide-react";
import CustomButton from "@/components/block/CustomButton";
import ImageSelector from "@/components/block/ImageSelector";
import { useStoreCurrency } from "@/hooks/useStoreCurrency";
import SectionBuilder from "@/components/admin/SectionBuilder";

const TextEditor = dynamic(() => import("@/components/block/TextEditor"), { ssr: false });

// ── Detect if a URL is a video ────────────────────────────────────────────────
function isVideoUrl(url) {
  if (!url) return false;
  const u = url.toLowerCase().split("?")[0];
  return (
    url.startsWith("data:video/") ||
    /\.(mp4|webm|ogg|mov|m4v|avi|mkv)$/.test(u) ||
    u.includes("/video/upload/") ||
    u.includes("/videos/")
  );
}

// ── Drag-and-drop image/video grid with direct file upload ───────────────────
function DraggableImageGrid({ images, onChange, onLibrary }) {
  const fileInputRef = useRef(null);
  const dragIdx      = useRef(null);
  const dragOver     = useRef(null);
  const [uploading, setUploading] = useState({}); // { tempId: 0-100 }
  const [dropActive, setDropActive] = useState(false);

  // ── Upload files to /api/image ──────────────────────────────────────────
  const uploadFiles = useCallback(async (files) => {
    const arr = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (!arr.length) return;

    for (const file of arr) {
      const tempId  = `tmp_${Date.now()}_${Math.random()}`;
      setUploading((u) => ({ ...u, [tempId]: 0 }));

      try {
        const fd = new FormData();
        fd.append("file", file);

        // Show instant local preview while uploading
        const localUrl = URL.createObjectURL(file);
        onChange((prev) => [...prev, localUrl]);

        const res  = await fetch("/api/image", { method: "POST", body: fd });
        const data = await res.json();

        if (data.url) {
          // Replace blob URL with real server URL
          onChange((prev) => prev.map((u) => (u === localUrl ? data.url : u)));
          URL.revokeObjectURL(localUrl);
        } else {
          // Server responded but returned no URL (unexpected) — remove blob so it
          // doesn't get persisted to the DB and cause a broken image on next load.
          onChange((prev) => prev.filter((u) => u !== localUrl));
          URL.revokeObjectURL(localUrl);
        }
      } catch {
        // Upload failed — remove the blob entry immediately so the user sees
        // the failure rather than a dangling preview that gets saved to the DB.
        onChange((prev) => prev.filter((u) => u !== localUrl));
        URL.revokeObjectURL(localUrl);
      } finally {
        setUploading((u) => { const n = { ...u }; delete n[tempId]; return n; });
      }
    }
  }, [onChange]);

  // ── File input change ───────────────────────────────────────────────────
  const handleFileInput = (e) => {
    uploadFiles(e.target.files);
    e.target.value = ""; // reset so same file can be picked again
  };

  // ── Drop zone ───────────────────────────────────────────────────────────
  const handleDrop = (e) => {
    e.preventDefault();
    setDropActive(false);
    uploadFiles(e.dataTransfer.files);
  };

  // ── Reorder drag ────────────────────────────────────────────────────────
  const handleDragStart = (i) => { dragIdx.current = i; };
  const handleDragEnter = (i) => { dragOver.current = i; };
  const handleDragEnd   = () => {
    const from = dragIdx.current;
    const to   = dragOver.current;
    if (from !== null && to !== null && from !== to) {
      const next = [...images];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onChange(next);
    }
    dragIdx.current = dragOver.current = null;
  };

  const remove = (i) => onChange(images.filter((_, idx) => idx !== i));
  const isUploading = Object.keys(uploading).length > 0;

  return (
    <div className="bg-white rounded-xl p-6">
      {/* Hidden file input */}
      <input
        id="fileUpload" ref={fileInputRef}
        type="file"
        accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime,video/x-msvideo"
        multiple
        style={{ display: "none" }}
        onChange={handleFileInput}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Product Media</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Drag to reorder · First image is the main image
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onLibrary && (
            <button type="button" onClick={onLibrary}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors">
              Library
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {isUploading ? "Uploading…" : "Upload Media"}
          </button>
        </div>
      </div>

      {/* Drop zone (empty state) */}
      {images.length === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
          onDragLeave={() => setDropActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full h-40 rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer select-none
            ${dropActive ? "border-gray-900 bg-gray-50" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"}`}
        >
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Plus className="w-5 h-5 text-gray-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-600">Click to upload or drag & drop</p>
            <p className="text-xs text-gray-400 mt-0.5">Images (PNG, JPG, GIF, WebP) or Videos (MP4, WebM, MOV)</p>
          </div>
        </div>
      ) : (
        /* Grid with images + add cell */
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
          onDragOver={(e) => { if (dragIdx.current === null) { e.preventDefault(); setDropActive(true); }}}
          onDragLeave={() => setDropActive(false)}
          onDrop={(e) => { if (dragIdx.current === null) handleDrop(e); }}
        >
          {images.map((img, i) => {
            // Normalize: img may be a plain URL string or an object {url, _id, ...}
            const imgUrl = typeof img === "string" ? img : (img?.url || img?.src || "");
            return (
            <div
              key={imgUrl + i}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragEnter={() => handleDragEnter(i)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className="relative group rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-50 cursor-grab active:cursor-grabbing select-none transition-shadow hover:shadow-md"
              style={{ aspectRatio: "1/1" }}
            >
              {isVideoUrl(imgUrl) ? (
                <>
                  <video
                    src={imgUrl}
                    muted
                    playsInline
                    preload="metadata"
                    draggable={false}
                    className="w-full h-full object-contain bg-gray-900"
                  />
                  <span className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full leading-none flex items-center gap-0.5">
                    ▶ VIDEO
                  </span>
                </>
              ) : (
                <>
                  <img src={imgUrl} alt={`Product ${i + 1}`} draggable={false}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.nextElementSibling?.style && (e.currentTarget.nextElementSibling.style.display = "flex");
                    }} />
                  <div className="absolute inset-0 items-center justify-center text-gray-400 text-xs hidden flex-col gap-1">
                    <span>⚠</span>
                    <span>Broken</span>
                  </div>
                  {i === 0 && (
                    <span className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-gray-900 text-white px-1.5 py-0.5 rounded-full leading-none">
                      Main
                    </span>
                  )}
                </>
              )}

              {/* Grip dots */}
              <div className="absolute inset-x-0 top-0 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="flex gap-0.5">
                  {[0,1,2].map(d => <div key={d} className="w-0.5 h-3 bg-gray-900/50 rounded-full" />)}
                  <div className="w-1" />
                  {[0,1,2].map(d => <div key={d} className="w-0.5 h-3 bg-gray-900/50 rounded-full" />)}
                </div>
              </div>

              <button type="button" onClick={() => remove(i)}
                className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-3 h-3" />
              </button>

              <span className="absolute bottom-1 right-1.5 text-[9px] font-semibold text-gray-400">
                {i + 1}
              </span>
            </div>
            );
          })}

          {/* Upload more cell */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors text-gray-400 gap-1
              ${dropActive ? "border-gray-900 bg-gray-50" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"}`}
            style={{ aspectRatio: "1/1" }}
          >
            <Plus className="w-5 h-5" />
            <span className="text-xs">Upload</span>
          </button>
        </div>
      )}

      {/* Upload progress strip */}
      {isUploading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gray-900 rounded-full animate-pulse" style={{ width: "60%" }} />
          </div>
          Uploading…
        </div>
      )}
    </div>
  );
}

// ── Brand synonym map ─────────────────────────────────────────────────────────
// Maps common brand/product keywords to collection name patterns.
// If a title contains a brand keyword AND a collection name matches a pattern
// from the same group → that collection gets a large score boost.
const SYNONYM_GROUPS = [
  {
    patterns: ["smartphone", "phone", "mobile"],
    brands:   ["samsung", "galaxy", "iphone", "apple", "bypass", "pixel",
               "xiaomi", "redmi", "oppo", "huawei", "oneplus", "realme", "nokia"],
  },
  {
    patterns: ["tablet", "tab"],
    brands:   ["ipad", "galaxy tab", "tab s", "tab a", "mediapad", "kindle"],
  },
  {
    patterns: ["laptop", "notebook", "pc"],
    brands:   ["macbook", "lenovo", "dell", "asus", "hp ", "acer", "surface"],
  },
  {
    patterns: ["vibrat"],
    brands:   ["vibrat", "wand", "bullet", "massager"],
  },
  {
    patterns: ["doll"],
    brands:   ["sex doll", "love doll", "silicone doll"],
  },
  {
    patterns: ["popper"],
    brands:   ["popper", "rush", "jungle juice", "amsterdam"],
  },
  {
    patterns: ["camera", "action cam", "360"],
    brands:   ["insta360", "insta 360", "gopro", "dji"],
  },
];

// ── Smart collection detector ─────────────────────────────────────────────────
// Layer 1: direct keyword overlap between title and collection name.
// Layer 2: synonym map — detects "Samsung" → "Smartphones" even with no shared word.
// Returns null if no real match found.
function detectCollection(title, collections) {
  if (!title?.trim() || !collections?.length) return null;
  const t = title.toLowerCase();
  const titleWords = t.split(/[\s\-_/]+/).filter((w) => w.length > 2);

  let bestMatch = null;
  let bestScore = 0;

  for (const col of collections) {
    const colName = col.title.toLowerCase();
    const colWords = colName.split(/[\s\-_/]+/).filter((w) => w.length > 1);
    let score = 0;

    // Layer 1a: collection word found in product title
    for (const cw of colWords) {
      if (t.includes(cw)) score += cw.length * 2;
    }

    // Layer 1b: product title word found in collection name
    for (const tw of titleWords) {
      if (colName.includes(tw)) score += tw.length;
    }

    // Layer 1c: partial word match (min 4 chars)
    for (const cw of colWords) {
      if (cw.length >= 4) {
        for (const tw of titleWords) {
          if (tw.startsWith(cw) || cw.startsWith(tw)) score += 3;
        }
      }
    }

    // Layer 2: synonym map boost
    for (const group of SYNONYM_GROUPS) {
      const titleHasBrand   = group.brands.some((b)   => t.includes(b));
      const colMatchPattern = group.patterns.some((p) => colName.includes(p));
      if (titleHasBrand && colMatchPattern) score += 20; // strong boost
    }

    if (score > bestScore) { bestScore = score; bestMatch = col; }
  }

  // If a real match found → use it
  if (bestMatch) return bestMatch;

  // Fallback: find a collection whose name contains "electronic"
  const electronic = collections.find((c) =>
    c.title.toLowerCase().includes("electronic")
  );
  return electronic || null;
}

// ── Import from URL ──────────────────────────────────────────────────────────
/**
 * Compact importer for ONE manually pasted marketplace listing URL.
 *
 * It only POSTs to /api/admin/products/import-url and hands the result back to
 * the parent form. It never calls /api/products, so importing can never publish
 * or even create a product — the admin still reviews every field and presses
 * Save. A failure here is contained: the form stays fully usable.
 */
function ImportFromUrl({ storeCurrency, currencyLoading, onImported, categoryDetected }) {
  const [url, setUrl]       = useState("");
  const [state, setState]   = useState("idle"); // idle | importing | success | partial | error
  const [steps, setSteps]   = useState([]);     // [{ label, tone }]
  const [error, setError]   = useState("");
  const [notes, setNotes]   = useState([]);     // things the admin must fix by hand

  const busy = state === "importing";

  const runImport = async () => {
    const target = url.trim();
    if (!target || busy) return;

    setState("importing");
    setError("");
    setNotes([]);
    setSteps([{ label: "Reading product…", tone: "busy" }]);

    try {
      const res = await fetch("/api/admin/products/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setState("error");
        setSteps([]);
        setError(data?.error || "Could not read this listing.");
        return;
      }

      const next = [];
      const manual = [];

      // Title
      if (data.title) next.push({ label: `Found title: ${data.title}`, tone: "ok" });
      else { next.push({ label: "No title found", tone: "warn" }); manual.push("Title could not be read — enter it manually."); }

      // Price: only applied when the listing currency matches the store currency.
      // There is no conversion mechanism in this store, so a mismatch is shown
      // to the admin rather than silently converted.
      let priceForForm = null;
      if (data.price?.amount != null && data.price?.currency) {
        if (!currencyLoading && data.price.currency === storeCurrency) {
          priceForForm = data.price.amount;
          next.push({ label: `Found price: ${data.price.amount} ${data.price.currency}`, tone: "ok" });
        } else {
          next.push({ label: `Price found in ${data.price.currency}, not applied`, tone: "warn" });
          manual.push(
            `Listing price is ${data.price.amount} ${data.price.currency} but this store prices in ${storeCurrency || "—"}. ` +
            "No conversion was applied — enter the price manually."
          );
        }
      } else if (data.price?.amount != null) {
        next.push({ label: "Price found without a currency, not applied", tone: "warn" });
        manual.push(`Listing shows ${data.price.amount} but no currency — enter the price manually.`);
      } else {
        next.push({ label: "No price found", tone: "warn" });
        manual.push("Price could not be read — enter it manually.");
      }

      // Images
      const got = Array.isArray(data.images) ? data.images.length : 0;
      const want = Number(data.imagesRequested) || 0;
      if (got > 0) {
        next.push({ label: `Imported ${got}/${want} images`, tone: got === want ? "ok" : "warn" });
      } else if (want > 0) {
        next.push({ label: `Imported 0/${want} images`, tone: "warn" });
      } else {
        next.push({ label: "No images found", tone: "warn" });
      }
      if (want > got) manual.push(`${want - got} image(s) could not be imported — add them manually if needed.`);

      next.push({ label: "Detecting category…", tone: "busy" });
      setSteps(next);

      onImported({ title: data.title, priceForForm, images: data.images || [] });

      setNotes(manual);
      setState(data.partial || manual.length > 0 ? "partial" : "success");
    } catch {
      setState("error");
      setSteps([]);
      setError("Could not read this listing.");
    }
  };

  // The LAST step mirrors the form's own category detector once it has run.
  const shownSteps = steps.map((st) =>
    st.label.startsWith("Detecting category")
      ? (categoryDetected
          ? { label: `Category detected: ${categoryDetected}`, tone: "ok" }
          : st)
      : st
  );
  const ready = state === "success" || state === "partial";

  return (
    <div className="bg-white rounded-xl p-5 mb-6 border border-dashed border-gray-300">
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="w-4 h-4 text-gray-500" />
        <h2 className="text-base font-semibold text-gray-900">Import from URL</h2>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Paste one Mercari listing URL. Title, price and images are imported for review —
        nothing is saved or published until you press Save Product.
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="url"
          value={url}
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runImport(); } }}
          placeholder="https://www.mercari.com/..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
        />
        <button
          type="button"
          onClick={runImport}
          disabled={busy || !url.trim()}
          className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {busy ? "Importing…" : "Import"}
        </button>
      </div>

      {shownSteps.length > 0 && (
        <ul className="mt-3 space-y-1">
          {shownSteps.map((st, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              {st.tone === "busy"
                ? <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin shrink-0" />
                : st.tone === "ok"
                  ? <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
                  : <CircleAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
              <span className={st.tone === "warn" ? "text-amber-700" : "text-gray-600"}>{st.label}</span>
            </li>
          ))}
        </ul>
      )}

      {ready && (
        <p className={`mt-3 text-xs font-medium ${state === "partial" ? "text-amber-700" : "text-green-700"}`}>
          {state === "partial" ? "Partial import — ready for review." : "Import successful — ready for review."}
        </p>
      )}

      {notes.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-700 list-disc list-inside">
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}

      {state === "error" && (
        <p className="mt-3 flex items-center gap-2 text-xs font-medium text-red-600">
          <CircleAlert className="w-3.5 h-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function ProductForm() {
  const searchParams = useSearchParams();

  const productId = searchParams?.get("productId") || "";
  const isUpdate = searchParams?.get("isUpdate") === "true";

  const [addLoading, setAddLoading] = useState(false);
  const savingRef = useRef(false); // synchronous lock — prevents race condition on rapid clicks
  const [isInvalid, setIsInvalid] = useState(false);
  const [savedProduct, setSavedProduct] = useState(null);
  const [categories, setCategories] = useState(new Set());
  const [fetchingCollection, setFetchingCollection] = useState([]);
  const [autoDetected, setAutoDetected] = useState(null); // name of auto-detected collection
  const [isImageSelectorOpen, setIsImageSelectorOpen] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  const [isFetching, setIsFetching] = useState(false);

  const [variantInput, setVariantInput] = useState({ name: "", options: "" });
  const [sections, setSections] = useState([]);
  const { symbol: currencySymbol, code: currencyCode, loading: currencyLoading } = useStoreCurrency();

  const fetchCollection = async () => {
    setIsFetching(true);
    try {
      const response = await fetch(`/api/collection`, { cache: "reload" });
      const data = await response.json();
      if (response.ok) {
        setFetchingCollection(data);
      }
    } catch (error) {
      console.error("Fetch failed:", error);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchCollection();
  }, []);

  const [productData, setProductData] = useState({
    title: "",
    description: "",
    regularPrice: "",
    salePrice: "",
    sku: "",
    stockQuantity: "",
    brand: "",
    barcode: "",
    productLabel: "",
    tags: "",
    supplier: "",
    status: "Active",
    stockStatus: "In Stock",
    costPerItem: "",
    variants: [], // ✅ New: variants
    rating: "", // ✅ Star rating (decimal like 4.2, 4.4)
    ratingsCount: "", // ✅ Number of people who rated
    reviewsCount: "", // ✅ Number of reviews
    limitedTimeDeal: false, // ✅ Limited time deal toggle (true/false)
    // ── New control fields ──────────────────────────────────────────────────
    redirectMode:      "default", // "default" | "landing"
    redirectUrl:       "",
    allowCOD:          true,
    allowPrepaid:      true,
    purchaseFlow:      "checkout", // "checkout" | "inline_cod"
    // ── Per-product conversion / scarcity ──────────────────────────────────
    conversionEnabled: false,
    conversionSold:    "",
    conversionStock:   "",
  });

  const visibilityOptions = ["Active", "Inactive"];
  const stockStatusOptions = ["In Stock", "Out of Stock"];
  const productLabelOptions = ["Trending", "New", "Hot", "Best Seller", "Limited Edition", "Sale", "Exclusive", "None"];

  // ── Auto-detect collection from title (debounced 600 ms) ─────────────────────
  // Only fires on new products — don't override admin's manual selection on update.
  useEffect(() => {
    if (isUpdate) return;
    if (!productData.title?.trim() || !fetchingCollection.length) return;
    const timer = setTimeout(() => {
      const detected = detectCollection(productData.title, fetchingCollection);
      if (detected) {
        setAutoDetected(detected.title);
        setCategories(new Set([detected.title]));
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [productData.title, fetchingCollection, isUpdate]);

  useEffect(() => {
    const fetchProductById = async () => {
      if (!isUpdate || !productId) return;

      try {
        const res = await fetch(`/api/products/${productId}`);
        const data = await res.json();

        setProductData({
          title: data.title || "",
          description: data.description || "",
          regularPrice: data.regularPrice === 0 || data.regularPrice == null ? "" : data.regularPrice,
          salePrice: data.salePrice || "",
          sku: data.sku || "",
          stockQuantity: data.stockQuantity || "",
          brand: data.brand || "",
          barcode: data.barcode || "",
          productLabel: data.productLabel || "",
          tags: data.tags || "",
          supplier: data.supplier || "",
          status: data.status || "Active",
          stockStatus: data.stockStatus || "In Stock",
          costPerItem: data.costPerItem || "",
          variants: data.variants || [], // ✅ load existing variants
          rating: data.rating || "",
          ratingsCount: data.ratingsCount || "",
          reviewsCount: data.reviewsCount || "",
          limitedTimeDeal: data.limitedTimeDeal || false,
          // ── New control fields ─────────────────────────────────────────
          redirectMode:      data.redirectMode  ?? "default",
          redirectUrl:       data.redirectUrl   ?? "",
          allowCOD:          data.allowCOD      !== false,
          allowPrepaid:      data.allowPrepaid  !== false,
          purchaseFlow:      data.purchaseFlow  ?? "checkout",
          // ── Per-product conversion / scarcity ────────────────────────────
          conversionEnabled: data.conversionEnabled ?? false,
          conversionSold:    data.conversionSold    ?? "",
          conversionStock:   data.conversionStock   ?? "",
        });

        // Normalize: images may be stored as objects {url, _id} or plain strings
        setSelectedImages((data.images || []).map(img =>
          typeof img === "string" ? img : (img?.url || img?.src || "")
        ).filter(Boolean));
        setCategories(new Set(data.collections || []));
        // Load sections
        const raw = data.sections;
        if (Array.isArray(raw)) setSections(raw);
        else if (typeof raw === "string") { try { setSections(JSON.parse(raw)); } catch { setSections([]); } }


      } catch (error) {
        console.error("❌ Failed to fetch product:", error);
      }
    };

    fetchProductById();
  }, [isUpdate, productId]);

  /**
   * Apply an imported listing to the EXISTING form state.
   *
   * Deliberately additive and non-destructive: images are appended to whatever
   * the admin already picked, and nothing is saved. Setting `title` here is
   * also what re-runs the EXISTING category detector — the debounced effect
   * above watches productData.title, so an imported product goes through the
   * exact same detectCollection() path as a typed one.
   */
  const applyImportedProduct = useCallback(({ title, priceForForm, images }) => {
    setProductData((prev) => ({
      ...prev,
      title: title || prev.title,
      ...(priceForForm != null ? { salePrice: String(priceForForm) } : {}),
    }));
    if (Array.isArray(images) && images.length > 0) {
      setSelectedImages((prev) => [...prev, ...images.filter((u) => u && !prev.includes(u))]);
    }
  }, []);

  const handleCategoryChange = (keys) => {
    setCategories(new Set(keys));
    setAutoDetected(null); // admin overrode — clear the badge
  };

  const addVariant = () => {
    if (!variantInput.name || !variantInput.options) return;

    const newVariant = {
      name: variantInput.name,
      options: variantInput.options.split(",").map((opt) => opt.trim()),
    };

    setProductData((prev) => ({
      ...prev,
      variants: [...prev.variants, newVariant],
    }));

    setVariantInput({ name: "", options: "" });
  };

  const removeVariant = (index) => {
    setProductData((prev) => {
      const updated = [...prev.variants];
      updated.splice(index, 1);
      return { ...prev, variants: updated };
    });
  };

  const addOrUpdateProduct = async () => {
    if (savingRef.current) return; // synchronous check — blocks before any state update
    savingRef.current = true;
    setAddLoading(true);

    if (!productData.title) {
      setIsInvalid(true);
      setAddLoading(false);
      return;
    }

    try {
      const method = isUpdate ? "PUT" : "POST";
      const response = await fetch("/api/products", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isUpdate && { _id: productId }),
          ...productData,
          collections:   Array.from(categories),
          images:        selectedImages.filter(img => !String(img).startsWith("blob:")),
          sections,
        }),
      });

      if (response.status === 429) {
        // Duplicate request blocked by backend — not an error, just ignore silently
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("❌ API Error:", errorData);
        throw new Error(`Error: ${response.statusText}`);
      }

      const saved = await response.json();
      setSavedProduct(saved);
    } catch (error) {
      console.error("❌ Error saving product:", error);
    } finally {
      savingRef.current = false;
      setAddLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6  mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/products">
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{isUpdate ? "Edit Product" : "Add Product"}</h1>
            <p className="text-gray-600 text-sm">{isUpdate ? "Update product information" : "Create a new product for your store"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CustomButton
            intent="primary"
            size="md"
            isLoading={addLoading}
            onPress={addOrUpdateProduct}
            startContent={<Save className="w-4 h-4" />}
            tooltip={isUpdate ? "Update product information" : "Save this product to your store"}
          >
            {isUpdate ? "Update Product" : "Save Product"}
          </CustomButton>
          {(savedProduct?._id || savedProduct?.slug) && (
            <button
              type="button"
              onClick={() => window.open(`/products/${savedProduct._id}`, "_blank")}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View Product Page
            </button>
          )}
        </div>
      </div>

      {/* Import from URL — creation only; editing an existing product keeps the
          form exactly as it was. */}
      {!isUpdate && (
        <ImportFromUrl
          storeCurrency={currencyCode}
          currencyLoading={currencyLoading}
          onImported={applyImportedProduct}
          categoryDetected={autoDetected}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-8">Basic Information</h2>
            <div className="space-y-4">
              <Input
                label="Product Name"
                labelPlacement="outside"
                isDisabled={isFetching}
                placeholder="Enter product name"
                value={productData.title}
                isInvalid={isInvalid && !productData.title}
                errorMessage="Product name is required"
                onChange={(e) => setProductData({ ...productData, title: e.target.value })}
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
              />

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Product Description</label>
                <TextEditor value={productData.description} onChange={(value) => setProductData((prev) => ({ ...prev, description: value }))} />
              </div>
            </div>
          </div>

          {/* Product Images — direct upload + drag-to-reorder */}
          <DraggableImageGrid
            images={selectedImages}
            onChange={setSelectedImages}
            onLibrary={() => setIsImageSelectorOpen(true)}
          />
          <ImageSelector isOpen={isImageSelectorOpen} onClose={() => setIsImageSelectorOpen(false)} onSelectImages={(urls) => setSelectedImages(urls)} selectType="multiple" />

          {/* Pricing */}
          <div className="bg-white rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing & Inventory</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Regular Price"
                labelPlacement="outside"
                type="number"
                isDisabled={isFetching || currencyLoading}
                startContent={<span className="text-gray-500 text-sm">{currencySymbol}</span>}
                placeholder="0.00"
                value={productData.regularPrice}
                description="Optional — used for discount display"
                onChange={(e) => setProductData({ ...productData, regularPrice: e.target.value })}
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
              />
              <Input
                label="Sale Price"
                labelPlacement="outside"
                type="number"
                isDisabled={isFetching || currencyLoading}
                startContent={<span className="text-gray-500 text-sm">{currencySymbol}</span>}
                placeholder="0.00"
                value={productData.salePrice}
                onChange={(e) => setProductData({ ...productData, salePrice: e.target.value })}
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
              />
              <Input
                label="Cost per Item"
                labelPlacement="outside"
                type="number"
                isDisabled={isFetching || currencyLoading}
                startContent={<span className="text-gray-500 text-sm">{currencySymbol}</span>}
                placeholder="0.00"
                value={productData.costPerItem}
                onChange={(e) => setProductData({ ...productData, costPerItem: e.target.value })}
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
              />
              <Input
                label="Profit"
                labelPlacement="outside"
                isDisabled={true}
                startContent={<span className="text-gray-500 text-sm">{currencySymbol}</span>}
                placeholder="Auto-calculated"
                value={productData.costPerItem ? (parseFloat(productData.salePrice || productData.regularPrice || "0") - parseFloat(productData.costPerItem || "0")).toFixed(2) : ""}
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
              />
              <Input
                label="SKU"
                labelPlacement="outside"
                isDisabled={isFetching}
                placeholder="Product code"
                value={productData.sku}
                onChange={(e) => setProductData({ ...productData, sku: e.target.value })}
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
              />
              <Input
                label="Stock Quantity"
                labelPlacement="outside"
                type="number"
                isDisabled={isFetching}
                placeholder="0"
                value={productData.stockQuantity}
                onChange={(e) => setProductData({ ...productData, stockQuantity: e.target.value })}
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
              />
            </div>
          </div>

          {/* Product Variants */}
          <div className="bg-white rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Variants</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Variant Name"
                  labelPlacement="outside"
                  isDisabled={isFetching}
                  placeholder="e.g., Size, Color"
                  value={variantInput.name}
                  onChange={(e) => setVariantInput({ ...variantInput, name: e.target.value })}
                  classNames={{
                    input: "text-sm",
                    label: "text-sm font-medium text-gray-700",
                  }}
                />
                <Input
                  label="Options (comma-separated)"
                  labelPlacement="outside"
                  isDisabled={isFetching}
                  placeholder="e.g., Small, Medium, Large"
                  value={variantInput.options}
                  onChange={(e) => setVariantInput({ ...variantInput, options: e.target.value })}
                  classNames={{
                    input: "text-sm",
                    label: "text-sm font-medium text-gray-700",
                  }}
                />
              </div>

              <CustomButton intent="ghost" size="sm" onPress={addVariant} startContent={<Plus className="w-4 h-4" />} tooltip="Add a new product variant">
                Add Variant
              </CustomButton>


              {productData.variants.length > 0 && (
                <div className="space-y-2">
                  {productData.variants.map((variant, index) => (
                    <div key={index} className="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-3">
                      <div className="text-sm">
                        <span className="font-medium text-gray-900">{variant.name}:</span>
                        <span className="text-gray-600 ml-2">{variant.options.join(", ")}</span>
                      </div>
                      <button onClick={() => removeVariant(index)} className="text-red-500 hover:text-red-700 text-sm">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Page Builder Sections */}
          <div className="bg-white rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">🧩 Page Builder</h2>
            <p className="text-sm text-gray-400 mb-4">
              Add rich content sections below the product info: text, images, videos, galleries, FAQs, spacers.
              Leave empty to show the description above as a fallback.
            </p>
            <SectionBuilder sections={sections} onChange={setSections} />
          </div>

        </div>

        {/* Sidebar - 1/3 width */}
        <div className="lg:col-span-1 space-y-6">
          {/* Product Status */}
          <div className="bg-white rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-8">Product Status</h3>
            <div className="space-y-10">
              <Select
                label="Visibility"
                labelPlacement="outside"
                isDisabled={isFetching}
                placeholder="Select status"
                selectedKeys={[productData.status]}
                onSelectionChange={(keys) => setProductData({ ...productData, status: Array.from(keys)[0] })}
                classNames={{
                  label: "text-sm font-medium text-gray-700",
                }}
              >
                {visibilityOptions.map((option) => (
                  <SelectItem key={option}>{option}</SelectItem>
                ))}
              </Select>

              <Select
                label="Stock Status"
                labelPlacement="outside"
                placeholder="Select stock status"
                isDisabled={isFetching}
                selectedKeys={[productData.stockStatus]}
                onSelectionChange={(keys) => setProductData({ ...productData, stockStatus: Array.from(keys)[0] })}
                classNames={{
                  label: "text-sm font-medium text-gray-700 ",
                }}
              >
                {stockStatusOptions.map((option) => (
                  <SelectItem key={option}>{option}</SelectItem>
                ))}
              </Select>
            </div>
          </div>

          {/* Organization */}
          <div className="bg-white rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-8">Organization</h3>
            <div className="space-y-10">
              {autoDetected && (
                <div className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg">
                  <span>🤖</span>
                  <span>Auto-detected: <strong>{autoDetected}</strong></span>
                  <button
                    type="button"
                    onClick={() => { setAutoDetected(null); setCategories(new Set()); }}
                    className="ml-auto text-blue-400 hover:text-blue-700 font-bold"
                  >✕</button>
                </div>
              )}
              <Select
                label="Collections"
                labelPlacement="outside"
                isDisabled={isFetching}
                selectionMode="multiple"
                placeholder="Select collections"
                selectedKeys={categories}
                onSelectionChange={handleCategoryChange}
                classNames={{
                  label: "text-sm font-medium text-gray-700",
                }}
              >
                {fetchingCollection.map((c) => (
                  <SelectItem key={c.title}>{c.title}</SelectItem>
                ))}
              </Select>

              <Select
                label="Product Label"
                labelPlacement="outside"
                placeholder="Select label"
                isDisabled={isFetching}
                selectedKeys={[productData.productLabel]}
                onSelectionChange={(keys) => setProductData({ ...productData, productLabel: Array.from(keys)[0] })}
                classNames={{
                  label: "text-sm font-medium text-gray-700",
                }}
              >
                {productLabelOptions.map((label) => (
                  <SelectItem key={label}>{label}</SelectItem>
                ))}
              </Select>

              <Input
                label="Star Rating"
                labelPlacement="outside"
                type="number"
                step="0.1"
                min="0"
                max="5"
                isDisabled={isFetching}
                placeholder="e.g., 4.2, 4.6"
                value={productData.rating}
                onChange={(e) => setProductData({ ...productData, rating: e.target.value })}
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
                description="Enter rating from 0 to 5 (decimals allowed)"
              />

              <Input
                label="Number of Ratings"
                labelPlacement="outside"
                type="number"
                min="0"
                isDisabled={isFetching}
                placeholder="e.g., 5000, 1200"
                value={productData.ratingsCount}
                onChange={(e) => setProductData({ ...productData, ratingsCount: e.target.value })}
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
                description="Total number of people who rated this product"
              />

              <Input
                label="Number of Reviews"
                labelPlacement="outside"
                type="number"
                min="0"
                isDisabled={isFetching}
                placeholder="e.g., 450, 125"
                value={productData.reviewsCount}
                onChange={(e) => setProductData({ ...productData, reviewsCount: e.target.value })}
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
                description="Total number of detailed reviews written"
              />

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">Limited Time Deal</label>
                <Switch
                  isSelected={productData.limitedTimeDeal}
                  onValueChange={(value) => setProductData({ ...productData, limitedTimeDeal: value })}
                  classNames={{
                    wrapper: "group-data-[selected=true]:bg-blue-600",
                  }}
                >
                  <span className="text-sm text-gray-600">{productData.limitedTimeDeal ? "Deal is active" : "Deal is inactive"}</span>
                </Switch>
                <p className="text-xs text-gray-500">Toggle to activate/deactivate limited time deal</p>
              </div>

              <Input
                label="Tags"
                labelPlacement="outside"
                isDisabled={isFetching}
                placeholder="e.g. electronics, smart"
                value={productData.tags}
                onChange={(e) => setProductData({ ...productData, tags: e.target.value })}
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
              />

              <Input
                label="Supplier"
                labelPlacement="outside"
                isDisabled={isFetching}
                placeholder="Enter supplier name"
                value={productData.supplier}
                onChange={(e) => setProductData({ ...productData, supplier: e.target.value })}
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
              />
            </div>
          </div>

          {/* ── Redirect Behavior ── */}
          <div className="bg-white rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span>🔀</span> Redirect Behavior
            </h3>
            <p className="text-xs text-gray-500 mb-4">Control where visitors go when they click on this product</p>

            <div className="space-y-2">
              {/* Default */}
              <button
                type="button"
                onClick={() => setProductData({ ...productData, redirectMode: "default" })}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all
                  ${productData.redirectMode === "default"
                    ? "border-gray-900 bg-gray-900"
                    : "border-gray-100 bg-white hover:border-gray-300"}`}
              >
                <div className={`shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center
                  ${productData.redirectMode === "default" ? "border-white" : "border-gray-300"}`}>
                  {productData.redirectMode === "default" && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${productData.redirectMode === "default" ? "text-white" : "text-gray-900"}`}>
                    Default Product Page
                  </p>
                  <p className={`text-xs ${productData.redirectMode === "default" ? "text-gray-300" : "text-gray-400"}`}>
                    Normal product or checkout flow
                  </p>
                </div>
              </button>

              {/* Landing */}
              <button
                type="button"
                onClick={() => setProductData({ ...productData, redirectMode: "landing" })}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all
                  ${productData.redirectMode === "landing"
                    ? "border-amber-500 bg-amber-500"
                    : "border-gray-100 bg-white hover:border-gray-300"}`}
              >
                <div className={`shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center
                  ${productData.redirectMode === "landing" ? "border-white" : "border-gray-300"}`}>
                  {productData.redirectMode === "landing" && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${productData.redirectMode === "landing" ? "text-white" : "text-gray-900"}`}>
                    Redirect to Landing Page
                  </p>
                  <p className={`text-xs ${productData.redirectMode === "landing" ? "text-amber-100" : "text-gray-400"}`}>
                    Visitor goes directly to the URL below
                  </p>
                </div>
                <ExternalLink className={`w-4 h-4 shrink-0 ${productData.redirectMode === "landing" ? "text-amber-100" : "text-gray-300"}`} />
              </button>
            </div>

            {/* URL input */}
            {productData.redirectMode === "landing" && (
              <div className="mt-3">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Landing Page URL</label>
                <div className="relative">
                  <ExternalLink className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="url"
                    value={productData.redirectUrl}
                    onChange={(e) => setProductData({ ...productData, redirectUrl: e.target.value })}
                    placeholder="https://your-landing-page.com/offer"
                    className="w-full text-sm border border-amber-300 rounded-xl pr-9 pl-3 py-2.5 focus:outline-none focus:border-amber-500 bg-amber-50 font-mono text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Purchase Mode ── */}
          <div className="bg-white rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span>🛒</span> Purchase Mode
            </h3>
            <p className="text-xs text-gray-500 mb-4">How the Buy Now button behaves on the product page</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { v: "checkout",   title: "Checkout Page",   desc: "Buy Now → checkout page (default)" },
                { v: "inline_cod", title: "Inline COD Form",  desc: "Buy Now scrolls to an embedded COD form" },
              ].map((opt) => {
                const active = (productData.purchaseFlow || "checkout") === opt.v;
                return (
                  <div
                    key={opt.v}
                    onClick={() => setProductData({ ...productData, purchaseFlow: opt.v })}
                    className={`cursor-pointer rounded-xl border p-4 transition-all flex items-start gap-3
                      ${active ? "bg-gray-900 border-gray-900" : "bg-gray-50 border-gray-200 hover:border-gray-300"}`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0
                      ${active ? "border-white" : "border-gray-300"}`}>
                      {active && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${active ? "text-white" : "text-gray-900"}`}>{opt.title}</p>
                      <p className={`text-xs ${active ? "text-gray-300" : "text-gray-400"}`}>{opt.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Payment Methods ── */}
          <div className="bg-white rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span>💳</span> Payment Methods
            </h3>
            <p className="text-xs text-gray-500 mb-4">Which payment methods are allowed for this product</p>

            {(!productData.allowCOD && !productData.allowPrepaid) && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs font-semibold text-red-600">At least one payment method must be enabled</p>
              </div>
            )}

            <div className="space-y-2">
              {/* COD */}
              <button
                type="button"
                onClick={() => {
                  // prevent disabling the last active method
                  if (productData.allowCOD && !productData.allowPrepaid) return;
                  setProductData({ ...productData, allowCOD: !productData.allowCOD });
                }}
                className={`w-full flex items-center justify-between gap-4 px-4 py-3 rounded-xl border-2 transition-all
                  ${productData.allowCOD && !productData.allowPrepaid ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                  ${productData.allowCOD
                    ? "border-gray-900 bg-gray-900"
                    : "border-gray-100 bg-white hover:border-gray-300"}`}
              >
                <div>
                  <p className={`text-sm font-semibold ${productData.allowCOD ? "text-white" : "text-gray-900"}`}>Cash on Delivery (COD)</p>
                  <p className={`text-xs ${productData.allowCOD ? "text-gray-300" : "text-gray-400"}`}>Pay cash upon delivery</p>
                </div>
                <div className={`shrink-0 w-11 h-6 rounded-full transition-colors ${productData.allowCOD ? "bg-white/30" : "bg-gray-200"}`}>
                  <div className={`mt-0.5 w-5 h-5 rounded-full shadow transition-transform ${productData.allowCOD ? "translate-x-5 bg-white ml-0.5" : "translate-x-0.5 bg-gray-400 ml-0"}`} />
                </div>
              </button>

              {/* Prepaid */}
              <button
                type="button"
                onClick={() => {
                  if (productData.allowPrepaid && !productData.allowCOD) return;
                  setProductData({ ...productData, allowPrepaid: !productData.allowPrepaid });
                }}
                className={`w-full flex items-center justify-between gap-4 px-4 py-3 rounded-xl border-2 transition-all
                  ${productData.allowPrepaid && !productData.allowCOD ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                  ${productData.allowPrepaid
                    ? "border-gray-900 bg-gray-900"
                    : "border-gray-100 bg-white hover:border-gray-300"}`}
              >
                <div>
                  <p className={`text-sm font-semibold ${productData.allowPrepaid ? "text-white" : "text-gray-900"}`}>Prepaid (Bank Transfer)</p>
                  <p className={`text-xs ${productData.allowPrepaid ? "text-gray-300" : "text-gray-400"}`}>Pay in advance via bank transfer</p>
                </div>
                <div className={`shrink-0 w-11 h-6 rounded-full transition-colors ${productData.allowPrepaid ? "bg-white/30" : "bg-gray-200"}`}>
                  <div className={`mt-0.5 w-5 h-5 rounded-full shadow transition-transform ${productData.allowPrepaid ? "translate-x-5 bg-white ml-0.5" : "translate-x-0.5 bg-gray-400 ml-0"}`} />
                </div>
              </button>
            </div>

            {/* Status pills */}
            <div className="flex gap-2 flex-wrap mt-3">
              {productData.allowCOD && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> COD Enabled
                </span>
              )}
              {productData.allowPrepaid && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Prepaid Enabled
                </span>
              )}
            </div>
          </div>

          {/* ── Conversion Optimization ── */}
          <div className="bg-white rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <span>📊</span> Conversion Optimization
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Show a per-product scarcity progress bar to drive urgency
            </p>

            {/* Enable toggle */}
            <div className="flex flex-col gap-2 mb-4">
              <Switch
                isSelected={productData.conversionEnabled}
                onValueChange={(v) => setProductData({ ...productData, conversionEnabled: v })}
                classNames={{ wrapper: "group-data-[selected=true]:bg-orange-500" }}
              >
                <span className="text-sm font-medium text-gray-700">
                  {productData.conversionEnabled ? "Stock bar enabled" : "Stock bar disabled"}
                </span>
              </Switch>
              <p className="text-xs text-gray-400">
                When enabled, a progress bar appears on the product page
              </p>
            </div>

            {/* Number inputs — only active when enabled */}
            <div className={`space-y-3 transition-opacity ${productData.conversionEnabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
              <Input
                label="Items Sold"
                labelPlacement="outside"
                type="number"
                min="0"
                isDisabled={isFetching || !productData.conversionEnabled}
                placeholder="e.g. 18"
                value={String(productData.conversionSold)}
                onChange={(e) => setProductData({ ...productData, conversionSold: e.target.value })}
                description="Simulated units sold (shown in the bar)"
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
              />
              <Input
                label="Total Stock"
                labelPlacement="outside"
                type="number"
                min="1"
                isDisabled={isFetching || !productData.conversionEnabled}
                placeholder="e.g. 30"
                value={String(productData.conversionStock)}
                onChange={(e) => setProductData({ ...productData, conversionStock: e.target.value })}
                description="Simulated total inventory (used for percentage)"
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
              />
            </div>

            {/* Live mini-preview */}
            {productData.conversionEnabled &&
             Number(productData.conversionSold) > 0 &&
             Number(productData.conversionStock) > 0 && (() => {
               const sold  = Number(productData.conversionSold);
               const total = Number(productData.conversionStock);
               const pct   = Math.min(100, Math.round((sold / total) * 100));
               const bar   = pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-orange-400" : "bg-green-500";
               return (
                 <div className="mt-4 bg-orange-50 border border-orange-100 rounded-xl p-3 space-y-1.5">
                   <p className="text-xs font-semibold text-orange-700">🔥 Preview</p>
                   <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                     <div className={`h-2 rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                   </div>
                   <p className="text-xs text-gray-600">{sold} / {total} sold — {pct}%</p>
                 </div>
               );
             })()}
          </div>

        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center h-[calc(100vh-80px)]">
          <div className="text-center">
            <Package className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600">Loading product editor...</p>
          </div>
        </div>
      }
    >
      <ProductForm />
    </Suspense>
  );
}
