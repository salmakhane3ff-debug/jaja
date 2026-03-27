"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Input, Spinner, Pagination } from "@heroui/react";
import { MdDelete } from "react-icons/md";
import { RiEditCircleFill } from "react-icons/ri";
import SingleImageSelect from "@/components/block/ImageSelector";
import VideoSelector from "@/components/block/VideoSelector";
import DeleteConfirmationModal from "@/components/block/DeleteConfirmationModal";
import Empty from "@/components/block/Empty";
import CustomButton from "@/components/block/CustomButton";

const COLLECTION           = "slider-image";
const TOP_OFFER_COLLECTION = "top-offer-banner";

export default function SliderImagePage() {
  // ── Slide form state ────────────────────────────────────────────────────────
  const [sliderImages,      setSliderImages]      = useState([]);
  const [title,             setTitle]             = useState("");
  const [image,             setImage]             = useState("");
  const [url,               setUrl]               = useState("");
  const [mediaType,         setMediaType]         = useState("image");  // "image" | "video"
  const [videoUrl,          setVideoUrl]          = useState("");
  const [active,            setActive]            = useState(true);     // ON / OFF
  const [showBuyNow,        setShowBuyNow]        = useState(false);
  const [buyNowText,        setBuyNowText]        = useState("Buy Now");
  const [buyNowUrl,         setBuyNowUrl]         = useState("");

  // ── Top Offer Banner ────────────────────────────────────────────────────────
  const [topOfferBanner,    setTopOfferBanner]    = useState(null);
  const [topOfferImage,     setTopOfferImage]     = useState("");
  const [topOfferUrl,       setTopOfferUrl]       = useState("");
  const [topOfferLoading,   setTopOfferLoading]   = useState(false);
  const [topOfferModalOpen, setTopOfferModalOpen] = useState(false);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [loading,           setLoading]           = useState(false);
  const [isModalOpen,       setModalOpen]         = useState(false);
  const [videoSelectorOpen, setVideoSelectorOpen] = useState(false);
  const [isFetching,        setIsFetching]        = useState(true);
  const [selectedId,        setSelectedId]        = useState(null);
  const [deleteModalOpen,   setDeleteModalOpen]   = useState(false);

  // ── Validation ──────────────────────────────────────────────────────────────
  const [titleError,        setTitleError]        = useState(false);
  const [urlError,          setUrlError]          = useState(false);
  const [imageError,        setImageError]        = useState(false);
  const [videoUrlError,     setVideoUrlError]     = useState(false);
  const [buyNowUrlError,    setBuyNowUrlError]    = useState(false);

  const [page, setPage] = useState(1);
  const rowsPerPage = 8;

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchSliderImages = async () => {
    setIsFetching(true);
    try {
      const res  = await fetch(`/api/data?collection=${COLLECTION}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setSliderImages(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      }
    } catch (err) {
      console.error("Fetch slides failed", err);
    } finally {
      setIsFetching(false);
    }
  };

  const fetchTopOfferBanner = async () => {
    try {
      const res  = await fetch(`/api/data?collection=${TOP_OFFER_COLLECTION}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.length > 0) {
        const banner = data[0];
        setTopOfferBanner(banner);
        setTopOfferImage(banner.image || "");
        setTopOfferUrl(banner.url    || "");
      }
    } catch (err) {
      console.error("Fetch top offer banner failed", err);
    }
  };

  useEffect(() => { fetchSliderImages(); fetchTopOfferBanner(); }, []);

  // ── Quick toggle active (from table row) ────────────────────────────────────

  const toggleActive = async (item) => {
    try {
      await fetch("/api/data", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...item, collection: COLLECTION, active: !(item.active !== false) }),
      });
      fetchSliderImages();
    } catch (err) {
      console.error("Toggle active failed", err);
    }
  };

  // ── Create / Update ─────────────────────────────────────────────────────────

  const createOrUpdateImage = async () => {
    let hasError = false;
    if (!title)                              { setTitleError(true);    hasError = true; }
    if (mediaType === "image" && !image)     { setImageError(true);    hasError = true; }
    if (mediaType === "video" && !videoUrl)  { setVideoUrlError(true); hasError = true; }
    if (showBuyNow && !buyNowUrl)            { setBuyNowUrlError(true); hasError = true; }
    if (hasError) return;

    setLoading(true);
    try {
      const method  = selectedId ? "PUT" : "POST";
      const payload = {
        collection: COLLECTION,
        _id:        selectedId,
        title,
        url,
        mediaType,
        image:      mediaType === "image" ? image    : "",
        videoUrl:   mediaType === "video" ? videoUrl : "",
        active,
        showBuyNow,
        buyNowText: showBuyNow ? (buyNowText || "Buy Now") : "",
        buyNowUrl:  showBuyNow ? buyNowUrl : "",
      };

      const res  = await fetch("/api/data", {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) { resetForm(); fetchSliderImages(); }
      else { console.error("Save failed", data); alert("Failed to save slide: " + (data.error || "Unknown error")); }
    } catch (err) {
      console.error("Save error:", err);
      alert("Network error while saving");
    } finally {
      setLoading(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────

  const deleteImage = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/data", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ collection: COLLECTION, _id: selectedId }),
      });
      if (res.ok) { fetchSliderImages(); resetForm(); }
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle(""); setImage(""); setUrl("");
    setMediaType("image"); setVideoUrl("");
    setActive(true);
    setShowBuyNow(false); setBuyNowText("Buy Now"); setBuyNowUrl("");
    setSelectedId(null); setDeleteModalOpen(false);
    setTitleError(false); setUrlError(false);
    setImageError(false); setVideoUrlError(false); setBuyNowUrlError(false);
  };

  // ── Top Offer Banner ────────────────────────────────────────────────────────

  const saveTopOfferBanner = async () => {
    if (!topOfferImage) { alert("Please select an image for the top offer banner"); return; }
    setTopOfferLoading(true);
    try {
      const method  = topOfferBanner?._id ? "PUT" : "POST";
      const payload = {
        collection: TOP_OFFER_COLLECTION, _id: topOfferBanner?._id,
        title: "Top Offer Banner", image: topOfferImage, url: topOfferUrl || "#",
      };
      const res = await fetch("/api/data", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) fetchTopOfferBanner();
      else alert("Failed to save top offer banner");
    } catch (err) {
      console.error("Save top offer error:", err);
    } finally {
      setTopOfferLoading(false);
    }
  };

  const deleteTopOfferBanner = async () => {
    if (!topOfferBanner?._id) return;
    setTopOfferLoading(true);
    try {
      const res = await fetch("/api/data", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: TOP_OFFER_COLLECTION, _id: topOfferBanner._id }),
      });
      if (res.ok) { setTopOfferBanner(null); setTopOfferImage(""); setTopOfferUrl(""); }
    } catch (err) {
      console.error("Delete top offer error:", err);
    } finally {
      setTopOfferLoading(false);
    }
  };

  // ── Pagination ──────────────────────────────────────────────────────────────

  const pages = Math.ceil(sliderImages.length / rowsPerPage);
  const currentPageData = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return sliderImages.slice(start, start + rowsPerPage);
  }, [page, sliderImages]);

  if (isFetching) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-80px)]">
        <Spinner color="secondary" variant="gradient" size="md" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="px-5 py-3">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Slider & Banner Management</h1>
          <p className="text-sm text-gray-600">Manage your home page slider images, videos and top offer banner.</p>
        </div>
      </div>

      {/* ── Top Offer Banner ─────────────────────────────────────────────────── */}
      <div className="mb-8 bg-white p-6 rounded-lg border border-gray-200">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="text-2xl">🎯</span> Top Offer Banner
        </h2>
        <p className="text-sm text-gray-600 mb-4">This banner appears at the very top of your homepage</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-xs font-semibold text-orange-900 mb-1">📐 Recommended Size:</p>
              <ul className="text-xs text-orange-800 space-y-0.5">
                <li>• Full Width Banner</li>
                <li>• Desktop: <strong>1920x80px</strong></li>
                <li>• Mobile: <strong>800x80px</strong></li>
              </ul>
            </div>
            <Input label="Redirect URL (Optional)" placeholder="https://example.com/offer" size="sm"
              value={topOfferUrl} labelPlacement="outside" onChange={(e) => setTopOfferUrl(e.target.value)} />
            <div onClick={() => setTopOfferModalOpen(true)}
              className={`flex justify-center items-center border-2 border-dashed rounded-md cursor-pointer hover:border-orange-400 transition-colors ${!topOfferImage ? "h-[100px]" : ""}`}
              style={{ backgroundColor: topOfferImage ? "transparent" : "#fff8f0" }}>
              {topOfferImage ? (
                <div className="relative w-full group">
                  <img src={topOfferImage} alt="top offer" className="w-full h-[100px] object-cover rounded-md" />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity rounded-md flex items-center justify-center">
                    <span className="text-white opacity-0 group-hover:opacity-100 text-sm font-medium">Click to change</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <span className="text-orange-600 font-medium">Click to select banner image</span>
                  <p className="text-xs text-gray-500 mt-1">Full width banner for top of homepage</p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <CustomButton size="sm" className="flex-1 bg-orange-500 text-white" onPress={saveTopOfferBanner} isLoading={topOfferLoading}>
                {topOfferBanner?._id ? "Update Banner" : "Save Banner"}
              </CustomButton>
              {topOfferBanner?._id && (
                <CustomButton size="sm" className="bg-red-500 text-white" onPress={deleteTopOfferBanner} isLoading={topOfferLoading}>
                  Delete
                </CustomButton>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Preview:</label>
            <div className="border-2 border-gray-200 rounded-lg overflow-hidden bg-gray-50">
              {topOfferImage ? (
                <img src={topOfferImage} alt="preview" className="w-full h-[100px] object-cover" />
              ) : (
                <div className="w-full h-[100px] flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <p className="text-sm">No banner selected</p>
                    <p className="text-xs mt-1">Your top offer banner will appear here</p>
                  </div>
                </div>
              )}
            </div>
            {topOfferImage && (
              <div className="text-xs text-gray-600 bg-green-50 border border-green-200 rounded p-2">
                ✅ Banner is active and will show on homepage
              </div>
            )}
          </div>
        </div>
      </div>

      <SingleImageSelect isOpen={topOfferModalOpen} onClose={() => setTopOfferModalOpen(false)}
        onSelectImages={(url) => setTopOfferImage(url)} selectType="single" />

      <div className="border-t border-gray-300 my-8" />

      {/* ── Main Slider ──────────────────────────────────────────────────────── */}
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <span className="text-2xl">🎞️</span> Main Slider
      </h2>

      <div className="flex flex-col md:flex-row gap-6">

        {/* ── Form ── */}
        <div className="w-full md:w-1/3 bg-white p-4 rounded-lg h-min border border-gray-100">
          <h2 className="text-lg font-semibold mb-3">{selectedId ? "Edit Slide" : "Add New Slide"}</h2>

          {/* ON / OFF toggle */}
          <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <div>
              <p className="text-sm font-semibold text-gray-800">Slide Status</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {active ? "Visible on homepage" : "Hidden from homepage"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActive(!active)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                active ? "bg-green-500" : "bg-gray-300"
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                active ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          {/* Media type toggle */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4">
            <button type="button" onClick={() => { setMediaType("image"); setVideoUrlError(false); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-all ${
                mediaType === "image" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              <span>🖼️</span> Image
            </button>
            <button type="button" onClick={() => { setMediaType("video"); setImageError(false); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-all ${
                mediaType === "video" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              <span>🎬</span> Video
            </button>
          </div>

          {mediaType === "image" && (
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs font-semibold text-blue-900 mb-1">📐 Recommended Size:</p>
              <ul className="text-xs text-blue-800 space-y-0.5">
                <li>• Desktop: <strong>1920×500px</strong></li>
                <li>• Mobile: <strong>800×300px</strong></li>
              </ul>
            </div>
          )}
          {mediaType === "video" && (
            <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-xs font-semibold text-purple-900 mb-1">🎬 Video Support:</p>
              <ul className="text-xs text-purple-800 space-y-0.5">
                <li>• YouTube URL (youtube.com / youtu.be)</li>
                <li>• Direct MP4 URL</li>
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <Input label="Slide Title" placeholder="Enter title" size="sm" value={title} labelPlacement="outside"
              isInvalid={titleError} errorMessage={titleError ? "Title is required" : ""}
              onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(false); }} />

            <Input label="Redirect URL (Optional)" placeholder="https://example.com" size="sm" value={url}
              labelPlacement="outside" isInvalid={urlError} errorMessage={urlError ? "URL is required" : ""}
              onChange={(e) => { setUrl(e.target.value); if (urlError) setUrlError(false); }} />

            {/* Image picker */}
            {mediaType === "image" && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">
                  Slide Image <span className="text-red-500">*</span>
                </p>
                <div onClick={() => setModalOpen(true)}
                  className={`flex justify-center items-center border-2 rounded-md cursor-pointer transition-colors
                    ${imageError ? "border-red-400 bg-red-50" : "border-dashed border-gray-300 hover:border-gray-500"}
                    ${!image ? "h-[200px]" : ""}`}>
                  {image ? (
                    <img src={image} alt="slide preview" className="w-full h-[200px] object-cover rounded-md" />
                  ) : (
                    <div className="text-center">
                      <span className={imageError ? "text-red-500 font-medium" : "text-gray-400"}>
                        {imageError ? "⚠ Please select an image" : "Click to select an image"}
                      </span>
                    </div>
                  )}
                </div>
                {image && (
                  <button type="button" onClick={() => setImage("")}
                    className="text-xs text-red-400 hover:text-red-600 mt-1 underline">
                    Remove image
                  </button>
                )}
              </div>
            )}

            {/* Video picker */}
            {mediaType === "video" && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">
                  Video <span className="text-red-500">*</span>
                </p>
                <div onClick={() => setVideoSelectorOpen(true)}
                  className={`flex justify-center items-center border-2 rounded-xl cursor-pointer transition-colors overflow-hidden
                    ${videoUrlError ? "border-red-400 bg-red-50" : "border-dashed border-gray-300 hover:border-purple-400 hover:bg-purple-50"}
                    ${!videoUrl ? "h-[160px]" : ""}`}>
                  {videoUrl ? (
                    <div className="relative w-full group">
                      {videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be") ? (
                        <div className="w-full h-[160px] bg-black relative">
                          {(() => {
                            const m = videoUrl.match(/(?:v=|youtu\.be\/)([^?&\s]+)/);
                            return m ? (
                              <img src={`https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`} alt="YouTube thumbnail"
                                className="w-full h-full object-cover opacity-80" />
                            ) : <span className="text-white text-4xl absolute inset-0 flex items-center justify-center">▶</span>;
                          })()}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
                              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.841z" />
                              </svg>
                            </div>
                          </div>
                          <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full font-semibold">YouTube</div>
                        </div>
                      ) : (
                        <video src={videoUrl} className="w-full h-[160px] object-cover" preload="metadata" muted />
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <span className="text-white text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 px-3 py-1.5 rounded-lg">
                          Click to change
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center px-4">
                      <div className="text-3xl mb-2">🎬</div>
                      <span className={`text-sm font-medium ${videoUrlError ? "text-red-500" : "text-gray-500"}`}>
                        {videoUrlError ? "⚠ Please select a video" : "Click to select a video"}
                      </span>
                      <p className="text-xs text-gray-400 mt-1">Upload from library</p>
                    </div>
                  )}
                </div>
                {videoUrl && (
                  <button type="button" onClick={() => { setVideoUrl(""); setVideoUrlError(false); }}
                    className="text-xs text-red-400 hover:text-red-600 mt-1 underline">
                    Remove video
                  </button>
                )}
                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 border-t border-gray-200" />
                  <span className="text-xs text-gray-400 font-medium">OR paste YouTube / external URL</span>
                  <div className="flex-1 border-t border-gray-200" />
                </div>
                <Input placeholder="https://youtube.com/watch?v=... or https://cdn.example.com/video.mp4"
                  size="sm" value={videoUrl} labelPlacement="outside"
                  onChange={(e) => { setVideoUrl(e.target.value); if (videoUrlError) setVideoUrlError(false); }} />
              </div>
            )}

            {/* ── Buy Now Button ── */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Header toggle */}
              <button type="button" onClick={() => setShowBuyNow(!showBuyNow)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-base">🛒</span>
                  <span className="text-sm font-semibold text-gray-800">Buy Now Button</span>
                  {showBuyNow && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">ON</span>
                  )}
                </div>
                {/* toggle pill */}
                <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showBuyNow ? "bg-green-500" : "bg-gray-300"}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${showBuyNow ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                </div>
              </button>

              {/* Fields — only when enabled */}
              {showBuyNow && (
                <div className="p-3 space-y-3 bg-white">
                  <Input label="Button Text" placeholder="Buy Now" size="sm" value={buyNowText} labelPlacement="outside"
                    onChange={(e) => setBuyNowText(e.target.value)} />
                  <Input label={<>Button URL <span className="text-red-500">*</span></>}
                    placeholder="https://example.com/product" size="sm" value={buyNowUrl} labelPlacement="outside"
                    isInvalid={buyNowUrlError} errorMessage={buyNowUrlError ? "URL is required when Buy Now is enabled" : ""}
                    onChange={(e) => { setBuyNowUrl(e.target.value); if (buyNowUrlError) setBuyNowUrlError(false); }} />
                  {/* Live preview */}
                  <div className="pt-1">
                    <p className="text-xs text-gray-400 mb-1.5">Preview:</p>
                    <a href="#" onClick={(e) => e.preventDefault()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white text-xs font-bold rounded-xl shadow transition-colors">
                      🛒 {buyNowText || "Buy Now"}
                    </a>
                  </div>
                </div>
              )}
            </div>

            <CustomButton size="sm" className="bg-black text-white" onPress={createOrUpdateImage} isLoading={loading}>
              {loading ? (selectedId ? "Updating..." : "Creating...") : selectedId ? "Update" : "Create"}
            </CustomButton>

            {selectedId && (
              <button type="button" onClick={resetForm}
                className="text-xs text-gray-400 hover:text-gray-600 underline text-center">
                Cancel edit
              </button>
            )}
          </div>
        </div>

        <SingleImageSelect isOpen={isModalOpen} onClose={() => setModalOpen(false)}
          onSelectImages={(url) => { setImage(url); setImageError(false); }} selectType="single" />

        <VideoSelector isOpen={videoSelectorOpen} onClose={() => setVideoSelectorOpen(false)}
          onSelectVideo={(url) => { setVideoUrl(url); setVideoUrlError(false); }} />

        {/* ── Table ── */}
        <div className="w-full md:w-2/3">
          <h2 className="text-lg font-semibold mb-3">Slide List ({sliderImages.length})</h2>

          {sliderImages.length === 0 ? (
            <Empty title="No Slides" description="Add images or videos to appear in your slider." />
          ) : (
            <div className="space-y-3">
              {currentPageData.map((item) => {
                const isVideo    = item.mediaType === "video";
                const isActive   = item.active !== false;
                const hasBuyNow  = item.showBuyNow && item.buyNowUrl;

                return (
                  <div key={item._id}
                    className={`flex items-center gap-3 bg-white border rounded-xl p-3 shadow-sm transition-opacity ${
                      isActive ? "border-gray-100" : "border-gray-200 opacity-60"
                    }`}>

                    {/* Thumbnail */}
                    <div className="w-20 h-14 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-200 relative">
                      {isVideo ? (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 text-white">
                          <span className="text-xl">🎬</span>
                          <span className="text-[9px] font-semibold mt-0.5 opacity-70">VIDEO</span>
                        </div>
                      ) : item.image ? (
                        <img src={item.image} alt={item.title} className="w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = "none"; }} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">No image</div>
                      )}
                      {/* Inactive overlay */}
                      {!isActive && (
                        <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
                          <span className="text-[9px] font-bold text-gray-500 bg-white/80 px-1 rounded">OFF</span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <p className="font-semibold text-sm text-gray-900 truncate">{item.title}</p>
                        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          isVideo ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {isVideo ? "VIDEO" : "IMAGE"}
                        </span>
                        {hasBuyNow && (
                          <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-900 text-white">
                            🛒 {item.buyNowText || "Buy Now"}
                          </span>
                        )}
                      </div>
                      {item.url && <p className="text-xs text-gray-400 truncate">{item.url}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* ON/OFF quick toggle */}
                      <button type="button" onClick={() => toggleActive(item)}
                        title={isActive ? "Click to hide" : "Click to show"}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                          isActive ? "bg-green-500" : "bg-gray-300"
                        }`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          isActive ? "translate-x-6" : "translate-x-1"
                        }`} />
                      </button>

                      <button className="p-2 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        onClick={() => {
                          setTitle(item.title);
                          setImage(item.image || "");
                          setUrl(item.url || "");
                          setMediaType(item.mediaType || "image");
                          setVideoUrl(item.videoUrl || "");
                          setActive(item.active !== false);
                          setShowBuyNow(!!item.showBuyNow);
                          setBuyNowText(item.buyNowText || "Buy Now");
                          setBuyNowUrl(item.buyNowUrl || "");
                          setSelectedId(item._id);
                          setImageError(false); setVideoUrlError(false); setBuyNowUrlError(false);
                        }}>
                        <RiEditCircleFill className="text-blue-500 text-lg" />
                      </button>
                      <button className="p-2 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                        onClick={() => { setSelectedId(item._id); setDeleteModalOpen(true); }}>
                        <MdDelete className="text-red-600 text-lg" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {sliderImages.length > rowsPerPage && (
            <div className="flex justify-center mt-4">
              <Pagination isCompact showControls showShadow color="secondary" page={page} total={pages} onChange={setPage} />
            </div>
          )}
        </div>
      </div>

      <DeleteConfirmationModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} onConfirm={deleteImage} />
    </div>
  );
}

// ── YouTube helpers ───────────────────────────────────────────────────────────

function getYouTubeEmbedUrl(url) {
  const short = url.match(/youtu\.be\/([^?&\s]+)/);
  if (short) return `https://www.youtube.com/embed/${short[1]}?autoplay=1&mute=1&loop=1&playlist=${short[1]}&controls=0&playsinline=1`;
  const long  = url.match(/[?&]v=([^&\s]+)/);
  if (long)  return `https://www.youtube.com/embed/${long[1]}?autoplay=1&mute=1&loop=1&playlist=${long[1]}&controls=0&playsinline=1`;
  return url;
}
