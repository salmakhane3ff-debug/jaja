"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Star,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  ThumbsUp,
  MessageSquare,
  Play,
  Pause,
  BadgeCheck,
  Plus,
  Search,
  Calendar,
  Image,
  Mic,
  Phone,
  Package,
  Edit2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import toast from "react-hot-toast";
import { Spinner, Pagination, Chip } from "@heroui/react";
import formatDate from "@/utils/formatDate";
import DeleteConfirmationModal from "@/components/block/DeleteConfirmationModal";

// ── VoicePlayer ────────────────────────────────────────────────────────────────

function VoicePlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  const formatTime = (s) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-2 max-w-[220px]">
      <button
        onClick={toggle}
        className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-white flex-shrink-0"
      >
        {playing ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <div
        className="flex-1 h-1.5 bg-gray-300 rounded-full cursor-pointer relative"
        onClick={(e) => {
          if (!audioRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          audioRef.current.currentTime = ratio * duration;
        }}
      >
        <div
          className="h-full bg-blue-400 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 flex-shrink-0 font-mono">
        {formatTime(playing ? current : duration)}
      </span>
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onTimeUpdate={() => {
          if (!audioRef.current) return;
          setCurrent(audioRef.current.currentTime);
          setProgress(
            (audioRef.current.currentTime / audioRef.current.duration) * 100 ||
              0
          );
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setCurrent(0);
        }}
      />
    </div>
  );
}

// ── StarInput ─────────────────────────────────────────────────────────────────

function StarInput({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(s)}
          className="text-2xl transition-transform hover:scale-110"
        >
          <Star
            size={24}
            className={
              (hover || value) >= s
                ? "text-yellow-400 fill-yellow-400"
                : "text-gray-300"
            }
          />
        </button>
      ))}
    </div>
  );
}

// ── StarDisplay ───────────────────────────────────────────────────────────────

function StarDisplay({ value }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={14}
          className={
            value >= s ? "text-yellow-400 fill-yellow-400" : "text-gray-200"
          }
        />
      ))}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    PENDING: { color: "warning", label: "Pending" },
    APPROVED: { color: "success", label: "Approved" },
    REJECTED: { color: "danger", label: "Rejected" },
    SCHEDULED: { color: "primary", label: "Scheduled" },
  };
  const cfg = map[status] || { color: "default", label: status };
  return (
    <Chip color={cfg.color} size="sm" variant="flat">
      {cfg.label}
    </Chip>
  );
}

// ── Gradient avatar ───────────────────────────────────────────────────────────

