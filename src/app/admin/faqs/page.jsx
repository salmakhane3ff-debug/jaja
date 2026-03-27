"use client";

import { useState, useEffect } from "react";
import { Input, Textarea, Button, Spinner } from "@heroui/react";
import { MdDelete } from "react-icons/md";
import { RiEditCircleFill } from "react-icons/ri";
import DeleteConfirmationModal from "@/components/block/DeleteConfirmationModal";
import Empty from "@/components/block/Empty";

const COLLECTION = "faqs";

export default function FAQsAdminPage() {
  const [faqs, setFaqs] = useState([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [order, setOrder] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const fetchFAQs = async () => {
    setIsFetching(true);
    try {
      const res = await fetch(`/api/data?collection=${COLLECTION}`);
      const data = await res.json();
      if (res.ok) {
        const sorted = data.sort((a, b) => (a.order || 0) - (b.order || 0));
        setFaqs(sorted);
      }
    } catch (err) {
      console.error("Fetch failed", err);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchFAQs();
  }, []);

  const createOrUpdateFAQ = async () => {
    if (!question || !answer) {
      alert("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const method = selectedId ? "PUT" : "POST";
      const payload = {
        collection: COLLECTION,
        _id: selectedId,
        question,
        answer,
        order: Number(order),
      };

      const res = await fetch("/api/data", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        resetForm();
        fetchFAQs();
      } else {
        alert("Failed to save FAQ.");
      }
    } catch (err) {
      console.error("Error saving", err);
    } finally {
      setLoading(false);
    }
  };

  const deleteFAQ = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: COLLECTION, _id: selectedId }),
      });

      if (res.ok) {
        fetchFAQs();
        resetForm();
      }
    } catch (err) {
      console.error("Error deleting", err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setQuestion("");
    setAnswer("");
    setOrder(0);
    setSelectedId(null);
    setDeleteModalOpen(false);
  };

  if (isFetching) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-80px)]">
        <Spinner color="secondary" size="md" />
      </div>
    );
  }

  return (
    <div className="px-5 py-3">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">FAQs Management</h1>
          <p className="text-sm text-gray-600">Manage frequently asked questions</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Form */}
        <div className="w-full md:w-1/3 bg-white p-4 rounded-lg h-min">
          <h2 className="text-lg font-semibold mb-3">
            {selectedId ? "Edit FAQ" : "Add New FAQ"}
          </h2>
          <div className="flex flex-col gap-4">
            <Input
              label="Question"
              placeholder="Enter question"
              size="sm"
              value={question}
              labelPlacement="outside"
              onChange={(e) => setQuestion(e.target.value)}
            />
            <Textarea
              label="Answer"
              placeholder="Enter answer"
              size="sm"
              value={answer}
              labelPlacement="outside"
              minRows={4}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <Input
              label="Order (for sorting)"
              placeholder="0"
              type="number"
              size="sm"
              value={order}
              labelPlacement="outside"
              onChange={(e) => setOrder(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-black text-white flex-1"
                onPress={createOrUpdateFAQ}
                isLoading={loading}
              >
                {selectedId ? "Update" : "Create"}
              </Button>
              {selectedId && (
                <Button
                  size="sm"
                  className="bg-gray-200 text-gray-800"
                  onPress={resetForm}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* List */}
        <div className="w-full md:w-2/3">
          <h2 className="text-lg font-semibold mb-3">FAQ List</h2>
          {faqs.length === 0 ? (
            <Empty title="No FAQs" description="Add new FAQs to appear here." />
          ) : (
            <div className="space-y-3">
              {faqs.map((item) => (
                <div
                  key={item._id}
                  className="bg-white rounded-lg p-4 shadow-sm border border-gray-100"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm mb-2">{item.question}</h3>
                      <p className="text-xs text-gray-600 line-clamp-2">{item.answer}</p>
                      <p className="text-xs text-gray-400 mt-2">Order: {item.order || 0}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="p-2 bg-blue-100 hover:bg-blue-200 rounded-md"
                        onClick={() => {
                          setQuestion(item.question);
                          setAnswer(item.answer);
                          setOrder(item.order || 0);
                          setSelectedId(item._id);
                        }}
                      >
                        <RiEditCircleFill className="text-blue-500 text-lg" />
                      </button>
                      <button
                        className="p-2 bg-red-100 hover:bg-red-200 rounded-md"
                        onClick={() => {
                          setSelectedId(item._id);
                          setDeleteModalOpen(true);
                        }}
                      >
                        <MdDelete className="text-red-600 text-lg" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={deleteFAQ}
      />
    </div>
  );
}
