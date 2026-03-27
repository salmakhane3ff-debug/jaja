"use client";

import React, { useState, useRef } from "react";
import { Star, Mic, Plus, X, Send } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// ── VoicePlayerMini ───────────────────────────────────────────────────────────

function VoicePlayerMini({ src }) {
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
    <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1.5 max-w-[180px]">
      <button
        type="button"
        onClick={toggle}
        className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white flex-shrink-0"
      >
        {playing ? (
          <span className="w-2 h-2 bg-white rounded-sm" />
        ) : (
          <span
            className="border-l-[8px] border-l-white border-y-[5px] border-y-transparent ml-0.5"
            style={{ display: "block" }}
          />
        )}
      </button>
      <div
        className="flex-1 h-1 bg-gray-300 rounded-full cursor-pointer"
        onClick={(e) => {
          if (!audioRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          audioRef.current.currentTime = ratio * duration;
        }}
      >
        <div
          className="h-full bg-blue-400 rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 font-mono flex-shrink-0">
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
            (audioRef.current.currentTime / audioRef.current.duration) * 100 || 0
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

// ── VoiceRecorder ─────────────────────────────────────────────────────────────

function VoiceRecorder({ onRecorded, onClear, voiceUrl }) {
  const { t } = useLanguage();
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => onRecorded(reader.result);
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      alert(t("feedback_form_error_mic"));
    }
  };

  const stop = () => {
    mediaRecorderRef.current?.stop();
    clearInterval(timerRef.current);
    setRecording(false);
  };

  const formatTime = (s) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (voiceUrl) {
    return (
      <div className="flex items-center gap-3">
        <VoicePlayerMini src={voiceUrl} />
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
        >
          <X size={12} /> {t("feedback_form_voice_delete")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={recording ? stop : start}
        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
          recording
            ? "bg-red-500 text-white animate-pulse"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        <Mic size={15} />
        {recording
          ? `${t("feedback_form_voice_recording")} ${formatTime(duration)}`
          : t("feedback_form_voice_record")}
      </button>
      {recording && (
        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse inline-block" />
      )}
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
          className="transition-transform hover:scale-110"
        >
          <Star
            size={28}
            aria-hidden="true"
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

// ── FeedbackForm ──────────────────────────────────────────────────────────────

export default function FeedbackForm({ productId, productName, onSuccess }) {
  const { t, dir } = useLanguage();
  const [form, setForm] = useState({
    authorName: "",
    phone: "",
    rating: 5,
    textContent: "",
  });
  const [voiceUrl, setVoiceUrl] = useState(null);
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const imageInputRef = useRef(null);

  const isRtl = dir === "rtl";

  const handleImageFiles = (files) => {
    const remaining = 3 - images.length;
    if (remaining <= 0) return;
    Array.from(files).slice(0, remaining).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        setImages((prev) => [...prev, reader.result].slice(0, 3));
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (idx) =>
    setImages((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.authorName.trim()) {
      setError(t("feedback_form_error_name"));
      return;
    }
    if (!form.textContent.trim() && !voiceUrl) {
      setError(t("feedback_form_error_content"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: form.authorName,
          phone: form.phone,
          rating: form.rating,
          textContent: form.textContent || null,
          voiceUrl: voiceUrl || null,
          images,
          productId: productId || null,
          productName: productName || null,
        }),
      });

      if (!res.ok) throw new Error();

      setSuccess(true);
      setForm({ authorName: "", phone: "", rating: 5, textContent: "" });
      setVoiceUrl(null);
      setImages([]);
      if (onSuccess) onSuccess();
    } catch {
      setError(t("feedback_form_error_submit"));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center" dir={dir}>
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">✓</span>
        </div>
        <h3 className="text-lg font-bold text-green-800 mb-2">
          {t("feedback_form_success_title")}
        </h3>
        <p className="text-green-700 text-sm">{t("feedback_form_success_msg")}</p>
        <button
          onClick={() => setSuccess(false)}
          className="mt-4 text-sm text-green-600 hover:text-green-800 underline"
        >
          {t("feedback_form_success_another")}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      dir={dir}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5"
    >
      <h3 className="text-lg font-bold text-gray-900">
        {t("feedback_form_title")}
      </h3>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Rating */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t("feedback_form_rating_label")}
        </label>
        <div className={`flex ${isRtl ? "justify-end" : "justify-start"}`}>
          <StarInput
            value={form.rating}
            onChange={(v) => setForm((f) => ({ ...f, rating: v }))}
          />
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("feedback_form_name_label")} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={form.authorName}
          onChange={(e) => setForm((f) => ({ ...f, authorName: e.target.value }))}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder={t("feedback_form_name_placeholder")}
          dir={dir}
        />
      </div>

      {/* Phone */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("feedback_form_phone_label")}
        </label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="06XXXXXXXX"
          dir="ltr"
        />
      </div>

      {/* Comment */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("feedback_form_comment_label")}
        </label>
        <textarea
          value={form.textContent}
          onChange={(e) => setForm((f) => ({ ...f, textContent: e.target.value }))}
          rows={4}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          placeholder={t("feedback_form_comment_placeholder")}
          dir={dir}
        />
      </div>

      {/* Voice */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t("feedback_form_voice_label")}
        </label>
        <div className={`flex ${isRtl ? "justify-end" : "justify-start"}`}>
          <VoiceRecorder
            voiceUrl={voiceUrl}
            onRecorded={setVoiceUrl}
            onClear={() => setVoiceUrl(null)}
          />
        </div>
      </div>

      {/* Images */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t("feedback_form_images_label")}
        </label>
        <div className={`flex gap-2 flex-wrap ${isRtl ? "justify-end" : "justify-start"}`}>
          {images.map((img, idx) => (
            <div key={idx} className="relative">
              <img
                src={img}
                alt={`upload-${idx}`}
                className="w-20 h-20 object-cover rounded-xl border border-gray-200"
              />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className={`absolute -top-1.5 ${isRtl ? "-right-1.5" : "-left-1.5"} w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600`}
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {images.length < 3 && (
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
                className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 hover:bg-gray-50 hover:border-gray-400 transition-colors"
              >
                <Plus size={20} />
                <span className="text-xs">{t("feedback_form_image_btn")}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
      >
        {submitting ? (
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Send size={16} />
        )}
        {submitting ? t("feedback_form_submitting") : t("feedback_form_submit")}
      </button>
    </form>
  );
}
