"use client";

import { useState, useEffect } from "react";
import { Spinner, Chip } from "@heroui/react";
import { MdDelete, MdMarkEmailRead, MdMarkEmailUnread } from "react-icons/md";
import { Mail, Phone, Calendar, MessageSquare } from "lucide-react";
import DeleteConfirmationModal from "@/components/block/DeleteConfirmationModal";
import Empty from "@/components/block/Empty";

const COLLECTION = "contact-submissions";

export default function ContactSubmissionsPage() {
  const [submissions, setSubmissions] = useState([]);
  const [isFetching, setIsFetching] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const fetchSubmissions = async () => {
    setIsFetching(true);
    try {
      const res = await fetch(`/api/data?collection=${COLLECTION}`);
      const data = await res.json();
      if (res.ok) {
        const sorted = data.sort((a, b) => 
          new Date(b.submittedAt) - new Date(a.submittedAt)
        );
        setSubmissions(sorted);
      }
    } catch (err) {
      console.error("Fetch failed", err);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const toggleReadStatus = async (id, currentStatus) => {
    try {
      const submission = submissions.find((s) => s._id === id);
      const res = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection: COLLECTION,
          _id: id,
          ...submission,
          status: currentStatus === "read" ? "unread" : "read",
        }),
      });

      if (res.ok) {
        fetchSubmissions();
      }
    } catch (err) {
      console.error("Error updating status", err);
    }
  };

  const deleteSubmission = async () => {
    if (!selectedId) return;
    try {
      const res = await fetch("/api/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: COLLECTION, _id: selectedId }),
      });

      if (res.ok) {
        fetchSubmissions();
        setDeleteModalOpen(false);
        setSelectedId(null);
      }
    } catch (err) {
      console.error("Error deleting", err);
    }
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
          <h1 className="text-2xl font-bold">Contact Submissions</h1>
          <p className="text-sm text-gray-600">
            {submissions.length} total submissions
          </p>
        </div>
      </div>

      {submissions.length === 0 ? (
        <Empty
          title="No Contact Submissions"
          description="Customer contact form submissions will appear here."
        />
      ) : (
        <div className="space-y-4">
          {submissions.map((item) => (
            <div
              key={item._id}
              className={`bg-white rounded-lg shadow-sm border ${
                item.status === "read" ? "border-gray-200" : "border-blue-200 bg-blue-50/30"
              }`}
            >
              <div className="p-4">
                <div className="flex justify-between items-start gap-4">
                  {/* Main Content */}
                  <div className="flex-1 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg">{item.name}</h3>
                          <Chip
                            size="sm"
                            color={item.status === "read" ? "default" : "primary"}
                            variant="flat"
                          >
                            {item.status === "read" ? "Read" : "Unread"}
                          </Chip>
                        </div>
                        {item.subject && (
                          <p className="text-sm font-medium text-gray-700">
                            {item.subject}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          className="p-2 bg-blue-100 hover:bg-blue-200 rounded-md transition-colors"
                          onClick={() => toggleReadStatus(item._id, item.status)}
                          title={item.status === "read" ? "Mark as Unread" : "Mark as Read"}
                        >
                          {item.status === "read" ? (
                            <MdMarkEmailUnread className="text-blue-600 text-lg" />
                          ) : (
                            <MdMarkEmailRead className="text-blue-600 text-lg" />
                          )}
                        </button>
                        <button
                          className="p-2 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
                          onClick={() => {
                            setSelectedId(item._id);
                            setDeleteModalOpen(true);
                          }}
                        >
                          <MdDelete className="text-red-600 text-lg" />
                        </button>
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        <a href={`mailto:${item.email}`} className="hover:text-blue-600">
                          {item.email}
                        </a>
                      </div>
                      {item.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          <a href={`tel:${item.phone}`} className="hover:text-blue-600">
                            {item.phone}
                          </a>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {new Date(item.submittedAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Message */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-start gap-2 mb-2">
                        <MessageSquare className="w-4 h-4 text-gray-500 mt-0.5" />
                        <span className="text-xs font-semibold text-gray-700 uppercase">
                          Message
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {item.message}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={deleteSubmission}
      />
    </div>
  );
}
