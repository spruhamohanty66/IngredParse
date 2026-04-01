"use client";
import { useRef } from "react";

interface Props {
  canAnalyse: boolean;
  onFilesSelected: (files: File[]) => void;
  onAnalyse: () => void;
  selectedFiles: File[];
}

export default function HeroScan({ canAnalyse, onFilesSelected, onAnalyse, selectedFiles }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    onFilesSelected(files);
  }

  const hasFiles = selectedFiles.length > 0;

  return (
    <section className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Decorative blobs */}
      <div
        aria-hidden="true"
        className="absolute inset-0 overflow-hidden"
        style={{ zIndex: 0, pointerEvents: "none" }}
      >
        <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full blur-3xl" style={{ backgroundColor: "rgba(236,91,19,0.08)" }} />
        <div className="absolute top-16 -left-10 w-40 h-40 rounded-full blur-3xl" style={{ backgroundColor: "rgba(34,197,94,0.08)" }} />
      </div>

      <div className="relative bg-white/90 rounded-2xl p-4 shadow-sm border border-slate-100/80" style={{ zIndex: 1 }}>
        {/* Upload zone */}
        <button
          onClick={handleUploadClick}
          className="w-full rounded-xl transition-all cursor-pointer active:scale-[0.98]"
          style={{
            border: hasFiles ? "2px solid rgba(236,91,19,0.2)" : "2px dashed rgba(236,91,19,0.3)",
            backgroundColor: hasFiles ? "rgba(236,91,19,0.04)" : "rgba(236,91,19,0.02)",
            padding: hasFiles ? "12px" : "20px 12px",
          }}
        >
          {hasFiles ? (
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5 overflow-x-auto flex-1">
                {selectedFiles.map((file, i) => (
                  <div key={i} className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-slate-200/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`Image ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-col items-end flex-shrink-0">
                <span className="text-xs font-semibold" style={{ color: "#ec5b13" }}>
                  {selectedFiles.length} image{selectedFiles.length > 1 ? "s" : ""}
                </span>
                <span className="text-[10px] text-slate-400">Tap to change</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(236,91,19,0.1)" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "24px", color: "#ec5b13" }}>
                  add_a_photo
                </span>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-700">Upload Food Label</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Ingredients, Nutrition, or Both</p>
              </div>
            </div>
          )}
        </button>

        {/* Analyse button */}
        <button
          disabled={!canAnalyse}
          onClick={canAnalyse ? onAnalyse : undefined}
          className="w-full mt-3 py-3 text-white rounded-xl font-bold flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.98]"
          style={{
            backgroundColor: canAnalyse ? "#ec5b13" : "#d1d5db",
            boxShadow: canAnalyse ? "0 4px 14px rgba(236,91,19,0.3)" : "none",
            cursor: canAnalyse ? "pointer" : "not-allowed",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>analytics</span>
          Analyse Label
        </button>

        {!canAnalyse && (
          <p className="text-center text-[10px] text-slate-400 mt-2">
            {!selectedFiles.length && !canAnalyse
              ? "Select a persona & upload a label to start"
              : "Select a persona to continue"}
          </p>
        )}
      </div>
    </section>
  );
}