function Avatar({ name }) {
  const colors = [
    "from-blue-400 to-blue-600",
    "from-purple-400 to-purple-600",
    "from-green-400 to-green-600",
    "from-orange-400 to-orange-600",
    "from-pink-400 to-pink-600",
    "from-teal-400 to-teal-600",
  ];
  const idx = (name?.charCodeAt(0) || 0) % colors.length;
  const initial = (name || "?")[0].toUpperCase();
  return (
    <div
      className={`w-10 h-10 rounded-full bg-gradient-to-br ${colors[idx]} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0`}
    >
      {initial}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 10;
const TABS = ["All", "PENDING", "APPROVED", "REJECTED", "SCHEDULED"];

export default function AdminFeedbackPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Schedule inline mode
  const [scheduleId, setScheduleId] = useState(null);
  const [scheduleDate, setScheduleDate] = useState("");

  // Expanded comments
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Create / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const emptyForm = {
    authorName: "",
    phone: "",
    rating: 5,
    textContent: "",
    productName: "",
    voiceUrl: "",
    images: [],
    isVerified: false,
    status: "PENDING",
    publishAt: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [voicePreview, setVoicePreview] = useState(null);
  const voiceInputRef = useRef(null);
  const imageInputRef = useRef(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/feedback?admin=true");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = {
    total: items.length,
    pending: items.filter((i) => i.status === "PENDING").length,
    approved: items.filter((i) => i.status === "APPROVED").length,
    rejected: items.filter((i) => i.status === "REJECTED").length,
    scheduled: items.filter((i) => i.status === "SCHEDULED").length,
    avgRating:
      items.length > 0
        ? (
            items.reduce((a, b) => a + (b.rating || 0), 0) / items.length
          ).toFixed(1)
        : "0.0",
  };

  // ── Filter + Search + Paginate ─────────────────────────────────────────────

  const filtered = items.filter((i) => {
    const matchTab = tab === "All" || i.status === tab;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (i.authorName || "").toLowerCase().includes(q) ||
      (i.textContent || "").toLowerCase().includes(q) ||
      (i.productName || "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  // Reset page when tab/search changes
  useEffect(() => {
    setPage(1);
  }, [tab, search]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const callPut = async (payload, successMsg) => {
    const res = await fetch("/api/feedback", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Request failed");
    const data = await res.json();
    setItems((prev) =>
      prev.map((i) =>
        i._id === data._id || i.id === data._id ? { ...i, ...data } : i
      )
    );
    toast.success(successMsg);
  };

  const handleApprove = async (id) => {
    try {
      await callPut({ _id: id, action: "approve" }, "Feedback approved");
    } catch {
      toast.error("Failed to approve");
    }
  };

  const handleReject = async (id) => {
    try {
      await callPut({ _id: id, action: "reject" }, "Feedback rejected");
    } catch {
      toast.error("Failed to reject");
    }
  };

  const handleSchedule = async (id) => {
    if (!scheduleDate) {
      toast.error("Please select a date");
      return;
    }
    try {
      await callPut(
        { _id: id, action: "schedule", publishAt: scheduleDate },
        "Feedback scheduled"
      );
      setScheduleId(null);
      setScheduleDate("");
    } catch {
      toast.error("Failed to schedule");
    }
  };

  const handleFeature = async (id, current) => {
    try {
      await callPut(
        { _id: id, action: "feature", isFeatured: !current },
        !current ? "Marked as featured" : "Removed from featured"
      );
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleVerify = async (id, current) => {
    try {
      await callPut(
        { _id: id, action: "verify", isVerified: !current },
        !current ? "Marked as verified" : "Verification removed"
      );
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: deleteTarget }),
      });
      if (!res.ok) throw new Error();
      setItems((prev) =>
        prev.filter((i) => i._id !== deleteTarget && i.id !== deleteTarget)
      );
      toast.success("Feedback deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Create / Edit submit ───────────────────────────────────────────────────

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setVoicePreview(null);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditTarget(item._id || item.id);
    setForm({
      authorName: item.authorName || "",
      phone: item.phone || "",
      rating: item.rating || 5,
      textContent: item.textContent || "",
      productName: item.productName || "",
      voiceUrl: item.voiceUrl || "",
      images: Array.isArray(item.images) ? item.images : [],
      isVerified: item.isVerified || false,
      status: item.status || "PENDING",
      publishAt: item.publishAt ? item.publishAt.slice(0, 16) : "",
    });
    setVoicePreview(item.voiceUrl || null);
    setModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!form.authorName.trim()) {
      toast.error("Name is required");
      return;
    }
    setSubmitting(true);
    try {
      if (editTarget) {
        const payload = {
          _id: editTarget,
          authorName: form.authorName,
          phone: form.phone,
          rating: form.rating,
          textContent: form.textContent,
          productName: form.productName,
          voiceUrl: form.voiceUrl,
          images: form.images,
          isVerified: form.isVerified,
          status: form.status,
          publishAt: form.publishAt
            ? new Date(form.publishAt).toISOString()
            : null,
        };
        const res = await fetch("/api/feedback", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setItems((prev) =>
          prev.map((i) =>
            i._id === editTarget || i.id === editTarget
              ? { ...i, ...data }
              : i
          )
        );
        toast.success("Feedback updated");
      } else {
        const payload = {
          authorName: form.authorName,
          phone: form.phone,
          rating: form.rating,
          textContent: form.textContent,
          productName: form.productName,
          voiceUrl: form.voiceUrl,
          images: form.images,
          isVerified: form.isVerified,
          status: form.status,
          publishAt: form.publishAt
            ? new Date(form.publishAt).toISOString()
            : null,
        };
        const res = await fetch("/api/feedback?admin=true", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setItems((prev) => [data, ...prev]);
        toast.success("Feedback created");
      }
      setModalOpen(false);
    } catch {
      toast.error(editTarget ? "Failed to update" : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Voice file handler ─────────────────────────────────────────────────────

  const handleVoiceFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setForm((f) => ({ ...f, voiceUrl: reader.result }));
      setVoicePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // ── Image file handler ─────────────────────────────────────────────────────

  const handleImageFiles = (files) => {
    const remaining = 3 - form.images.length;
    if (remaining <= 0) {
      toast.error("Maximum 3 images allowed");
      return;
    }
    const toProcess = Array.from(files).slice(0, remaining);
    toProcess.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm((f) => ({
          ...f,
          images: [...f.images, reader.result].slice(0, 3),
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (idx) => {
    setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));
  };

  // ── Render card ────────────────────────────────────────────────────────────

  const renderCard = (item) => {
    const id = item._id || item.id;
    const isExpanded = expandedIds.has(id);
    const images = Array.isArray(item.images) ? item.images : [];

    return (
      <div
        key={id}
        className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-3"
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <Avatar name={item.authorName} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 text-sm">
                {item.authorName || "Anonymous"}
              </span>
              {item.isVerified && (
                <BadgeCheck size={16} className="text-blue-500 flex-shrink-0" />
              )}
              <StatusBadge status={item.status} />
              {item.isFeatured && (
                <Chip color="secondary" size="sm" variant="flat">
                  Featured
                </Chip>
              )}
            </div>
            {item.productName && (
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                <Package size={12} />
                <span>{item.productName}</span>
              </div>
            )}
            {item.phone && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Phone size={12} />
                <span>{item.phone}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <StarDisplay value={item.rating} />
            <span className="text-xs text-gray-400">
              {formatDate(item.createdAt)}
            </span>
          </div>
        </div>

        {/* Comment */}
        {item.textContent && (
          <div>
            <p
              className={`text-sm text-gray-700 leading-relaxed ${
                !isExpanded ? "line-clamp-3" : ""
              }`}
            >
              {item.textContent}
            </p>
            {item.textContent.length > 150 && (
              <button
                onClick={() =>
                  setExpandedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                className="text-xs text-blue-500 hover:text-blue-700 mt-1 flex items-center gap-1"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp size={12} /> Show less
                  </>
                ) : (
                  <>
                    <ChevronDown size={12} /> Show more
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Voice player */}
        {item.voiceUrl && (
          <div>
            <VoicePlayer src={item.voiceUrl} />
          </div>
        )}

        {/* Images */}
        {images.length > 0 && (
          <div className="flex gap-2">
            {images.slice(0, 3).map((img, idx) => (
              <img
                key={idx}
                src={img}
                alt={`feedback-img-${idx}`}
                className="w-16 h-16 object-cover rounded-lg border border-gray-200"
              />
            ))}
            {images.length > 3 && (
              <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-100 flex items-center justify-center text-xs text-gray-500 font-medium">
                +{images.length - 3}
              </div>
            )}
          </div>
        )}

        {/* Schedule inline */}
        {scheduleId === id && (
          <div className="flex items-center gap-2 flex-wrap bg-blue-50 p-2 rounded-lg">
            <input
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="text-xs border rounded px-2 py-1 bg-white"
            />
            <button
              onClick={() => handleSchedule(id)}
              className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
            >
              Confirm
            </button>
            <button
              onClick={() => setScheduleId(null)}
              className="text-xs bg-gray-200 px-3 py-1 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
          {item.status !== "APPROVED" && (
            <button
              onClick={() => handleApprove(id)}
              className="flex items-center gap-1 text-xs bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              <CheckCircle size={13} /> Approve
            </button>
          )}
          {item.status !== "REJECTED" && (
            <button
              onClick={() => handleReject(id)}
              className="flex items-center gap-1 text-xs bg-red-50 text-red-700 hover:bg-red-100 px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              <XCircle size={13} /> Reject
            </button>
          )}
          {scheduleId !== id && (
            <button
              onClick={() => {
                setScheduleId(id);
                setScheduleDate("");
              }}
              className="flex items-center gap-1 text-xs bg-orange-50 text-orange-700 hover:bg-orange-100 px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              <Clock size={13} /> Schedule
            </button>
          )}
          <button
            onClick={() => handleFeature(id, item.isFeatured)}
            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              item.isFeatured
                ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                : "bg-gray-50 text-gray-700 hover:bg-gray-100"
            }`}
          >
            <ThumbsUp size={13} />{" "}
            {item.isFeatured ? "Unfeature" : "Feature"}
          </button>
          <button
            onClick={() => handleVerify(id, item.isVerified)}
            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              item.isVerified
                ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                : "bg-gray-50 text-gray-700 hover:bg-gray-100"
            }`}
          >
            <BadgeCheck size={13} />{" "}
            {item.isVerified ? "Unverify" : "Verify"}
          </button>
          <button
            onClick={() => openEdit(item)}
            className="flex items-center gap-1 text-xs bg-gray-50 text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            <Edit2 size={13} /> Edit
          </button>
          <button
            onClick={() => setDeleteTarget(id)}
            className="flex items-center gap-1 text-xs bg-red-50 text-red-700 hover:bg-red-100 px-3 py-1.5 rounded-lg font-medium transition-colors ml-auto"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare className="text-blue-600" size={24} />
          <h1 className="text-xl font-bold text-gray-900">
            Feedback Management
          </h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add Review
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          {
            label: "Total",
            value: stats.total,
            color: "bg-gray-50 border-gray-200",
          },
          {
            label: "Pending",
            value: stats.pending,
            color: "bg-yellow-50 border-yellow-200",
          },
          {
            label: "Approved",
            value: stats.approved,
            color: "bg-green-50 border-green-200",
          },
          {
            label: "Rejected",
            value: stats.rejected,
            color: "bg-red-50 border-red-200",
          },
          {
            label: "Avg Rating",
            value: `${stats.avgRating} \u2605`,
            color: "bg-blue-50 border-blue-200",
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`rounded-xl border p-4 text-center ${s.color}`}
          >
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                tab === t
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t === "All"
                ? "All"
                : t.charAt(0) + t.slice(1).toLowerCase()}
              {t !== "All" && (
                <span className="ml-1 text-xs text-gray-400">
                  ({items.filter((i) => i.status === t).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search by name or comment..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : paginated.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <MessageSquare size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No feedback found</p>
          <p className="text-sm mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {paginated.map(renderCard)}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex justify-center pt-4">
          <Pagination
            total={totalPages}
            page={page}
            onChange={setPage}
            color="primary"
          />
        </div>
      )}

      {/* Delete confirmation */}
      <DeleteConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        isLoading={deleteLoading}
        title="Delete Feedback"
        message="Are you sure you want to delete this feedback? This action cannot be undone."
      />

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-gray-900">
                {editTarget ? "Edit Feedback" : "Add Review"}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.authorName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, authorName: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Customer name"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+1 234 567 8900"
                />
              </div>

              {/* Rating */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rating
                </label>
                <StarInput
                  value={form.rating}
                  onChange={(v) => setForm((f) => ({ ...f, rating: v }))}
                />
              </div>

              {/* Comment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comment
                </label>
                <textarea
                  value={form.textContent}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, textContent: e.target.value }))
                  }
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Customer feedback..."
                />
              </div>

              {/* Product Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product Name
                </label>
                <input
                  type="text"
                  value={form.productName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, productName: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Product name snapshot"
                />
              </div>

              {/* Voice */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Voice Recording
                </label>
                {voicePreview ? (
                  <div className="flex items-center gap-3">
                    <VoicePlayer src={voicePreview} />
                    <button
                      type="button"
                      onClick={() => {
                        setVoicePreview(null);
                        setForm((f) => ({ ...f, voiceUrl: "" }));
                      }}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      ref={voiceInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => handleVoiceFile(e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      onClick={() => voiceInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Mic size={16} /> Upload audio file
                    </button>
                  </div>
                )}
              </div>

              {/* Images */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Images (max 3)
                </label>
                <div className="flex gap-2 flex-wrap">
                  {form.images.map((img, idx) => (
                    <div key={idx} className="relative">
                      <img
                        src={img}
                        alt={`img-${idx}`}
                        className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  {form.images.length < 3 && (
                    <div>
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleImageFiles(e.target.files)}
                      />
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="w-16 h-16 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Status + Verified row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="SCHEDULED">Scheduled</option>
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isVerified}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          isVerified: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Verified
                    </span>
                  </label>
                </div>
              </div>

              {/* Publish At */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Schedule Date (optional)
                </label>
                <input
                  type="datetime-local"
                  value={form.publishAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, publishAt: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {submitting
                    ? "Saving..."
                    : editTarget
                    ? "Update"
                    : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
