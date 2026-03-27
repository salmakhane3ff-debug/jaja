"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Input, Select, SelectItem, Textarea } from "@heroui/react";
import { ArrowLeft, FileText, Plus, X, Save, Eye } from "lucide-react";
import CustomButton from "@/components/block/CustomButton";
import ImageSelector from "@/components/block/ImageSelector";

const TextEditor = dynamic(() => import("@/components/block/TextEditor"), { ssr: false });

function PageForm() {
  const searchParams = useSearchParams();

  const pageId = searchParams?.get("pageId") || "";
  const isUpdate = searchParams?.get("isUpdate") === "true";

  const [addLoading, setAddLoading] = useState(false);
  const [isInvalid, setIsInvalid] = useState(false);
  const [isImageSelectorOpen, setIsImageSelectorOpen] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  const [isFetching, setIsFetching] = useState(false);

  const [pageData, setPageData] = useState({
    title: "",
    content: "",
    shortDescription: "",
    author: "",
    status: "Draft",
    pageType: "Standard",
  });

  const statusOptions = ["Draft", "Published", "Archived"];
  const pageTypeOptions = ["Standard", "Landing", "About", "Contact", "Terms", "Privacy", "FAQ", "Other"];

  useEffect(() => {
    const fetchPageById = async () => {
      if (!isUpdate || !pageId) return;

      setIsFetching(true);
      try {
        const res = await fetch(`/api/pages/${pageId}`);
        const data = await res.json();

        setPageData({
          title: data.title || "",
          content: data.content || "",
          shortDescription: data.shortDescription || "",
          author: data.author || "",
          status: data.status || "Draft",
          pageType: data.pageType || "Standard",
        });

        setSelectedImages(data.images || []);
      } catch (error) {
        console.error("❌ Failed to fetch page:", error);
      } finally {
        setIsFetching(false);
      }
    };

    fetchPageById();
  }, [isUpdate, pageId]);

  // Auto-generate slug from title
  const generateSlug = (title) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const addOrUpdatePage = async () => {
    setAddLoading(true);

    if (!pageData.title || !pageData.content) {
      setIsInvalid(true);
      setAddLoading(false);
      return;
    }

    try {
      const method = isUpdate ? "PUT" : "POST";
      const response = await fetch("/api/pages", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isUpdate && { _id: pageId }),
          ...pageData,
          images: selectedImages,
          slug: generateSlug(pageData.title),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ API Error:", errorData);
        throw new Error(`Error: ${response.statusText}`);
      }

      // Optional: redirect back to pages list or show success message
      console.log("✅ Page saved successfully");
    } catch (error) {
      console.error("❌ Error saving page:", error);
    } finally {
      setAddLoading(false);
    }
  };

  const generatedSlug = generateSlug(pageData.title);

  return (
    <div className="p-4 md:p-6 mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/pages">
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{isUpdate ? "Edit Page" : "Add Page"}</h1>
            <p className="text-gray-600 text-sm">{isUpdate ? "Update page information" : "Create a new page"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {isUpdate && pageData.status === "Published" && generatedSlug && (
            <CustomButton
              as={Link}
              href={`/pages/${generatedSlug}`}
              target="_blank"
              intent="ghost"
              size="md"
              startContent={<Eye className="w-4 h-4" />}
              tooltip="Preview page on website"
            >
              Preview
            </CustomButton>
          )}
          <CustomButton
            intent="primary"
            size="md"
            isLoading={addLoading}
            onPress={addOrUpdatePage}
            startContent={<Save className="w-4 h-4" />}
            tooltip={isUpdate ? "Update page" : "Save this page"}
          >
            {isUpdate ? "Update Page" : "Save Page"}
          </CustomButton>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Page Information</h2>
            <div className="space-y-4">
              <Input
                label="Page Title"
                labelPlacement="outside"
                isDisabled={isFetching}
                placeholder="Enter page title"
                value={pageData.title}
                isInvalid={isInvalid && !pageData.title}
                errorMessage="Page title is required"
                onChange={(e) => setPageData({ ...pageData, title: e.target.value })}
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
              />

              {pageData.title && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Auto-generated URL:</span> /pages/{generatedSlug}
                  </p>
                </div>
              )}

              <Textarea
                label="Short Description"
                isDisabled={isFetching}
                labelPlacement="outside"
                placeholder="Brief description for previews..."
                value={pageData.shortDescription}
                onChange={(e) => setPageData({ ...pageData, shortDescription: e.target.value })}
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
                maxRows={3}
              />

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Page Content</label>
                <TextEditor 
                  value={pageData.content} 
                  onChange={(value) => setPageData(prev => ({ ...prev, content: value }))}
                />
                {isInvalid && !pageData.content && (
                  <p className="text-sm text-red-500 mt-1">Page content is required</p>
                )}
              </div>
            </div>
          </div>

          {/* Featured Image */}
          <div className="bg-white rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Featured Image</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {selectedImages.map((img, index) => (
                <div key={index} className="relative group">
                  <img src={img} alt={`Page ${index + 1}`} className="w-full h-32 object-cover rounded-lg border border-gray-200" />
                  <button
                    onClick={() => setSelectedImages(selectedImages.filter((_, i) => i !== index))}
                    className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                className="flex items-center justify-center w-full h-32 rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-colors"
                onClick={() => setIsImageSelectorOpen(true)}
              >
                <div className="text-center">
                  <Plus className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                  <span className="text-sm text-gray-500">Add Image</span>
                </div>
              </button>
            </div>
            <ImageSelector 
              isOpen={isImageSelectorOpen} 
              onClose={() => setIsImageSelectorOpen(false)} 
              onSelectImages={(urls) => setSelectedImages(urls)} 
              selectType="multiple" 
            />
          </div>
        </div>

        {/* Sidebar - 1/3 width */}
        <div className="lg:col-span-1 space-y-6">
          {/* Publish Settings */}
          <div className="bg-white rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Publish</h3>
            <div className="space-y-4">
              <Select
                label="Status"
                labelPlacement="outside"
                isDisabled={isFetching}
                placeholder="Select status"
                selectedKeys={[pageData.status]}
                onSelectionChange={(keys) => setPageData({ ...pageData, status: Array.from(keys)[0] })}
                classNames={{
                  label: "text-sm font-medium text-gray-700",
                }}
              >
                {statusOptions.map((option) => (
                  <SelectItem key={option}>{option}</SelectItem>
                ))}
              </Select>

              <Select
                label="Page Type"
                labelPlacement="outside"
                isDisabled={isFetching}
                placeholder="Select page type"
                selectedKeys={[pageData.pageType]}
                onSelectionChange={(keys) => setPageData({ ...pageData, pageType: Array.from(keys)[0] })}
                classNames={{
                  label: "text-sm font-medium text-gray-700",
                }}
              >
                {pageTypeOptions.map((option) => (
                  <SelectItem key={option}>{option}</SelectItem>
                ))}
              </Select>

              <Input
                label="Author"
                labelPlacement="outside"
                isDisabled={isFetching}
                placeholder="Author name"
                value={pageData.author}
                onChange={(e) => setPageData({ ...pageData, author: e.target.value })}
                classNames={{
                  input: "text-sm",
                  label: "text-sm font-medium text-gray-700",
                }}
              />
            </div>
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
            <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600">Loading page editor...</p>
          </div>
        </div>
      }
    >
      <PageForm />
    </Suspense>
  );
}