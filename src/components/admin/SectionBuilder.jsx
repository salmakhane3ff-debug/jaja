"use client";

/**
 * SectionBuilder — Mini Page Builder with dual media input (Upload + URL).
 *
 * Props:
 *   sections  – array of section objects
 *   onChange  – (sections) => void
 */

import { useState, useCallback, useRef } from "react";
import {
  Plus, X, ChevronUp, ChevronDown, GripVertical,
  Type, Image as ImageIcon, Video, LayoutGrid, HelpCircle, Space,
  ChevronDown as Chevron, Check, Upload, Link, Loader2,
} from "lucide-react";

// ── Unique ID ─────────────────────────────────────────────────────────────────
let _seq = 0;
function uid() { return `s_${Date.now()}_${++_seq}`; }

// ── Section type definitions ──────────────────────────────────────────────────
const SECTION_TYPES = [
  { type: "text",    label: "Text / Rich HTML",  icon: Type,       color: "blue",   default: { html: "" } },
  { type: "image",   label: "Image / GIF",       icon: ImageIcon,  color: "green",  default: { source: "upload", url: "", fullWidth: false, alt: "" } },
  { type: "video",   label: "Video",             icon: Video,      color: "purple", default: { source: "url", url: "", autoplay: false, muted: true, loop: false } },
  { type: "gallery", label: "Image / GIF Gallery", icon: LayoutGrid, color: "orange", default: { images: [], columns: 2, gap: 8 } },
  { type: "faq",     label: "FAQ / Accordion",   icon: HelpCircle, color: "teal",   default: { items: [] } },
  { type: "spacer",  label: "Spacer",            icon: Space,      color: "gray",   default: { height: 40 } },
];

const TYPE_META = Object.fromEntries(SECTION_TYPES.map((t) => [t.type, t]));

const COLOR_MAP = {
  blue:   "bg-blue-100 text-blue-700 border-blue-200",
  green:  "bg-green-100 text-green-700 border-green-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  teal:   "bg-teal-100 text-teal-700 border-teal-200",
  gray:   "bg-gray-100 text-gray-600 border-gray-200",
};

// ── Upload helper ─────────────────────────────────────────────────────────────
async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res  = await fetch("/api/image", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.url;
}

