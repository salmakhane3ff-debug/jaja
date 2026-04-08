"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Input, Spinner, Pagination,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from "@heroui/react";
import { MdDelete } from "react-icons/md";
import { RiEditCircleFill } from "react-icons/ri";
import { Upload, Youtube, Film, ShoppingBag, Video, SplitSquareHorizontal } from "lucide-react";
import DeleteConfirmationModal from "@/components/block/DeleteConfirmationModal";
import Empty from "@/components/block/Empty";
import CustomButton from "@/components/block/CustomButton";

// ── helpers ──────────────────────────────────────────────────────────────────

const REELS_COL     = "video-reels";
const SHOPPABLE_COL = "shoppable-reels";

const getYoutubeId = (url = "") => {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/shorts/")[1];
    if (u.searchParams.has("v")) return u.searchParams.get("v");
    if (u.pathname.startsWith("/embed/")) return u.pathname.split("/embed/")[1];
    return null;
  } catch { return null; }
};

const isLocalVideo = (url = "") =>
  url.startsWith("/uploads/") || url.startsWith("blob:");

function VideoThumb({ url, name }) {
  if (!url) return <div className="w-[60px] h-[80px] bg-gray-100 rounded-lg" />;
  if (isLocalVideo(url))
    return <video src={url} className="w-[60px] h-[80px] object-cover rounded-lg" muted playsInline />;
  const ytId = getYoutubeId(url);
  if (ytId)
    return <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt={name} className="w-[60px] h-[80px] object-cover rounded-lg" />;
  return (
    <div className="w-[60px] h-[80px] bg-gray-200 rounded-lg flex items-center justify-center">
      <Film size={20} className="text-gray-400" />
    </div>
  );
}

// ── upload video to /api/video ────────────────────────────────────────────────

