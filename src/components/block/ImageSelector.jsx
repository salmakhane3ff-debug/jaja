"use client";

import React, { useState, useEffect, useRef } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button, Spinner } from "@heroui/react";
import { FaCheckCircle } from "react-icons/fa";

const ImageSelector = ({ isOpen, onClose, onSelectImages, selectType = "multiple" }) => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const fileInputRef = useRef(null);

  const fetchImages = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/image");
      const data = await res.json();
      setImages(Array.isArray(data) ? data : data.data || []); // expects [{ _id, url, name }]
    } catch (err) {
      console.error("Failed to fetch images:", err);
    } finally {
      setLoading(false);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setUploading(true);

    try {
      const uploaded = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/image", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error("Upload failed");

        const savedImage = await res.json();
        uploaded.push(savedImage);
      }

      setImages((prev) => [...uploaded, ...prev]);
    } catch (error) {
      console.error("Multiple image upload error:", error);
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
        const newSet = new Set(prev);
        newSet.has(url) ? newSet.delete(url) : newSet.add(url);
        return newSet;
      });
    }
  };

  const handleDone = () => {
    onSelectImages(Array.from(selected));
    onClose();
    setSelected(new Set());
  };

  const handleDeleteImage = async (_id) => {
    // Force a microtask to complete before blocking UI with confirm
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const res = await fetch("/api/image", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ _id }),
      });

      if (!res.ok) throw new Error("Delete failed");

      setImages((prev) => prev.filter((img) => img._id !== _id));
      setSelected((prev) => {
        const newSet = new Set(prev);
        const deleted = images.find((img) => img._id === _id);
        if (deleted) newSet.delete(deleted.url);
        return newSet;
      });
    } catch (error) {
      console.error("Image delete error:", error);
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
            <input type="file" accept="image/*" multiple ref={fileInputRef} style={{ display: "none" }} onChange={handleFileChange} />
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
              {Array.isArray(images) && images.map((image) => {
                const isSelected = selected.has(image.url);
                return (
                  <div key={image._id} className="relative rounded-lg overflow-hidden group">
                    <img
                      src={image.url}
                      alt={image.name}
                      onClick={() => handleClickImage(image.url)}
                      className="object-contain object-center w-full h-[150px] rounded-lg cursor-pointer"
                    />

                    {selectType === "multiple" && isSelected && (
                      <div className="absolute top-2 right-2 z-50 text-green-500 bg-white rounded-full p-1 shadow-md">
                        <FaCheckCircle className="text-lg" />
                      </div>
                    )}

                    <button
                      className="absolute top-2 left-2 text-white bg-red-600 rounded-full cursor-pointer text-xs px-2 py-1 hidden group-hover:block"
                      onClick={() => handleDeleteImage(image._id)}
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
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