// ── Shared: Media Source Picker ───────────────────────────────────────────────
// Shows two tabs: "Upload" and "URL". Handles file picking + upload internally.
function MediaSourcePicker({
  source,           // "upload" | "url"
  url,              // current URL value
  accept,           // file accept string, e.g. "image/*" or "video/*"
  urlPlaceholder,
  urlHint,
  previewType,      // "image" | "video" | null
  onSourceChange,   // (source) => void
  onUrlChange,      // (url) => void
}) {
  const fileRef    = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const uploadedUrl = await uploadFile(file);
      onUrlChange(uploadedUrl);
    } catch (ex) {
      setErr(ex.message || "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-3">
      {/* Tab selector */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
        {["upload", "url"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSourceChange(s)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-colors
              ${source === s
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >
            {s === "upload" ? <Upload size={11} /> : <Link size={11} />}
            {s === "upload" ? "Upload" : "URL"}
          </button>
        ))}
      </div>

      {/* Upload panel */}
      {source === "upload" && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            style={{ display: "none" }}
            onChange={handleFile}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-60 transition-colors"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {busy ? "Uploading…" : "Choose file"}
            </button>
            {url && (
              <button type="button" onClick={() => onUrlChange("")}
                className="text-xs text-red-500 hover:underline">
                Remove
              </button>
            )}
          </div>
          {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
        </div>
      )}

      {/* URL panel */}
      {source === "url" && (
        <div>
          <input
            type="url"
            value={url || ""}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder={urlPlaceholder}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 bg-gray-50"
          />
          {urlHint && <p className="text-xs text-gray-400 mt-0.5">{urlHint}</p>}
        </div>
      )}

      {/* Preview */}
      {url && previewType === "image" && (
        <div className="relative w-fit">
          <img
            src={url}
            alt="preview"
            onError={(e) => { e.target.style.display = "none"; }}
            className="max-h-36 rounded-lg border border-gray-200 bg-gray-50 object-contain"
          />
          <button type="button" onClick={() => onUrlChange("")}
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
            <X size={10} />
          </button>
        </div>
      )}

      {url && previewType === "video" && (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 truncate">
          ✓ {url}
        </div>
      )}
    </div>
  );
}

// ── Shared: Checkbox ──────────────────────────────────────────────────────────
function Check2({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
          ${checked ? "bg-gray-900 border-gray-900" : "border-gray-300 bg-white"}`}
      >
        {checked && <Check size={11} className="text-white" strokeWidth={3} />}
      </button>
      <span className="text-xs text-gray-700">{label}</span>
    </label>
  );
}

// ── Section Editors ───────────────────────────────────────────────────────────

function TextEditor({ data, onChange }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Content (HTML supported)</label>
        <textarea
          rows={6}
          value={data.html || ""}
          onChange={(e) => onChange({ ...data, html: e.target.value })}
          placeholder="<p>Write your content here. HTML is supported.</p>"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 bg-gray-50 resize-y font-mono"
          dir="ltr"
        />
        <p className="text-xs text-gray-400 mt-0.5">
          Supports: &lt;p&gt; &lt;h2&gt; &lt;h3&gt; &lt;strong&gt; &lt;ul&gt; &lt;ol&gt; &lt;li&gt; &lt;br&gt;
        </p>
      </div>
      {data.html && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Preview</p>
          <div
            className="prose prose-sm max-w-none text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: data.html }}
          />
        </div>
      )}
    </div>
  );
}

function ImageEditor({ data, onChange }) {
  const source = data.source || "upload";
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2">Media Source</label>
        <MediaSourcePicker
          source={source}
          url={data.url || ""}
          accept="image/*"
          urlPlaceholder="https://example.com/image.jpg or image.gif"
          urlHint="Supports JPG, PNG, GIF (animated), WebP, SVG"
          previewType="image"
          onSourceChange={(s) => onChange({ ...data, source: s })}
          onUrlChange={(u) => onChange({ ...data, url: u })}
        />
        <p className="text-xs text-gray-400 mt-1.5">✓ Animated GIFs are fully supported</p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Alt text</label>
        <input type="text" value={data.alt || ""} onChange={(e) => onChange({ ...data, alt: e.target.value })}
          placeholder="Describe the image for accessibility"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 bg-gray-50" />
      </div>
      <Check2 label="Full width (edge-to-edge)" checked={!!data.fullWidth}
        onChange={(v) => onChange({ ...data, fullWidth: v })} />
    </div>
  );
}

function VideoEditor({ data, onChange }) {
  const source = data.source || "url";
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2">Media Source</label>
        <MediaSourcePicker
          source={source}
          url={data.url || ""}
          accept="video/mp4,video/webm,video/ogg"
          urlPlaceholder="YouTube, Vimeo, or direct .mp4 URL"
          urlHint="Supports: youtube.com, youtu.be, vimeo.com, .mp4/.webm"
          previewType="video"
          onSourceChange={(s) => onChange({ ...data, source: s })}
          onUrlChange={(u) => onChange({ ...data, url: u })}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <Check2 label="Autoplay (requires muted)" checked={!!data.autoplay}
          onChange={(v) => onChange({ ...data, autoplay: v, muted: v ? true : data.muted })} />
        <Check2 label="Muted" checked={!!data.muted}
          onChange={(v) => onChange({ ...data, muted: v })} />
        <Check2 label="Loop" checked={!!data.loop}
          onChange={(v) => onChange({ ...data, loop: v })} />
      </div>
      {data.autoplay && !data.muted && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠ Autoplay requires muted — muted enabled automatically.
        </p>
      )}
    </div>
  );
}

// ── Gallery Editor ────────────────────────────────────────────────────────────
function GalleryEditor({ data, onChange }) {
  const fileRef    = useRef(null);
  const dragIdx    = useRef(null);
  const dragOver   = useRef(null);
  const [busy, setBusy]    = useState(false);
  const [draft, setDraft]  = useState("");
  const images = data.images || [];

  // Upload multiple files
  const handleFiles = async (files) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    setBusy(true);
    const uploaded = [];
    for (const file of arr) {
      try {
        const url = await uploadFile(file);
        uploaded.push(url);
      } catch { /* skip failed */ }
    }
    onChange({ ...data, images: [...images, ...uploaded] });
    setBusy(false);
  };

  const handleFileInput = (e) => { handleFiles(e.target.files); e.target.value = ""; };

  const addUrl = () => {
    const url = draft.trim();
    if (!url) return;
    onChange({ ...data, images: [...images, url] });
    setDraft("");
  };

  const removeImage = (i) => onChange({ ...data, images: images.filter((_, idx) => idx !== i) });

  // Drag-reorder
  const onDragStart = (i) => { dragIdx.current = i; };
  const onDragEnter = (i) => { dragOver.current = i; };
  const onDragEnd   = () => {
    const from = dragIdx.current, to = dragOver.current;
    if (from !== null && to !== null && from !== to) {
      const next = [...images];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      onChange({ ...data, images: next });
    }
    dragIdx.current = dragOver.current = null;
  };

  return (
    <div className="space-y-4">
      {/* Upload + URL add row */}
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFileInput} />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-60 transition-colors"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {busy ? "Uploading…" : "Upload Images / GIFs"}
        </button>
        <span className="flex items-center text-xs text-gray-400">or</span>
        <div className="flex gap-1 flex-1 min-w-[200px]">
          <input
            type="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addUrl())}
            placeholder="Paste image URL…"
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 bg-gray-50"
          />
          <button type="button" onClick={addUrl}
            className="px-3 py-2 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200 transition-colors">
            Add
          </button>
        </div>
      </div>

      {/* Image grid */}
      {images.length > 0 && (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${data.columns || 2}, 1fr)` }}
        >
          {images.map((url, i) => (
            <div
              key={url + i}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragEnter={() => onDragEnter(i)}
              onDragEnd={onDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className="relative group rounded-lg overflow-hidden border-2 border-gray-200 bg-gray-100 cursor-grab active:cursor-grabbing select-none hover:shadow-md transition-shadow"
              style={{ aspectRatio: "1/1" }}
            >
              <img src={url} alt="" className="w-full h-full object-contain"
                draggable={false}
                loading={/\.gif(\?|$)/i.test(url) ? "eager" : "lazy"}
                onError={(e) => { e.target.style.display = "none"; }} />
              <button type="button" onClick={() => removeImage(i)}
                className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={10} />
              </button>
              <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-black/40 text-white px-1 rounded">
                {i + 1}
              </span>
            </div>
          ))}
        </div>
      )}

      {images.length === 0 && (
        <div
          onClick={() => fileRef.current?.click()}
          className="w-full h-24 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-gray-400 text-sm cursor-pointer"
        >
          <Plus size={16} /> Click to add images
        </div>
      )}

      {/* Settings */}
      <div className="flex gap-4 items-center">
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Columns</label>
          <select value={data.columns || 2} onChange={(e) => onChange({ ...data, columns: Number(e.target.value) })}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50">
            {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Gap (px)</label>
          <input type="number" min={0} max={32} value={data.gap ?? 8}
            onChange={(e) => onChange({ ...data, gap: Number(e.target.value) })}
            className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50" />
        </div>
        <div className="text-xs text-gray-400 mt-4">
          {images.length} item{images.length !== 1 ? "s" : ""} · JPG, PNG, GIF · drag to reorder
        </div>
      </div>
    </div>
  );
}