async function uploadVideoFile(file, setUploading) {
  setUploading(true);
  try {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/video", { method: "POST", body: fd });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.url;
  } catch (err) {
    console.error(err);
    alert("Video upload failed");
    return null;
  } finally {
    setUploading(false);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1 — Customer Reels (existing)
// ═══════════════════════════════════════════════════════════════════════════

function CustomerReelsTab() {
  const [reels, setReels]               = useState([]);
  const [name, setName]                 = useState("");
  const [comment, setComment]           = useState("");
  const [videoUrl, setVideoUrl]         = useState("");
  const [rating, setRating]             = useState(5);
  const [sourceType, setSourceType]     = useState("youtube");
  const [uploadFile, setUploadFile]     = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploading, setUploading]       = useState(false);
  const fileRef = useRef(null);

  const [loading, setLoading]           = useState(false);
  const [isFetching, setIsFetching]     = useState(true);
  const [selectedId, setSelectedId]     = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [page, setPage]                 = useState(1);
  const rowsPerPage = 6;
  const [error, setError]               = useState({ name: false, videoUrl: false });

  const fetchReels = async () => {
    setIsFetching(true);
    try {
      const res = await fetch(`/api/data?collection=${REELS_COL}`);
      const data = await res.json();
      if (res.ok) setReels(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (err) { console.error(err); }
    finally { setIsFetching(false); }
  };

  useEffect(() => { fetchReels(); }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
    setVideoUrl("");
    setError(p => ({ ...p, videoUrl: false }));
  };

  const save = async () => {
    const newError = {
      name: !name.trim(),
      videoUrl: sourceType === "youtube" ? !videoUrl.trim() : !uploadFile && !videoUrl,
    };
    setError(newError);
    if (Object.values(newError).some(Boolean)) return;
    setLoading(true);
    try {
      let finalUrl = videoUrl;
      if (sourceType === "upload" && uploadFile) {
        finalUrl = await uploadVideoFile(uploadFile, setUploading);
        if (!finalUrl) { setLoading(false); return; }
      }
      const method = selectedId ? "PUT" : "POST";
      const res = await fetch("/api/data", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection: REELS_COL, _id: selectedId,
          name, comment, videoUrl: finalUrl, rating: Number(rating),
        }),
      });
      if (res.ok) { reset(); fetchReels(); }
      else alert("Failed to save.");
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const deleteReel = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      await fetch("/api/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: REELS_COL, _id: selectedId }),
      });
      fetchReels(); reset();
    } finally { setLoading(false); }
  };

  const reset = () => {
    setName(""); setComment(""); setVideoUrl(""); setRating(5);
    setUploadFile(null); setUploadPreview(null); setSourceType("youtube");
    setSelectedId(null); setDeleteModalOpen(false);
    setError({ name: false, videoUrl: false });
    if (fileRef.current) fileRef.current.value = "";
  };

  const pages = Math.ceil(reels.length / rowsPerPage);
  const currentPageData = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return reels.slice(start, start + rowsPerPage);
  }, [page, reels]);

  if (isFetching) return (
    <div className="flex justify-center items-center h-40">
      <Spinner color="secondary" variant="gradient" size="md" />
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Form */}
      <div className="w-full md:w-1/3 bg-white p-4 rounded-xl border border-gray-100 h-min">
        <h2 className="text-lg font-semibold mb-3">{selectedId ? "Edit Reel" : "Add New Reel"}</h2>
        <div className="flex flex-col gap-4">
          <Input label="Name" placeholder="Customer Name" size="sm" value={name} labelPlacement="outside"
            isInvalid={error.name} errorMessage={error.name ? "Name is required" : ""}
            onChange={(e) => { setName(e.target.value); setError(p => ({ ...p, name: false })); }} />

          <Input label="Comment (optional)" placeholder="Customer comment" size="sm"
            value={comment} labelPlacement="outside" onChange={(e) => setComment(e.target.value)} />

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Rating</label>
            <div className="flex gap-1">
              {[1,2,3,4,5].map(star => (
                <button key={star} type="button" onClick={() => setRating(star)}>
                  <svg viewBox="0 0 20 20" fill="currentColor" className={`w-7 h-7 transition-colors ${star <= rating ? "text-yellow-400" : "text-gray-300"}`}>
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Video Source</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[["youtube","YouTube",<Youtube size={15} key="y"/>,"bg-red-500"],["upload","Upload",<Upload size={15} key="u"/>,"bg-blue-500"]].map(([type, label, icon, color]) => (
                <button key={type} type="button" onClick={() => setSourceType(type)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors
                    ${sourceType === type ? `${color} text-white` : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          {sourceType === "youtube" && (
            <Input label="YouTube URL" placeholder="https://youtube.com/shorts/..." size="sm"
              value={videoUrl} labelPlacement="outside"
              isInvalid={error.videoUrl} errorMessage={error.videoUrl ? "YouTube URL is required" : ""}
              onChange={(e) => { setVideoUrl(e.target.value); setError(p => ({ ...p, videoUrl: false })); }} />
          )}

          {sourceType === "upload" && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Video File</label>
              {(uploadPreview || (selectedId && isLocalVideo(videoUrl))) && (
                <video src={uploadPreview || videoUrl} className="w-full rounded-xl mb-2 max-h-[160px] object-cover bg-black" muted playsInline controls />
              )}
              <div onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors
                  ${error.videoUrl ? "border-red-400 bg-red-50" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"}`}>
                <Upload size={22} className="mx-auto mb-1 text-gray-400" />
                <p className="text-sm text-gray-600">{uploadFile ? uploadFile.name : "Click to select video"}</p>
                <p className="text-xs text-gray-400 mt-0.5">MP4, MOV, WEBM — max 500 MB</p>
                {error.videoUrl && <p className="text-xs text-red-500 mt-1">Video is required</p>}
              </div>
              <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
            </div>
          )}

          <CustomButton size="sm" className="bg-black text-white" onPress={save} isLoading={loading || uploading}>
            {uploading ? "Uploading..." : loading ? (selectedId ? "Updating..." : "Creating...") : selectedId ? "Update" : "Create"}
          </CustomButton>
          {selectedId && <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 text-center">Cancel</button>}
        </div>
      </div>

      {/* Table */}
      <div className="w-full md:w-2/3">
        <h2 className="text-lg font-semibold mb-3">Reel List</h2>
        {reels.length === 0 ? (
          <Empty title="No Reels Yet" description="Add video reels to show customer feedback." />
        ) : (
          <>
            <Table aria-label="Reel Table" shadow="none">
              <TableHeader>
                <TableColumn>Video</TableColumn>
                <TableColumn>Name</TableColumn>
                <TableColumn>Comment</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody>
                {currentPageData.map(item => (
                  <TableRow key={item._id}>
                    <TableCell><VideoThumb url={item.videoUrl} name={item.name} /></TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell><div className="line-clamp-1 max-w-[180px]">{item.comment}</div></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="p-2 bg-blue-100 hover:bg-blue-200 rounded-md cursor-pointer"
                          onClick={() => {
                            setName(item.name); setComment(item.comment); setVideoUrl(item.videoUrl);
                            setRating(item.rating || 5); setSelectedId(item._id);
                            setSourceType(isLocalVideo(item.videoUrl) ? "upload" : "youtube");
                            setUploadFile(null); setUploadPreview(null);
                          }}>
                          <RiEditCircleFill className="text-blue-500 text-lg" />
                        </span>
                        <span className="p-2 bg-red-100 hover:bg-red-200 rounded-md cursor-pointer"
                          onClick={() => { setSelectedId(item._id); setDeleteModalOpen(true); }}>
                          <MdDelete className="text-red-600 text-lg" />
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {reels.length > rowsPerPage && (
              <div className="flex justify-center mt-4">
                <Pagination isCompact showControls showShadow color="secondary" page={page} total={pages} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      <DeleteConfirmationModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} onConfirm={deleteReel} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2 — Shoppable Videos
// ═══════════════════════════════════════════════════════════════════════════

function ShoppableVideosTab() {
  const [reels, setReels]               = useState([]);
  const [isFetching, setIsFetching]     = useState(true);
  const [loading, setLoading]           = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [selectedId, setSelectedId]     = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [page, setPage]                 = useState(1);
  const rowsPerPage = 5;

  // form fields
  const [videoUrl, setVideoUrl]         = useState("");
  const [uploadFile, setUploadFile]     = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts]         = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showProductList, setShowProductList] = useState(false);
  const [error, setError]               = useState({ video: false, product: false });
  const fileRef = useRef(null);
  const searchRef = useRef(null);

  // Fetch products on mount
  useEffect(() => {
    fetch("/api/products?status=Active")
      .then(r => r.json())
      .then(d => setProducts(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const fetchReels = async () => {
    setIsFetching(true);
    try {
      const res = await fetch(`/api/data?collection=${SHOPPABLE_COL}`);
      const data = await res.json();
      if (res.ok) setReels(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (err) { console.error(err); }
    finally { setIsFetching(false); }
  };

  useEffect(() => { fetchReels(); }, []);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 8);
    const q = productSearch.toLowerCase();
    return products.filter(p => p.title?.toLowerCase().includes(q)).slice(0, 8);
  }, [productSearch, products]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
    setVideoUrl("");
    setError(p => ({ ...p, video: false }));
  };

  const save = async () => {
    const newError = {
      video: !uploadFile && !videoUrl,
      product: !selectedProduct,
    };
    setError(newError);
    if (Object.values(newError).some(Boolean)) return;

    setLoading(true);
    try {
      let finalUrl = videoUrl;
      if (uploadFile) {
        finalUrl = await uploadVideoFile(uploadFile, setUploading);
        if (!finalUrl) { setLoading(false); return; }
      }

      const p = selectedProduct;
      const price = Number(p.salePrice) > 0 ? Number(p.salePrice) : Number(p.regularPrice) || 0;

      const method = selectedId ? "PUT" : "POST";
      const res = await fetch("/api/data", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection: SHOPPABLE_COL, _id: selectedId,
          videoUrl: finalUrl,
          product: {
            id: p._id || p.id,
            title: p.title,
            image: Array.isArray(p.images) ? p.images[0] : p.image || "",
            price,
          },
        }),
      });
      if (res.ok) { reset(); fetchReels(); }
      else alert("Failed to save.");
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const deleteReel = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      await fetch("/api/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: SHOPPABLE_COL, _id: selectedId }),
      });
      fetchReels(); reset();
    } finally { setLoading(false); }
  };

  const reset = () => {
    setVideoUrl(""); setUploadFile(null); setUploadPreview(null);
    setSelectedProduct(null); setProductSearch(""); setSelectedId(null);
    setDeleteModalOpen(false); setError({ video: false, product: false });
    if (fileRef.current) fileRef.current.value = "";
  };

  const pages = Math.ceil(reels.length / rowsPerPage);
  const currentPageData = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return reels.slice(start, start + rowsPerPage);
  }, [page, reels]);

  if (isFetching) return (
    <div className="flex justify-center items-center h-40">
      <Spinner color="secondary" variant="gradient" size="md" />
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Form */}
      <div className="w-full md:w-1/3 bg-white p-4 rounded-xl border border-gray-100 h-min">
        <h2 className="text-lg font-semibold mb-1">{selectedId ? "Edit Video" : "Add Shoppable Video"}</h2>
        <p className="text-xs text-gray-400 mb-4">Upload a short video and link it to a product.</p>

        <div className="flex flex-col gap-4">
          {/* Video Upload */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Video File</label>
            {(uploadPreview || (selectedId && isLocalVideo(videoUrl))) && (
              <video src={uploadPreview || videoUrl}
                className="w-full rounded-xl mb-2 max-h-[200px] object-cover bg-black"
                muted playsInline controls />
            )}
            <div onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors
                ${error.video ? "border-red-400 bg-red-50" : "border-gray-300 hover:border-purple-400 hover:bg-purple-50"}`}>
              <Video size={22} className="mx-auto mb-1 text-gray-400" />
              <p className="text-sm text-gray-600">{uploadFile ? uploadFile.name : "Click to select video"}</p>
              <p className="text-xs text-gray-400 mt-0.5">MP4, MOV, WEBM — max 500 MB</p>
              {error.video && <p className="text-xs text-red-500 mt-1">Video is required</p>}
            </div>
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
          </div>

          {/* Product Search */}
          <div className="relative">
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Linked Product {error.product && <span className="text-red-500 text-xs ml-1">required</span>}
            </label>

            {/* Selected product preview */}
            {selectedProduct ? (
              <div className="flex items-center gap-2 p-2 bg-purple-50 border border-purple-200 rounded-lg">
                {selectedProduct.images?.[0] || selectedProduct.image ? (
                  <img src={selectedProduct.images?.[0] || selectedProduct.image} alt={selectedProduct.title}
                    className="w-10 h-10 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded bg-gray-200 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedProduct.title}</p>
                  <p className="text-xs text-purple-600">
                    {Number(selectedProduct.salePrice) > 0
                      ? Number(selectedProduct.salePrice)
                      : Number(selectedProduct.regularPrice) || 0} DH
                  </p>
                </div>
                <button onClick={() => { setSelectedProduct(null); setProductSearch(""); }}
                  className="text-gray-400 hover:text-red-500 flex-shrink-0 text-lg leading-none">×</button>
              </div>
            ) : (
              <div className="relative" ref={searchRef}>
                <input
                  type="text"
                  placeholder="Search product..."
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setShowProductList(true); }}
                  onFocus={() => setShowProductList(true)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none transition
                    ${error.product ? "border-red-400" : "border-gray-300 focus:border-purple-400"}`}
                />
                {showProductList && filteredProducts.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {filteredProducts.map(p => (
                      <div key={p._id || p.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-purple-50 cursor-pointer"
                        onMouseDown={() => {
                          setSelectedProduct(p);
                          setProductSearch(p.title);
                          setShowProductList(false);
                          setError(prev => ({ ...prev, product: false }));
                        }}>
                        {p.images?.[0] || p.image ? (
                          <img src={p.images?.[0] || p.image} alt={p.title} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-200 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{p.title}</p>
                          <p className="text-xs text-gray-400">
                            {Number(p.salePrice) > 0 ? Number(p.salePrice) : Number(p.regularPrice) || 0} DH
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <CustomButton size="sm" className="bg-purple-600 text-white" onPress={save} isLoading={loading || uploading}>
            {uploading ? "Uploading..." : loading ? (selectedId ? "Updating..." : "Creating...") : selectedId ? "Update" : "Add Video"}
          </CustomButton>
          {selectedId && <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 text-center">Cancel</button>}
        </div>
      </div>

      {/* Table */}
      <div className="w-full md:w-2/3">
        <h2 className="text-lg font-semibold mb-3">Shoppable Video List</h2>
        {reels.length === 0 ? (
          <Empty title="No Shoppable Videos" description="Add videos linked to products to show on the homepage." />
        ) : (
          <>
            <Table aria-label="Shoppable Table" shadow="none">
              <TableHeader>
                <TableColumn>Video</TableColumn>
                <TableColumn>Product</TableColumn>
                <TableColumn>Price</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody>
                {currentPageData.map(item => (
                  <TableRow key={item._id}>
                    <TableCell>
                      <video src={item.videoUrl} className="w-[45px] h-[60px] object-cover rounded-lg" muted playsInline />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {item.product?.image && (
                          <img src={item.product.image} alt={item.product?.title} className="w-8 h-8 rounded object-cover" />
                        )}
                        <span className="text-sm line-clamp-1 max-w-[160px]">{item.product?.title || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">{item.product?.price || 0} DH</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="p-2 bg-blue-100 hover:bg-blue-200 rounded-md cursor-pointer"
                          onClick={() => {
                            setVideoUrl(item.videoUrl); setSelectedId(item._id);
                            setUploadFile(null); setUploadPreview(null);
                            // Re-build selectedProduct from saved data
                            if (item.product) {
                              setSelectedProduct({
                                _id: item.product.id,
                                title: item.product.title,
                                image: item.product.image,
                                images: [item.product.image],
                                salePrice: item.product.price,
                                regularPrice: item.product.price,
                              });
                              setProductSearch(item.product.title);
                            }
                          }}>
                          <RiEditCircleFill className="text-blue-500 text-lg" />
                        </span>
                        <span className="p-2 bg-red-100 hover:bg-red-200 rounded-md cursor-pointer"
                          onClick={() => { setSelectedId(item._id); setDeleteModalOpen(true); }}>
                          <MdDelete className="text-red-600 text-lg" />
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {reels.length > rowsPerPage && (
              <div className="flex justify-center mt-4">
                <Pagination isCompact showControls showShadow color="secondary" page={page} total={pages} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      <DeleteConfirmationModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} onConfirm={deleteReel} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3 — Before / After
// ═══════════════════════════════════════════════════════════════════════════

const BA_COL = "before-after";

function BeforeAfterTab() {
  const [items,          setItems]          = useState([]);
  const [isFetching,     setIsFetching]     = useState(true);
  const [loading,        setLoading]        = useState(false);
  const [selectedId,     setSelectedId]     = useState(null);
  const [deleteModalOpen,setDeleteModalOpen] = useState(false);
  const [page,           setPage]           = useState(1);
  const rowsPerPage = 6;

  // form fields
  const [beforeImage,    setBeforeImage]    = useState("");
  const [afterImage,     setAfterImage]     = useState("");
  const [stars,          setStars]          = useState(5);
  const [tags,           setTags]           = useState("");       // comma-separated
  const [productSearch,  setProductSearch]  = useState("");
  const [selectedProduct,setSelectedProduct]= useState(null);
  const [products,       setProducts]       = useState([]);
  const [showProductList,setShowProductList]= useState(false);
  const [uploading,      setUploading]      = useState({ before: false, after: false });
  const searchRef  = useRef(null);
  const beforeRef  = useRef(null);
  const afterRef   = useRef(null);

  const fetchItems = async () => {
    setIsFetching(true);
    try {
      const res = await fetch(`/api/data?collection=${BA_COL}`);
      const d   = await res.json();
      if (res.ok) setItems(d.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } finally { setIsFetching(false); }
  };

  useEffect(() => { fetchItems(); }, []);

  useEffect(() => {
    fetch("/api/products?status=Active&limit=200")
      .then(r => r.json())
      .then(d => setProducts(Array.isArray(d) ? d : d.products || []))
      .catch(() => {});
  }, []);

  // close product dropdown on outside click
  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowProductList(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filteredProducts = products.filter(p =>
    p.title?.toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 20);

  const uploadImage = async (file, side) => {
    setUploading(p => ({ ...p, [side]: true }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch("/api/image", { method: "POST", body: fd });
      const data = await res.json();
      return data.url || null;
    } catch { alert("Image upload failed"); return null; }
    finally { setUploading(p => ({ ...p, [side]: false })); }
  };

  const handleImageSelect = async (e, side) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadImage(file, side);
    if (!url) return;
    if (side === "before") setBeforeImage(url);
    else setAfterImage(url);
  };

  const reset = () => {
    setBeforeImage(""); setAfterImage(""); setStars(5); setTags("");
    setSelectedProduct(null); setProductSearch(""); setSelectedId(null);
    setDeleteModalOpen(false);
    if (beforeRef.current) beforeRef.current.value = "";
    if (afterRef.current)  afterRef.current.value  = "";
  };

  const save = async () => {
    if (!beforeImage || !afterImage) { alert("Veuillez télécharger les deux images."); return; }
    setLoading(true);
    try {
      const tagList = tags.split(",").map(t => t.trim()).filter(Boolean);
      const productData = selectedProduct ? {
        id:    selectedProduct._id,
        title: selectedProduct.title,
        image: selectedProduct.images?.[0] || selectedProduct.image || "",
        price: Number(selectedProduct.salePrice) > 0
          ? Number(selectedProduct.salePrice)
          : Number(selectedProduct.regularPrice) || 0,
        slug:  selectedProduct._id || selectedProduct.id || "",
      } : null;
      const method = selectedId ? "PUT" : "POST";
      const res = await fetch("/api/data", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection: BA_COL, _id: selectedId,
          beforeImage, afterImage, stars, tags: tagList, product: productData,
        }),
      });
      if (res.ok) { reset(); fetchItems(); }
      else alert("Erreur lors de la sauvegarde.");
    } finally { setLoading(false); }
  };

  const deleteItem = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      await fetch("/api/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: BA_COL, _id: selectedId }),
      });
      fetchItems(); reset();
    } finally { setLoading(false); }
  };

  const pages = Math.ceil(items.length / rowsPerPage);
  const currentPageData = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return items.slice(start, start + rowsPerPage);
  }, [page, items]);

  if (isFetching) return (
    <div className="flex justify-center items-center h-40"><Spinner color="secondary" variant="gradient" size="md" /></div>
  );

  const ImageUploadSlot = ({ side, value, inputRef }) => (
    <div>
      <label className="text-sm font-medium text-gray-700 mb-1 block capitalize">
        Image {side === "before" ? "Avant" : "Après"}
        {uploading[side] && <span className="ml-2 text-xs text-gray-400">Téléversement…</span>}
      </label>
      {value ? (
        <div className="relative group rounded-xl overflow-hidden mb-2" style={{ aspectRatio: "1" }}>
          <img src={value} alt={side} className="w-full h-full object-cover" />
          <button
            onClick={() => side === "before" ? setBeforeImage("") : setAfterImage("")}
            className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          >×</button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 hover:border-rose-400 hover:bg-rose-50 rounded-xl p-4 text-center cursor-pointer transition-colors"
          style={{ aspectRatio: "1" }}
        >
          <Upload size={20} className="mx-auto mb-1 text-gray-400" />
          <p className="text-xs text-gray-500">Cliquer pour choisir</p>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={e => handleImageSelect(e, side)} />
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Form */}
      <div className="w-full md:w-1/3 bg-white p-4 rounded-xl border border-gray-100 h-min">
        <h2 className="text-lg font-semibold mb-1">{selectedId ? "Modifier" : "Ajouter une fiche"}</h2>
        <p className="text-xs text-gray-400 mb-4">Avant/Après avec produit lié et étiquettes.</p>

        <div className="flex flex-col gap-4">
          {/* Before / After images */}
          <div className="grid grid-cols-2 gap-3">
            <ImageUploadSlot side="before" value={beforeImage} inputRef={beforeRef} />
            <ImageUploadSlot side="after"  value={afterImage}  inputRef={afterRef}  />
          </div>

          {/* Stars */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Étoiles</label>
            <div className="flex gap-1">
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button" onClick={() => setStars(n)}
                  className="text-2xl leading-none transition-colors"
                  style={{ color: n <= stars ? "#e7002a" : "#d1d5db" }}>
                  ★
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Étiquettes (séparées par virgule)</label>
            <input type="text" value={tags} onChange={e => setTags(e.target.value)}
              placeholder="ex: Hydrate, Réduit les imperfections"
              className="w-full border border-gray-300 focus:border-rose-400 rounded-lg px-3 py-2 text-sm outline-none" />
          </div>

          {/* Product */}
          <div className="relative">
            <label className="text-sm font-medium text-gray-700 mb-1 block">Produit lié (optionnel)</label>
            {selectedProduct ? (
              <div className="flex items-center gap-2 p-2 bg-rose-50 border border-rose-200 rounded-lg">
                {selectedProduct.images?.[0] || selectedProduct.image ? (
                  <img src={selectedProduct.images?.[0] || selectedProduct.image}
                    alt={selectedProduct.title} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                ) : <div className="w-10 h-10 rounded bg-gray-200 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedProduct.title}</p>
                </div>
                <button onClick={() => { setSelectedProduct(null); setProductSearch(""); }}
                  className="text-gray-400 hover:text-red-500 flex-shrink-0 text-lg leading-none">×</button>
              </div>
            ) : (
              <div className="relative" ref={searchRef}>
                <input type="text" placeholder="Rechercher un produit…"
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setShowProductList(true); }}
                  onFocus={() => setShowProductList(true)}
                  className="w-full border border-gray-300 focus:border-rose-400 rounded-lg px-3 py-2 text-sm outline-none" />
                {showProductList && filteredProducts.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {filteredProducts.map(p => (
                      <button key={p._id} type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
                        onClick={() => { setSelectedProduct(p); setProductSearch(p.title); setShowProductList(false); }}>
                        {p.images?.[0] && <img src={p.images[0]} alt={p.title} className="w-8 h-8 rounded object-cover flex-shrink-0" />}
                        <span className="text-sm truncate">{p.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={loading}
              className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {loading ? "…" : selectedId ? "Mettre à jour" : "Ajouter"}
            </button>
            {selectedId && (
              <button onClick={reset} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
                Annuler
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1">
        {items.length === 0 ? (
          <Empty />
        ) : (
          <>
            <Table aria-label="Before/After items" removeWrapper>
              <TableHeader>
                <TableColumn>AVANT</TableColumn>
                <TableColumn>APRÈS</TableColumn>
                <TableColumn>PRODUIT</TableColumn>
                <TableColumn>ÉTIQUETTES</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableHeader>
              <TableBody>
                {currentPageData.map(item => (
                  <TableRow key={item._id}>
                    <TableCell>
                      {item.beforeImage
                        ? <img src={item.beforeImage} alt="avant" className="w-12 h-12 object-cover rounded-lg" />
                        : <div className="w-12 h-12 bg-gray-100 rounded-lg" />}
                    </TableCell>
                    <TableCell>
                      {item.afterImage
                        ? <img src={item.afterImage} alt="après" className="w-12 h-12 object-cover rounded-lg" />
                        : <div className="w-12 h-12 bg-gray-100 rounded-lg" />}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {item.product?.image && (
                          <img src={item.product.image} alt={item.product.title} className="w-8 h-8 rounded object-cover" />
                        )}
                        <span className="text-sm line-clamp-1 max-w-[120px]">{item.product?.title || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-gray-500 line-clamp-1">
                        {Array.isArray(item.tags) ? item.tags.join(", ") : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="p-2 bg-blue-100 hover:bg-blue-200 rounded-md cursor-pointer"
                          onClick={() => {
                            setSelectedId(item._id);
                            setBeforeImage(item.beforeImage || "");
                            setAfterImage(item.afterImage || "");
                            setStars(item.stars || 5);
                            setTags(Array.isArray(item.tags) ? item.tags.join(", ") : "");
                            if (item.product) {
                              setSelectedProduct({
                                _id: item.product.id,
                                title: item.product.title,
                                image: item.product.image,
                                images: [item.product.image],
                                salePrice: item.product.price,
                                regularPrice: item.product.price,
                                slug: item.product.slug,
                              });
                              setProductSearch(item.product.title);
                            }
                          }}>
                          <RiEditCircleFill className="text-blue-500 text-lg" />
                        </span>
                        <span className="p-2 bg-red-100 hover:bg-red-200 rounded-md cursor-pointer"
                          onClick={() => { setSelectedId(item._id); setDeleteModalOpen(true); }}>
                          <MdDelete className="text-red-600 text-lg" />
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {items.length > rowsPerPage && (
              <div className="flex justify-center mt-4">
                <Pagination isCompact showControls showShadow color="secondary" page={page} total={pages} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      <DeleteConfirmationModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} onConfirm={deleteItem} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT PAGE — tabs
// ═══════════════════════════════════════════════════════════════════════════

const TABS = [
  { id: "reels",      label: "Customer Reels",    icon: <Youtube size={16} /> },
  { id: "shoppable",  label: "Shoppable Videos",  icon: <ShoppingBag size={16} /> },
  { id: "beforeafter",label: "Avant / Après",     icon: <Video size={16} /> },
];

export default function ReelManagementPage() {
  const [activeTab, setActiveTab] = useState("reels");

  return (
    <div className="px-5 py-3">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Video Reels</h1>
        <p className="text-sm text-gray-500">Manage customer testimonials and shoppable videos.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${activeTab === tab.id
                ? "bg-white shadow text-gray-900"
                : "text-gray-500 hover:text-gray-700"}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "reels"       && <CustomerReelsTab />}
      {activeTab === "shoppable"   && <ShoppableVideosTab />}
      {activeTab === "beforeafter" && <BeforeAfterTab />}
    </div>
  );
}
