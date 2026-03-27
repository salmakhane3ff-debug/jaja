"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, Image as ImageIcon, Trash2 } from "lucide-react";
import { Pagination, Spinner } from "@heroui/react";
import DeleteConfirmationModal from "@/components/block/DeleteConfirmationModal";
import CustomButton from "@/components/block/CustomButton";
import formatDate from "@/utils/formatDate";

export default function ImagesPage() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(12);
  const [uploading, setUploading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState(null);
  const fileInputRef = useRef(null);

  const totalPages = Math.ceil(images.length / rowsPerPage);
  const paginatedImages = images.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  useEffect(() => {
    fetchImages();
  }, []);

  const fetchImages = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/image");
      const data = await res.json();
      setImages(data || []);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploading(true);
      const res = await fetch("/api/image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setImages((prev) => [data, ...prev]);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await fetch("/api/image", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: selectedImageId }),
      });
      setImages((prev) => prev.filter((img) => img._id !== selectedImageId));
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleteModalOpen(false);
      setSelectedImageId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-80px)]">
        <div className="text-center">
          <Spinner color="secondary" variant="gradient" size="md" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-0 md:p-6 space-y-6">
      {/* Simple Header */}
      <div className="flex flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Images</h1>
          <p className="text-gray-600 text-sm mt-1">
            {images.length} {images.length === 1 ? "image" : "images"} in library
          </p>
        </div>
        <CustomButton 
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="w-4 h-4 mr-2" />
          {uploading ? "Uploading..." : "Upload Image"}
        </CustomButton>
        <input 
          ref={fileInputRef} 
          type="file" 
          accept="image/*" 
          hidden 
          onChange={handleUpload} 
        />
      </div>

      {/* Images Content */}
      <div className="bg-white rounded-xl overflow-hidden">
        {images.length === 0 ? (
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-gray-50 rounded-xl">
                <ImageIcon className="w-8 h-8 text-gray-400" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No images yet</h3>
            <p className="text-gray-600 mb-4 text-sm">Get started by uploading your first image to the library.</p>
            <CustomButton
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? "Uploading..." : "Upload First Image"}
            </CustomButton>
          </div>
        ) : (
          <div className="p-4 sm:p-6">
            {/* Grid View for all devices */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {paginatedImages.map((img) => (
                <div key={img._id} className="group relative bg-gray-50 rounded-xl overflow-hidden transition-all duration-300">
                  <div className="relative aspect-square overflow-hidden bg-gray-100">
                    <img 
                      src={img.url} 
                      alt={img.name} 
                      className="w-full h-full object-cover transition-transform duration-300 " 
                      loading="lazy"
                    />
                    <button
                      onClick={() => {
                        setSelectedImageId(img._id);
                        setDeleteModalOpen(true);
                      }}
                      className="absolute top-2 right-2 w-8 h-8 bg-red-500/80 hover:bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-3">
                    <h4 className="font-medium text-gray-900 text-sm mb-1 truncate" title={img.name}>
                      {img.name}
                    </h4>
                    <p className="text-xs text-gray-500">{formatDate(img.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {images.length > rowsPerPage && (
              <div className="flex justify-center mt-6 pt-6 ">
                <Pagination 
                  isCompact 
                  showControls 
                  color="primary" 
                  page={page} 
                  total={totalPages} 
                  onChange={(page) => setPage(page)} 
                />
              </div>
            )}
          </div>
        )}
      </div>

      <DeleteConfirmationModal 
        isOpen={deleteModalOpen} 
        onClose={() => setDeleteModalOpen(false)} 
        onConfirm={handleDelete} 
      />
    </div>
  );
}
