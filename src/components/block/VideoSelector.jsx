"use client";

import React, { useState, useEffect, useRef } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button, Spinner } from "@heroui/react";

const VideoSelector = ({ isOpen, onClose, onSelectVideo }) => {
  const [videos,    setVideos]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const fileInputRef = useRef(null);

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/video");
      const data = await res.json();
      setVideos(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch videos:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const uploaded = [];
      for (let i = 0; i < files.length; i++) {
        const file     = files[i];
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/video", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Upload failed");

        const saved = await res.json();
        uploaded.push(saved);
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }
      setVideos((prev) => [...uploaded, ...prev]);
    } catch (err) {
      console.error("Video upload error:", err);
      alert("Upload failed: " + err.message);
    } finally {
      setUploading(false);
      setUploadProgress(null);
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSelect = (video) => {
    onSelectVideo(video.url);
    onClose();
  };

  const handleDelete = async (videoId) => {
    try {
      const res = await fetch("/api/video", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ _id: videoId }),
      });
      if (!res.ok) throw new Error("Delete failed");
      setVideos((prev) => prev.filter((v) => v._id !== videoId));
    } catch (err) {
      console.error("Video delete error:", err);
    }
  };

  useEffect(() => {
    if (isOpen) fetchVideos();
  }, [isOpen]);

  return (
    <Modal size="4xl" scrollBehavior="inside" isOpen={isOpen} onOpenChange={onClose} hideCloseButton>
      <ModalContent>
        <ModalHeader className="flex justify-between items-center">
          <span>Select Video</span>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="video/*"
              multiple
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <Button
              size="sm"
              className="bg-black text-white"
              onPress={() => fileInputRef.current?.click()}
              isLoading={uploading}
            >
              {uploading ? `Uploading ${uploadProgress ?? 0}%` : "Upload Video"}
            </Button>
          </div>
        </ModalHeader>

        <ModalBody className="max-h-[460px] overflow-auto">
          {loading ? (
            <div className="flex justify-center items-center h-[200px]">
              <Spinner />
            </div>
          ) : videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-gray-400">
              <span className="text-5xl mb-3">🎬</span>
              <p className="text-sm font-medium">No videos uploaded yet</p>
              <p className="text-xs mt-1">Click "Upload Video" to add your first video</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {videos.map((video) => (
                <div key={video._id} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-black">
                  {/* Thumbnail */}
                  <div
                    className="relative cursor-pointer"
                    onClick={() => handleSelect(video)}
                  >
                    <video
                      src={video.url}
                      className="w-full h-[130px] object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      preload="metadata"
                      muted
                    />
                    {/* Play overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                        <svg className="w-4 h-4 text-gray-900 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.841z" />
                        </svg>
                      </div>
                    </div>
                    {/* Select overlay */}
                    <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/10 transition-colors flex items-end p-2">
                      <span className="text-[10px] text-white font-semibold bg-black/60 px-2 py-0.5 rounded-full truncate max-w-full opacity-0 group-hover:opacity-100 transition-opacity">
                        {video.name}
                      </span>
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    className="absolute top-2 right-2 text-white bg-red-600 rounded-full text-xs px-2 py-0.5 hidden group-hover:block transition-all shadow"
                    onClick={(e) => { e.stopPropagation(); handleDelete(video._id); }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </ModalBody>

        <ModalFooter className="justify-end">
          <Button size="sm" className="bg-gray-200 text-gray-700" onPress={onClose}>
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default VideoSelector;
