"use client";
import { useState } from "react";
import PersonaSelector from "./PersonaSelector";
import HeroScan from "./HeroScan";
import HowItWorks from "./HowItWorks";
import InsightsPreview from "./InsightsPreview";
import AnalysingScreen from "./AnalysingScreen";
import ResultsScreen from "./ResultsScreen";
import { AnalysisResult } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function toBackendPersona(persona: string | null): string {
  if (persona === "clean") return "clean_eating";
  return persona ?? "kids";
}

export default function HomeClient() {
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [analysing, setAnalysing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [apiResult, setApiResult] = useState<AnalysisResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);

  const canAnalyse = selectedPersona !== null && uploadedFiles.length > 0;

  async function handleAnalyse() {
    if (uploadedFiles.length === 0 || !selectedPersona) return;

    setApiResult(null);
    setApiError(null);
    setCurrentStepId(null);
    setAnalysing(true);
    const analyseStartTime = Date.now();

    const formData = new FormData();
    uploadedFiles.forEach((file) => formData.append("images", file));
    formData.append("persona", toBackendPersona(selectedPersona));

    try {
      const response = await fetch(`${API_BASE}/api/parse`, { method: "POST", body: formData });

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.detail?.error?.message ?? `Server error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.step === "error") {
              throw new Error(payload.message ?? "Analysis failed");
            }
            if (payload.step === "done") {
              setCurrentStepId("done");
              const result = payload.result as AnalysisResult;
              // Use backend duration if available, otherwise compute from frontend
              if (!result.duration_seconds) {
                result.duration_seconds = Math.round((Date.now() - analyseStartTime) / 100) / 10;
              }
              setApiResult(result);
            } else {
              setCurrentStepId(payload.step);
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== "Analysis failed") continue;
            throw parseErr;
          }
        }
      }
    } catch (err: unknown) {
      console.error("[IngredScan] API error:", err);
      setApiError(err instanceof Error ? err.message : "Could not reach the server.");
    }
  }

  if (analysisResult) {
    return (
      <ResultsScreen
        result={analysisResult}
        onBack={() => { setAnalysisResult(null); setAnalysing(false); }}
      />
    );
  }

  if (analysing && uploadedFiles.length > 0) {
    return (
      <AnalysingScreen
        imageFile={uploadedFiles[0]}
        currentStepId={currentStepId}
        apiResult={apiResult}
        apiError={apiError}
        onBack={() => { setAnalysing(false); setApiResult(null); setApiError(null); setCurrentStepId(null); }}
        onComplete={(result) => setAnalysisResult(result)}
      />
    );
  }

  return (
    <>
      {/* Hero greeting */}
      <div>
        <h2 className="text-2xl font-bold leading-snug tracking-tight">
          Scan Smarter,{" "}
          <span className="bg-gradient-to-r from-[#ec5b13] to-[#f59e0b] bg-clip-text text-transparent">
            Eat Better.
          </span>
        </h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Upload a food label and get an instant health breakdown — powered by AI.
        </p>
      </div>

      {/* Persona */}
      <PersonaSelector selected={selectedPersona} onSelect={setSelectedPersona} />

      {/* Upload & Analyse */}
      <HeroScan
        canAnalyse={canAnalyse}
        selectedFiles={uploadedFiles}
        onFilesSelected={setUploadedFiles}
        onAnalyse={handleAnalyse}
      />

      {/* How it works — first-time users */}
      <HowItWorks />

      {/* Insights */}
      <InsightsPreview />

      {/* Disclaimer */}
      <p className="text-[10px] text-slate-400 text-center leading-relaxed px-4 pb-2">
        This is not medical advice. Always consult a healthcare professional for dietary decisions.
      </p>
    </>
  );
}
