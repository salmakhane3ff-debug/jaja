"use client";

import { useEffect, useState } from "react";
import { Button, Input, Textarea, Select, SelectItem, Modal, ModalBody, ModalContent, ModalHeader, ModalFooter, Spinner } from "@heroui/react";
import { Plus, Edit2, Trash2, Type, Eye, EyeOff } from "lucide-react";
import CustomButton from "@/components/block/CustomButton";
import DeleteConfirmationModal from "@/components/block/DeleteConfirmationModal";
import Empty from "@/components/block/Empty";

const COLLECTION = "promo-text";

export default function PromoTextPage() {
  const [promoTexts, setPromoTexts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    emoji: "🎉",
    status: "Active",
    priority: 1
  });

  const emojiOptions = [
    { value: "🎉", label: "🎉 Party" },
    { value: "⚡", label: "⚡ Lightning" },
    { value: "🛍️", label: "🛍️ Shopping" },
    { value: "🔥", label: "🔥 Fire" },
    { value: "💯", label: "💯 Hundred" },
    { value: "✨", label: "✨ Sparkles" },
    { value: "🎁", label: "🎁 Gift" },
    { value: "💎", label: "💎 Diamond" },
    { value: "🌟", label: "🌟 Star" },
    { value: "🚀", label: "🚀 Rocket" }
  ];

  useEffect(() => {
    fetchPromoTexts();
  }, []);

  const fetchPromoTexts = async () => {
    try {
      const res = await fetch(`/api/data?collection=${COLLECTION}`);
      const data = await res.json();
      setPromoTexts(data.sort((a, b) => (a.priority || 0) - (b.priority || 0)));
    } catch (err) {
      console.error("Failed to fetch promo texts:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const method = selectedItem ? "PUT" : "POST";
      const url = selectedItem ? `/api/data/${selectedItem._id}` : "/api/data";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          collection: COLLECTION,
          text: `${formData.emoji} ${formData.content} ${formData.emoji}`
        }),
      });

      if (res.ok) {
        fetchPromoTexts();
        resetForm();
        setModalOpen(false);
      }
    } catch (err) {
      console.error("Failed to save promo text:", err);
    }
  };

  const handleEdit = (item) => {
    setSelectedItem(item);
    setFormData({
      title: item.title || "",
      content: item.content || "",
      emoji: item.emoji || "🎉",
      status: item.status || "Active",
      priority: item.priority || 1
    });
    setModalOpen(true);
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          collection: COLLECTION, 
          id: selectedItem._id 
        }),
      });

      if (res.ok) {
        fetchPromoTexts();
        setDeleteModalOpen(false);
        setSelectedItem(null);
      }
    } catch (err) {
      console.error("Failed to delete promo text:", err);
    }
  };

  const toggleStatus = async (item) => {
    try {
      const newStatus = item.status === "Active" ? "Inactive" : "Active";
      const res = await fetch(`/api/data/${item._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...item,
          status: newStatus,
          text: `${item.emoji} ${item.content} ${item.emoji}`
        }),
      });

      if (res.ok) {
        fetchPromoTexts();
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      content: "",
      emoji: "🎉",
      status: "Active",
      priority: 1
    });
    setSelectedItem(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-80px)]">
        <Spinner color="primary" size="lg" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Promotional Texts</h1>
          <p className="text-gray-600 text-sm mt-1">
            Manage scrolling promotional messages for your slider
          </p>
        </div>
        <CustomButton
          intent="primary"
          size="sm"
          onPress={() => {
            resetForm();
            setModalOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add New Text
        </CustomButton>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl overflow-hidden">
        {promoTexts.length === 0 ? (
          <Empty 
            icon={<Type className="w-8 h-8 text-gray-400" />}
            title="No promotional texts"
            description="Create your first promotional text to appear in the scrolling banner."
          />
        ) : (
          <div className="divide-y divide-gray-200">
            {promoTexts.map((item) => (
              <div key={item._id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{item.emoji}</span>
                      <h3 className="font-semibold text-gray-900">{item.title}</h3>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        item.status === "Active" 
                          ? "bg-green-100 text-green-700" 
                          : "bg-gray-100 text-gray-700"
                      }`}>
                        {item.status}
                      </span>
                    </div>
                    <p className="text-gray-600 mb-2">{item.content}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>Priority: {item.priority || 1}</span>
                      <span>Preview: {item.emoji} {item.content} {item.emoji}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => toggleStatus(item)}
                      className={`p-2 rounded-lg transition-colors ${
                        item.status === "Active"
                          ? "bg-green-50 text-green-600 hover:bg-green-100"
                          : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                      }`}
                      title={item.status === "Active" ? "Deactivate" : "Activate"}
                    >
                      {item.status === "Active" ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleEdit(item)}
                      className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedItem(item);
                        setDeleteModalOpen(true);
                      }}
                      className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={modalOpen} onOpenChange={setModalOpen} size="lg">
        <ModalContent>
          <ModalHeader>
            <h2 className="text-lg font-semibold">
              {selectedItem ? "Edit Promotional Text" : "Add New Promotional Text"}
            </h2>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4">
              <Input
                label="Title"
                placeholder="Enter title for internal reference"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                required
              />
              
              <Textarea
                label="Content"
                placeholder="Enter promotional message"
                value={formData.content}
                onChange={(e) => setFormData({...formData, content: e.target.value})}
                minRows={2}
                required
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select
                  label="Emoji"
                  selectedKeys={[formData.emoji]}
                  onSelectionChange={(keys) => setFormData({...formData, emoji: Array.from(keys)[0]})}
                >
                  {emojiOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </Select>

                <Select
                  label="Status"
                  selectedKeys={[formData.status]}
                  onSelectionChange={(keys) => setFormData({...formData, status: Array.from(keys)[0]})}
                >
                  <SelectItem key="Active" value="Active">Active</SelectItem>
                  <SelectItem key="Inactive" value="Inactive">Inactive</SelectItem>
                </Select>

                <Input
                  type="number"
                  label="Priority"
                  placeholder="1"
                  value={formData.priority}
                  onChange={(e) => setFormData({...formData, priority: parseInt(e.target.value) || 1})}
                  min={1}
                />
              </div>

              {/* Preview */}
              <div className="bg-gradient-to-r from-red-500 to-pink-500 text-white p-4 rounded-lg">
                <p className="text-center font-bold">
                  Preview: {formData.emoji} {formData.content} {formData.emoji}
                </p>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button color="primary" type="submit">
                {selectedItem ? "Update" : "Create"}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      {/* Delete Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        onConfirm={handleDelete}
        title="Delete Promotional Text"
        message={`Are you sure you want to delete "${selectedItem?.title}"? This action cannot be undone.`}
      />
    </div>
  );
}