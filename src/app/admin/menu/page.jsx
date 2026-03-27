"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Pagination } from "@heroui/react";
import { Input, Spinner, Select, SelectItem } from "@heroui/react";
import { MdDelete } from "react-icons/md";
import { RiEditCircleFill } from "react-icons/ri";
import { DynamicIcon } from "lucide-react/dynamic";
import DeleteConfirmationModal from "@/components/block/DeleteConfirmationModal";
import Empty from "@/components/block/Empty";
import CustomButton from "@/components/block/CustomButton";

const COLLECTION = "menu-item";

export default function MenuPage() {
  const [menuItems, setMenuItems] = useState([]);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("#");
  const [iconName, setIconName] = useState("home");
  const [badge, setBadge] = useState("");
  const [position, setPosition] = useState("");

  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [isFetching, setIsFetching] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [urlError, setUrlError] = useState(false);
  const [page, setPage] = useState(1);
  const rowsPerPage = 8;

  const iconList = [
    "home",
    "menu",
    "user",
    "camera",
    "heart",
    "settings",
    "shopping-cart",
    "search",
    "help-circle",
    "star",
    "phone",
    "mail",
    "globe",
    "log-in",
    "log-out",
    "bell",
    "bookmark",
    "trending-up", // for Trending
    "flame", // for Hot Deals
    "tags", // for Categories
    "layout-grid", // for All Products or Categories
    "percent", // for Offers/Discounts
    "badge-check", // for Verified
    "credit-card", // for Payment
    "truck", // for Shipping Info
    "map-pin", // for Store Locator / Address
    "info", // for About
    "file-text", // for Policies / Terms
    "users", // for Team / Community
    "calendar", // for Events / Schedule
    "gift", // for Gifts
    "box", // for Products / Orders
    "refresh-ccw", // for Returns / Sync
    "clock", // for History / Recent
    "sun", // for Light mode
    "moon", // for Dark mode
  ];

  const fetchMenuItems = async () => {
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

        setMenuItems(sorted);
      }
    } catch (err) {
      console.error("Fetch failed", err);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchMenuItems();
  }, []);

  const createOrUpdate = async () => {
    if (!title || !url) {
      setTitleError(!title);
      setUrlError(!url);
      return;
    }

    setLoading(true);
    try {
      const method = selectedId ? "PUT" : "POST";
      const payload = {
        collection: COLLECTION,
        _id: selectedId,
        title,
        url,
        iconName,
        badge,
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
        fetchMenuItems();
      } else {
        alert("Failed to save item.");
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
        fetchMenuItems();
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
    setUrl("");
    setIconName("home");
    setBadge("");
    setPosition("");
    setSelectedId(null);
    setDeleteModalOpen(false);
  };

  const pages = Math.ceil(menuItems.length / rowsPerPage);
  const currentPageData = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return menuItems.slice(start, start + rowsPerPage);
  }, [page, menuItems]);

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
          <h1 className="text-2xl font-bold">Menu Manager</h1>
          <p className="text-sm text-gray-600">Manage navigation menu items.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Form Section */}
        <div className="w-full md:w-1/3 bg-white p-4 rounded-lg h-min">
          <h2 className="text-lg font-semibold mb-3">{selectedId ? "Edit Item" : "Add New Menu Item"}</h2>
          <div className="flex flex-col gap-4">
            <Input
              label="Menu Title"
              placeholder="Enter title"
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
            <Input
              label="Redirect URL"
              placeholder="/about or https://example.com"
              size="sm"
              value={url}
              labelPlacement="outside"
              isInvalid={urlError}
              errorMessage={urlError ? "URL is required" : ""}
              onChange={(e) => {
                setUrl(e.target.value);
                if (urlError) setUrlError(false);
              }}
            />
            <Input
              label="Badge (optional)"
              placeholder="e.g. New, Hot, Sale"
              size="sm"
              value={badge}
              labelPlacement="outside"
              onChange={(e) => setBadge(e.target.value)}
            />
            <Input
              label="Position"
              placeholder="e.g. 1, 2, 3"
              size="sm"
              type="number"
              value={position}
              labelPlacement="outside"
              onChange={(e) => setPosition(e.target.value)}
            />
            <Select
              label="Icon"
              selectedKeys={[iconName]}
              onSelectionChange={(key) => setIconName(key.currentKey || "home")}
              labelPlacement="outside"
              size="sm"
              placeholder="Select an icon"
            >
              {iconList.map((name) => (
                <SelectItem key={name} textValue={name}>
                  <div className="flex items-center gap-2">
                    <DynamicIcon name={name} size={16} />
                    <span className="capitalize">{name}</span>
                  </div>
                </SelectItem>
              ))}
            </Select>
            <CustomButton size="sm" className="bg-black text-white" onPress={createOrUpdate} isLoading={loading}>
              {loading ? (selectedId ? "Updating..." : "Creating...") : selectedId ? "Update" : "Create"}
            </CustomButton>
          </div>
        </div>

        {/* Table Section */}
        <div className="w-full md:w-2/3">
          <h2 className="text-lg font-semibold mb-3">Menu Items</h2>
          {menuItems.length === 0 ? (
            <Empty title="No Menu Items" description="Add new items for your navigation." />
          ) : (
            <Table aria-label="Menu Table" shadow="none">
              <TableHeader>
                <TableColumn>Icon</TableColumn>
                <TableColumn>Title</TableColumn>
                <TableColumn>URL</TableColumn>
                <TableColumn>Badge</TableColumn>
                <TableColumn>Position</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody>
                {currentPageData.map((item) => (
                  <TableRow key={item._id}>
                    <TableCell>
                      <DynamicIcon name={item.iconName || "help-circle"} size={20} />
                    </TableCell>
                    <TableCell>{item.title}</TableCell>
                    <TableCell>{item.url}</TableCell>
                    <TableCell>
                      {item.badge ? <span className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-800">{item.badge}</span> : "-"}
                    </TableCell>
                    <TableCell>{item.position ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex gap-2 items-center">
                        <span
                          className="p-2 bg-blue-100 hover:bg-blue-200 rounded-md cursor-pointer"
                          onClick={() => {
                            setTitle(item.title);
                            setUrl(item.url);
                            setIconName(item.iconName || "home");
                            setBadge(item.badge || "");
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
          {menuItems.length > rowsPerPage && (
            <div className="flex justify-center mt-4">
              <Pagination isCompact showControls showShadow color="secondary" page={page} total={pages} onChange={setPage} />
            </div>
          )}
        </div>
      </div>

      <DeleteConfirmationModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} onConfirm={deleteItem} />
    </div>
  );
}