function FaqEditor({ data, onChange }) {
  const items = data.items || [];
  const add    = () => onChange({ ...data, items: [...items, { q: "", a: "", id: uid() }] });
  const remove = (i) => onChange({ ...data, items: items.filter((_, idx) => idx !== i) });
  const update = (i, field, val) =>
    onChange({ ...data, items: items.map((item, idx) => idx === i ? { ...item, [field]: val } : item) });

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={item.id || i} className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-xs font-bold text-gray-400">Q{i + 1}</span>
            <button type="button" onClick={() => remove(i)} className="ml-auto text-gray-300 hover:text-red-500">
              <X size={13} />
            </button>
          </div>
          <div className="p-3 space-y-2">
            <input type="text" value={item.q || ""} onChange={(e) => update(i, "q", e.target.value)}
              placeholder="Question"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 bg-white font-medium" />
            <textarea rows={2} value={item.a || ""} onChange={(e) => update(i, "a", e.target.value)}
              placeholder="Answer"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 bg-white resize-none" />
          </div>
        </div>
      ))}
      <button type="button" onClick={add}
        className="w-full py-2 border-2 border-dashed border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors">
        <Plus size={13} /> Add Question
      </button>
    </div>
  );
}

function SpacerEditor({ data, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Height (px)</label>
      <input type="range" min={8} max={200} value={data.height || 40}
        onChange={(e) => onChange({ ...data, height: Number(e.target.value) })}
        className="flex-1" />
      <span className="text-sm font-bold text-gray-700 w-10 text-right">{data.height || 40}px</span>
      <div className="w-16 border-2 border-dashed border-gray-300 rounded"
        style={{ height: Math.min(data.height || 40, 60) }} />
    </div>
  );
}

