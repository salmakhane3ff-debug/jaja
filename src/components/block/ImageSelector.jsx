"use client";

import React, { useState, useEffect, useRef } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button, Spinner } from "@heroui/react";
import { FaCheckCircle } from "react-icons/fa";

// ── Detect video URLs ─────────────────────────────────────────────────────────
function isVideo(url = "") {
  const u = url.toLowerCase().split("?")[0];
  return (
    url.startsWith("data:video/") ||
    /\.(mp4|webm|ogg|mov|m4v|avi|mkv)$/.test(u) ||
    u.includes("/video/upload/") ||
    u.includes("/videos/")
  );
}

// ── Media thumbnail: image OR video preview ───────────────────────────────────
function MediaThumb({ url, alt, onClick, isSelected }) {
  const video = isVideo(url);
  return (
    <div
      onClick={onClick}
      className="relative w-full h-[150px] rounded-lg overflow-hidden cursor-pointer bg-gray-100"
    >
      {video ? (
        <>
          <video
            src={url}
            className="w-full h-full object-cover"
            muted
            preload="metadata"
            // show first frame
            onLoadedMetadata={(e) => { e.target.currentTime = 0.5; }}
          />
          {/* Play overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow">
              <svg className="w-4 h-4 text-gray-800 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
          {/* MP4 label */}
          <span className="absolute bottom-1 left-1 text-[9px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">
            MP4
          </span>
        </>
      ) : (
        <img
          src={url}
          alt={alt}
          className="w-full h-full object-contain object-center"
        />
      )}

      {/* Selected checkmark */}
      {isSelected && (
        <div className="absolute top-2 right-2 z-50 text-green-500 bg-white rounded-full p-1 shadow-md">
          <FaCheckCircle className="text-lg" />
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const ImageSelector = ({ isOpen, onClose, onSelectImages, selectType = "multiple" }) => {
  const [images,    setImages]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selected,  setSelected]  = useState(new Set());
  const fileInputRef = useRef(null);

  const fetchImages = async () => {
    try {
      setLoading(true);
      const res  = await fetch("/api/image");
      const data = await res.json();
      setImages(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      console.error("Failed to fetch images:", err);
    } finally {
      setLoading(false);
    }
  };

  const triggerFileSelect = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/image", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Upload failed");
        uploaded.push(await res.json());
      }
      setImages((prev) => [...uploaded, ...prev]);
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setUploading(false);
    }
  };

  const handleClickImage = (url) => {
    if (selectType === "single") {
      onSelectImages(url);
      onClose();
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        next.has(url) ? next.delete(url) : next.add(url);
        return next;
      });
    }
  };

  const handleDone = () => {
    onSelectImages(Array.from(selected));
    onClose();
    setSelected(new Set());
  };

  const handleDeleteImage = async (_id) => {
    await new Promise((r) => setTimeout(r, 0));
    try {
      const res = await fetch("/api/image", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ _id }),
      });
      if (!res.ok) throw new Error("Delete failed");
      setImages((prev) => prev.filter((img) => img._id !== _id));
      setSelected((prev) => {
        const next    = new Set(prev);
        const deleted = images.find((img) => img._id === _id);
        if (deleted) next.delete(deleted.url);
        return next;
      });
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  useEffect(() => {
    if (isOpen) fetchImages();
  }, [isOpen]);

  return (
    <Modal className="min-h-[400px]" size="4xl" scrollBehavior="inside" isOpen={isOpen} onOpenChange={onClose} hideCloseButton="true">
      <ModalContent>
        <ModalHeader className="flex justify-between items-center">
          <span>Select {selectType === "multiple" ? "Images" : "Image"}</span>
          <div className="flex items-center gap-2">
            {/* Accept images + videos */}
            <input
              type="file"
              accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime"
              multiple
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <Button size="sm" className="bg-black text-white" onPress={triggerFileSelect} isLoading={uploading}>
              Upload
            </Button>
          </div>
        </ModalHeader>

        <ModalBody className="max-h-[400px] overflow-auto scroll-smooth">
          {loading ? (
            <div className="flex justify-center items-center h-[200px]">
              <Spinner />
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {Array.isArray(images) && images.map((image) => (
                <div key={image._id} className="relative rounded-lg overflow-hidden group">
                  <MediaThumb
                    url={image.url}
                    alt={image.name}
                    isSelected={selected.has(image.url)}
                    onClick={() => handleClickImage(image.url)}
                  />
                  <button
                    className="absolute top-2 left-2 text-white bg-red-600 rounded-full cursor-pointer text-xs px-2 py-1 hidden group-hover:block z-10"
                    onClick={() => handleDeleteImage(image._id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </ModalBody>

        {selectType === "multiple" && (
          <ModalFooter className="justify-between">
            <Button className="bg-red-600 text-white" size="sm" onPress={onClose}>
              Cancel
            </Button>
            <Button className="bg-blue-700 text-white" size="sm" onPress={handleDone} isDisabled={selected.size === 0}>
              Select {selected.size} Image{selected.size > 1 ? "s" : ""}
            </Button>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
};

export default ImageSelector;
