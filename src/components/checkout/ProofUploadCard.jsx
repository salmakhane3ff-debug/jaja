"use client";

/**
 * src/components/checkout/ProofUploadCard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The "upload proof" card (dashed drop zone + spinner + preview + remove) shared
 * by /checkout/confirm and the affiliate deposit page. Presentational: it owns
 * the file input + click/drag interaction and calls `onSelectFile(file)`; the
 * PARENT owns what happens to the file (checkout compresses + uploads to the
 * receipt endpoint; the deposit page keeps it and uploads to PRIVATE storage on
 * submit). `preview`/`uploading` are controlled by the parent.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useRef } from "react";
import { Upload, X, CheckCircle, FileText } from "lucide-react";

const DEFAULT_LABELS = {
  title:      "Preuve du virement",
  click:      "Cliquez pour téléverser",
  drag:       "ou glissez-déposez l'image ici",
  uploaded:   "Téléversé",
  processing: "Téléversement…",
  previewAlt: "Preuve du virement",
};

export default function ProofUploadCard({
  preview,
  uploading = false,
  onSelectFile,
  onRemove,
  accept = "image/jpeg,image/png,image/webp",
  previewIsPdf = false, // deposit page may upload a PDF (no <img> preview)
  labels = {},
}) {
  const L = { ...DEFAULT_LABELS, ...labels };
  const fileRef = useRef(null);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
          <Upload className="w-3.5 h-3.5 text-gray-700" />
        </div>
        <h2 className="font-bold text-gray-900 text-sm">{L.title}</h2>
      </div>
      <div className="p-5">
        {!preview ? (
          <div
            onClick={() => !uploading && fileRef.current?.click()}
            onDrop={(e) => { e.preventDefault(); if (!uploading) onSelectFile?.(e.dataTransfer.files?.[0]); }}
            onDragOver={(e) => e.preventDefault()}
            className={`flex flex-col items-center justify-center h-36 border-2 border-dashed rounded-2xl transition-all group
              ${uploading
                ? "border-gray-200 bg-gray-50 cursor-not-allowed"
                : "border-gray-200 cursor-pointer hover:border-gray-400 hover:bg-gray-50"}`}>
            {uploading ? (
              <>
                <div className="w-8 h-8 border-[3px] border-gray-300 border-t-gray-700 rounded-full animate-spin mb-2.5" />
                <p className="text-sm font-semibold text-gray-500">{L.processing}</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center mb-2.5 transition-colors">
                  <Upload className="w-5 h-5 text-gray-400 group-hover:text-gray-700 transition-colors" />
                </div>
                <p className="text-sm font-semibold text-gray-600 group-hover:text-gray-900 transition-colors">{L.click}</p>
                <p className="text-xs text-gray-400 mt-1">{L.drag}</p>
              </>
            )}
          </div>
        ) : (
          <div className="relative rounded-2xl overflow-hidden border border-gray-200">
            {previewIsPdf ? (
              <div className="w-full h-48 flex flex-col items-center justify-center bg-gray-50 text-gray-500">
                <FileText className="w-10 h-10 mb-2" />
                <span className="text-sm font-semibold">PDF</span>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt={L.previewAlt} className="w-full max-h-64 object-contain bg-gray-50" />
            )}
            <button
              onClick={onRemove}
              className="absolute top-3 right-3 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-green-500 text-white text-xs px-2.5 py-1 rounded-full font-semibold">
              <CheckCircle className="w-3 h-3" /> {L.uploaded}
            </div>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => { onSelectFile?.(e.target.files?.[0]); e.target.value = ""; }}
        />
      </div>
    </div>
  );
}
