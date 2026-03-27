"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Pagination } from "@heroui/react";
import { Input, Spinner, Select, SelectItem, Textarea } from "@heroui/react";
import { MdDelete } from "react-icons/md";
import { RiEditCircleFill } from "react-icons/ri";
import { DynamicIcon } from "lucide-react/dynamic";
import DeleteConfirmationModal from "@/components/block/DeleteConfirmationModal";
import Empty from "@/components/block/Empty";
import CustomButton from "@/components/block/CustomButton";

const COLLECTION = "support-benefits";

export default function SupportBenefitsPage() {
  const [benefits, setBenefits] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [iconName, setIconName] = useState("package-check");
  const [position, setPosition] = useState("");

  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [isFetching, setIsFetching] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [descriptionError, setDescriptionError] = useState(false);
  const [page, setPage] = useState(1);
  const rowsPerPage = 8;

  const iconList = [
    "package-check",
    "badge-check",
    "message-circle",
    "truck",
    "shield-check",
    "refresh-ccw",
    "headphones",
    "credit-card",
    "gift",
    "award",
    "clock",
    "globe",
    "heart",
    "star",
    "thumbs-up",
    "check-circle",
    "zap",
    "settings",
    "dollar-sign",
    "percent",
    "lock",
    "unlock",
    "shopping-bag",
    "shopping-cart",
    "tag",
    "home",
    "users",
    "phone",
    "mail",
    "calendar",
  ];

  const fetchBenefits = async () => {
    setIsFetching(true);
    try {
      const res = await fetch(`/api/data?collection=${COLLECTION}`);
      const data = await res.json();
      if (res.ok) {
        const sorted = data.sort((a, b) => {
          const posA = a.position ?? 9999;
          const posB = b.position ?? 9999;
          return posA - posB;
        });
        setBenefits(sorted);
      }
    } catch (err) {
      console.error("Fetch failed", err);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchBenefits();
  }, []);

  const createOrUpdate = async () => {
    if (!title || !description) {
      setTitleError(!title);
      setDescriptionError(!description);
      return;
    }

    setLoading(true);
    try {
      const method = selectedId ? "PUT" : "POST";
      const payload = {
        collection: COLLECTION,
        _id: selectedId,
        title,
        description,
        iconName,
        position: parseInt(position) || 0,
      };

      const res = await fetch("/api/data", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        resetForm();
        fetchBenefits();
      } else {
        alert("Failed to save benefit.");
      }
    } catch (err) {
      console.error("Save error", err);
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: COLLECTION, _id: selectedId }),
      });

      const data = await res.json();
      if (res.ok) {
        fetchBenefits();
        resetForm();
      } else {
        console.error("Delete failed", data);
      }
    } catch (err) {
      console.error("Delete error", err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setIconName("package-check");
    setPosition("");
    setSelectedId(null);
    setDeleteModalOpen(false);
  };

  const pages = Math.ceil(benefits.length / rowsPerPage);
  const currentPageData = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return benefits.slice(start, start + rowsPerPage);
  }, [page, benefits]);

  if (isFetching) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-80px)]">
        <div className="text-center">
          <Spinner color="secondary" variant="gradient" size="md" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-3">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Support Benefits Manager</h1>
          <p className="text-sm text-gray-600">Manage trust badges and support benefits displayed on your homepage.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Form Section */}
        <div className="w-full md:w-1/3 bg-white p-4 rounded-lg h-min">
          <h2 className="text-lg font-semibold mb-3">{selectedId ? "Edit Benefit" : "Add New Benefit"}</h2>
          
          {/* Info Box */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs font-semibold text-blue-900 mb-1">💡 Tips:</p>
            <ul className="text-xs text-blue-800 space-y-0.5">
              <li>• Keep titles short (2-4 words)</li>
              <li>• Descriptions should be concise</li>
              <li>• Choose relevant icons</li>
              <li>• Use position to order benefits</li>
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <Input
              label="Benefit Title"
              placeholder="e.g. Free Shipping"
              size="sm"
              value={title}
              labelPlacement="outside"
              isInvalid={titleError}
              errorMessage={titleError ? "Title is required" : ""}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(false);
              }}
            />
            
            <Textarea
              label="Description"
              placeholder="Describe the benefit in detail"
              size="sm"
              value={description}
              labelPlacement="outside"
              isInvalid={descriptionError}
              errorMessage={descriptionError ? "Description is required" : ""}
              onChange={(e) => {
                setDescription(e.target.value);
                if (descriptionError) setDescriptionError(false);
              }}
              rows={3}
            />

            <Input
              label="Position"
              placeholder="e.g. 1, 2, 3"
              size="sm"
              type="number"
              value={position}
              labelPlacement="outside"
              description="Lower numbers appear first"
              onChange={(e) => setPosition(e.target.value)}
            />

            <Select
              label="Icon"
              selectedKeys={[iconName]}
              onSelectionChange={(key) => setIconName(key.currentKey || "package-check")}
              labelPlacement="outside"
              size="sm"
              placeholder="Select an icon"
            >
              {iconList.map((name) => (
                <SelectItem key={name} textValue={name}>
                  <div className="flex items-center gap-2">
                    <DynamicIcon name={name} size={16} />
                    <span className="capitalize">{name.replace(/-/g, " ")}</span>
                  </div>
                </SelectItem>
              ))}
            </Select>

            <CustomButton 
              size="sm" 
              className="bg-black text-white" 
              onPress={createOrUpdate} 
              isLoading={loading}
            >
              {loading ? (selectedId ? "Updating..." : "Creating...") : selectedId ? "Update" : "Create"}
            </CustomButton>
          </div>
        </div>

        {/* Table Section */}
        <div className="w-full md:w-2/3">
          <h2 className="text-lg font-semibold mb-3">Benefits List</h2>
          {benefits.length === 0 ? (
            <Empty 
              title="No Benefits Added" 
              description="Add support benefits to build customer trust and confidence." 
            />
          ) : (
            <Table aria-label="Benefits Table" shadow="none">
              <TableHeader>
                <TableColumn>Icon</TableColumn>
                <TableColumn>Title</TableColumn>
                <TableColumn>Description</TableColumn>
                <TableColumn>Position</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody>
                {currentPageData.map((item) => (
                  <TableRow key={item._id}>
                    <TableCell>
                      <div className="flex items-center justify-center w-10 h-10 bg-gray-100 rounded-full">
                        <DynamicIcon name={item.iconName || "package-check"} size={20} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{item.title}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600 line-clamp-2">{item.description}</span>
                    </TableCell>
                    <TableCell>
                      <span className="px-2 py-1 bg-gray-100 rounded text-sm">{item.position ?? "-"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 items-center">
                        <span
                          className="p-2 bg-blue-100 hover:bg-blue-200 rounded-md cursor-pointer"
                          onClick={() => {
                            setTitle(item.title);
                            setDescription(item.description);
                            setIconName(item.iconName || "package-check");
                            setPosition(item.position?.toString() || "");
                            setSelectedId(item._id);
                          }}
                        >
                          <RiEditCircleFill className="text-blue-500 text-lg" />
                        </span>
                        <span
                          className="p-2 bg-red-100 hover:bg-red-200 rounded-md cursor-pointer"
                          onClick={() => {
                            setSelectedId(item._id);
                            setDeleteModalOpen(true);
                          }}
                        >
                          <MdDelete className="text-red-600 text-lg" />
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {benefits.length > rowsPerPage && (
            <div className="flex justify-center mt-4">
              <Pagination 
                isCompact 
                showControls 
                showShadow 
                color="secondary" 
                page={page} 
                total={pages} 
                onChange={setPage} 
              />
            </div>
          )}
        </div>
      </div>

      <DeleteConfirmationModal 
        isOpen={deleteModalOpen} 
        onClose={() => setDeleteModalOpen(false)} 
        onConfirm={deleteItem} 
      />
    </div>
  );
}