const EDITORS = {
  text:    TextEditor,
  image:   ImageEditor,
  video:   VideoEditor,
  gallery: GalleryEditor,
  faq:     FaqEditor,
  spacer:  SpacerEditor,
};

// ── Section Card ──────────────────────────────────────────────────────────────
function SectionCard({ section, index, total, onChange, onRemove, onMove }) {
  const [open, setOpen] = useState(true);
  const meta   = TYPE_META[section.type] || TYPE_META.text;
  const Icon   = meta.icon;
  const colors = COLOR_MAP[meta.color] || COLOR_MAP.gray;
  const Editor = EDITORS[section.type] || TextEditor;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border-b border-gray-100">
        <GripVertical size={14} className="text-gray-300 shrink-0" />
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${colors}`}>
          <Icon size={10} /> {meta.label}
        </span>
        <span className="text-xs text-gray-400 ml-1">#{index + 1}</span>
        <div className="flex gap-1 ml-auto">
          <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-gray-200 disabled:opacity-20 transition-colors">
            <ChevronUp size={13} />
          </button>
          <button type="button" onClick={() => onMove(index, 1)} disabled={index === total - 1}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-gray-200 disabled:opacity-20 transition-colors">
            <ChevronDown size={13} />
          </button>
          <button type="button" onClick={() => setOpen((o) => !o)}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-gray-200 transition-colors">
            <Chevron size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          <button type="button" onClick={onRemove}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-red-100 hover:text-red-500 transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>
      {open && (
        <div className="p-4">
          <Editor data={section.data} onChange={(newData) => onChange({ ...section, data: newData })} />
        </div>
      )}
    </div>
  );
}

// ── Add Section Menu ──────────────────────────────────────────────────────────
function AddSectionMenu({ onAdd }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-gray-500 hover:text-gray-700 flex items-center justify-center gap-2 text-sm font-medium transition-colors">
        <Plus size={16} /> Add Section
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="grid grid-cols-2 gap-0">
            {SECTION_TYPES.map((t) => {
              const Icon   = t.icon;
              const colors = COLOR_MAP[t.color];
              return (
                <button key={t.type} type="button"
                  onClick={() => { onAdd(t.type); setOpen(false); }}
                  className="flex items-center gap-2.5 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-r border-gray-100">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center border ${colors}`}>
                    <Icon size={14} />
                  </span>
                  <span className="text-xs font-semibold text-gray-700">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main SectionBuilder ───────────────────────────────────────────────────────
export default function SectionBuilder({ sections = [], onChange }) {
  const add = useCallback((type) => {
    const meta    = TYPE_META[type];
    const section = { id: uid(), type, data: { ...meta.default } };
    onChange([...sections, section]);
  }, [sections, onChange]);

  const update = useCallback((index, updated) => {
    onChange(sections.map((s, i) => i === index ? updated : s));
  }, [sections, onChange]);

  const remove = useCallback((index) => {
    onChange(sections.filter((_, i) => i !== index));
  }, [sections, onChange]);

  const move = useCallback((index, dir) => {
    const next   = [...sections];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }, [sections, onChange]);

  return (
    <div className="space-y-3">
      {sections.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          No sections yet. Click &quot;Add Section&quot; to start building.
        </div>
      )}
      {sections.map((section, i) => (
        <SectionCard
          key={section.id || i}
          section={section}
          index={i}
          total={sections.length}
          onChange={(updated) => update(i, updated)}
          onRemove={() => remove(i)}
          onMove={(idx, dir) => move(idx, dir)}
        />
      ))}
      <AddSectionMenu onAdd={add} />
      {sections.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          {sections.length} section{sections.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
