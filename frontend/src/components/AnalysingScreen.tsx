"use client";
import { useEffect, useRef } from "react";
import { AnalysisResult } from "@/lib/types";

const STEPS = [
  { id: "ocr",      label: "Reading label text",                icon: "document_scanner" },
  { id: "classify", label: "Identifying label type",            icon: "inventory_2"      },
  { id: "parse",    label: "Extracting ingredients",            icon: "biotech"          },
  { id: "db_match", label: "Matching with ingredient database", icon: "database"         },
  { id: "analysis", label: "Generating health insights",        icon: "auto_awesome"     },
];

const STATUS_MESSAGES: Record<string, string> = {
  ocr:      "Scanning your image for text...",
  classify: "Identifying the type of label...",
  parse:    "Extracting and structuring ingredients...",
  db_match: "Comparing with our ingredient database...",
  analysis: "Crafting your personalised health insights...",
  done:     "Analysis complete!",
};

interface Props {
  imageFile: File;
  currentStepId: string | null;
  apiResult: AnalysisResult | null;
  apiError: string | null;
  onBack: () => void;
  onComplete?: (result: AnalysisResult) => void;
}

export default function AnalysingScreen({ imageFile, currentStepId, apiResult, apiError, onBack, onComplete }: Props) {
  const imageUrl = useRef(URL.createObjectURL(imageFile)).current;
  const isDone = currentStepId === "done";

  const activeIdx = STEPS.findIndex((s) => s.id === currentStepId);
  const progress = isDone || apiResult
    ? 100
    : activeIdx >= 0
    ? Math.round(((activeIdx + 0.5) / STEPS.length) * 100)
    : 5;

  // Navigate to results once done
  useEffect(() => {
    if (!isDone || !apiResult) return;
    const timer = setTimeout(() => onComplete?.(apiResult), 700);
    return () => clearTimeout(timer);
  }, [isDone, apiResult, onComplete]);

  function stepState(stepId: string): "done" | "active" | "waiting" {
    if (isDone || apiResult) return "done";
    if (!currentStepId) return "waiting";
    const thisIdx = STEPS.findIndex((s) => s.id === stepId);
    if (thisIdx < activeIdx) return "done";
    if (thisIdx === activeIdx) return "active";
    return "waiting";
  }

  const statusMsg = isDone
    ? "Analysis complete!"
    : currentStepId
    ? STATUS_MESSAGES[currentStepId] ?? "Processing..."
    : "Starting analysis...";

  return (
    <div className="flex flex-col" style={{ height: "100dvh", backgroundColor: "#f8f6f6" }}>
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-3 flex-shrink-0 glass-effect border-b" style={{ borderColor: "rgba(255,255,255,0.4)" }}>
        <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center bg-white shadow-sm border border-slate-100">
          <span className="material-symbols-outlined text-slate-700" style={{ fontSize: "20px" }}>arrow_back</span>
        </button>
        <h1 className="text-lg font-bold text-slate-900">Analyzing Product Label...</h1>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 space-y-4" style={{ paddingBottom: "24px" }}>

        {/* Image preview */}
        <div className="bg-white rounded-xl overflow-hidden shadow-md border border-slate-100 relative" style={{ height: "200px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Uploaded label" className="w-full h-full object-cover" />
          {!isDone && !apiError && (
            <div className="absolute left-0 right-0 h-0.5 scan-line" style={{ backgroundColor: "#ec5b13", opacity: 0.85 }} />
          )}
          {(isDone || apiResult) && !apiError && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(34,197,94,0.15)" }}>
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: "#22c55e" }}>
                <span className="material-symbols-outlined text-white" style={{ fontSize: "32px" }}>check</span>
              </div>
            </div>
          )}
        </div>

        {/* Steps timeline */}
        <div className="bg-white rounded-xl p-5 shadow-md border border-slate-100">
          {STEPS.map((step, idx) => {
            const state = stepState(step.id);
            const isLast = idx === STEPS.length - 1;
            return (
              <div key={step.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <StepIcon state={state} icon={step.icon} />
                  {!isLast && (
                    <div className="w-px flex-1 my-1" style={{ backgroundColor: state === "done" ? "#22c55e" : "#e2e8f0", minHeight: "24px" }} />
                  )}
                </div>
                <div className="pb-5 flex-1">
                  <p className="text-sm font-bold leading-snug" style={{ color: state === "waiting" ? "#94a3b8" : "#0f172a" }}>
                    {step.label}
                  </p>
                  <p className="text-xs mt-0.5 font-semibold" style={{ color: state === "done" ? "#22c55e" : state === "active" ? "#ec5b13" : "#cbd5e1" }}>
                    {state === "done" ? "Completed" : state === "active" ? "Processing..." : "Waiting"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* API error */}
        {apiError && (
          <div className="bg-white rounded-xl p-4 shadow-md border border-red-100">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined" style={{ color: "#ef4444", fontSize: "20px" }}>error</span>
              <div>
                <p className="text-sm font-bold text-slate-800">Analysis failed</p>
                <p className="text-xs text-slate-500 mt-0.5">{apiError}</p>
                <button onClick={onBack} className="mt-3 text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ backgroundColor: "#ec5b13" }}>
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {!apiError && (
          <div className="bg-white rounded-xl p-4 shadow-md border border-slate-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Analysis Progress</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(236,91,19,0.1)", color: "#ec5b13" }}>
                {progress}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#f1f5f9" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: "#ec5b13" }} />
            </div>
            <p className="text-xs text-slate-400 mt-2 italic text-center">{statusMsg}</p>
          </div>
        )}

        {/* Footer note */}
        <div className="flex items-center gap-3 px-1">
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#ec5b13" }}>
            <span className="material-symbols-outlined text-white" style={{ fontSize: "14px" }}>info</span>
          </div>
          <p className="text-xs text-slate-500 text-center flex-1">Using AI to provide personalised health insights</p>
        </div>
      </div>

      <style>{`
        @keyframes scanMove { 0% { top: 10%; } 50% { top: 85%; } 100% { top: 10%; } }
        .scan-line { animation: scanMove 2s ease-in-out infinite; position: absolute; }
      `}</style>
    </div>
  );
}

function StepIcon({ state, icon }: { state: "done" | "active" | "waiting"; icon: string }) {
  if (state === "done") return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(34,197,94,0.15)", border: "2px solid #22c55e" }}>
      <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "#22c55e" }}>check</span>
    </div>
  );
  if (state === "active") return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 spin-slow" style={{ backgroundColor: "rgba(236,91,19,0.12)", border: "2px solid #ec5b13" }}>
      <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "#ec5b13" }}>{icon}</span>
    </div>
  );
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f1f5f9", border: "2px solid #e2e8f0" }}>
      <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "#cbd5e1" }}>{icon}</span>
    </div>
  );
}
