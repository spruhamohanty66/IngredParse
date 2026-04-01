"use client";

import { useEffect, useRef, useState } from "react";
import { AnalysisResult } from "@/lib/types";

interface Props {
  macroDominance: AnalysisResult["analysis"]["macro_dominance"];
  onBarClick?: () => void;
}

const MACRO_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  carbohydrate: { label: "Carbs",    color: "#3b82f6", bg: "#eff6ff" },
  fat:          { label: "Fats",     color: "#ec5b13", bg: "#fff4ee" },
  protein:      { label: "Proteins", color: "#22c55e", bg: "#f0fdf4" },
  fiber:        { label: "Fiber",    color: "#8b5cf6", bg: "#f5f3ff" },
};

export default function MacroNutrientsBar({ macroDominance, onBarClick }: Props) {
  const { scores, ingredients = {} } = macroDominance ?? {};
  const containerRef = useRef<HTMLDivElement>(null);

  const activeEntries = Object.entries(scores ?? {}).filter(([, v]) => v > 0);

  // Default to the highest scoring macro
  const dominantMacro = activeEntries.length > 0
    ? activeEntries.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
    : null;
  const [activePopup, setActivePopup] = useState<string | null>(dominantMacro);

  // Close popup when clicking outside
  useEffect(() => {
    if (!activePopup) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActivePopup(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [activePopup]);

  if (activeEntries.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <h3 className="text-sm font-bold text-slate-800 mb-1">Macro Nutrients</h3>
        <p className="text-xs text-slate-400">Insufficient data</p>
      </div>
    );
  }

  const total = activeEntries.reduce((sum, [, v]) => sum + v, 0);

  function togglePopup(macro: string) {
    setActivePopup((prev) => (prev === macro ? null : macro));
    onBarClick?.();
  }

  return (
    <div ref={containerRef} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
      <h3 className="text-sm font-bold text-slate-800 mb-1">Macro Nutrients</h3>
      <p className="text-xs text-slate-400 mb-4">
        Showing dominant macro. Tap others to compare.
      </p>

      {/* Segmented bar — clickable */}
      <div className="flex w-full rounded-full overflow-hidden" style={{ height: "14px" }}>
        {activeEntries.map(([macro, value], i) => {
          const config = MACRO_CONFIG[macro] ?? { label: macro, color: "#94a3b8", bg: "#f1f5f9" };
          const pct = (value / total) * 100;
          const isFirst = i === 0;
          const isLast = i === activeEntries.length - 1;
          const isActive = activePopup === macro;
          return (
            <button
              key={macro}
              onClick={() => togglePopup(macro)}
              style={{
                width: `${pct}%`,
                backgroundColor: config.color,
                opacity: activePopup && !isActive ? 0.4 : 1,
                borderRadius: isFirst ? "9999px 0 0 9999px" : isLast ? "0 9999px 9999px 0" : "0",
                transition: "opacity 0.2s",
                cursor: "pointer",
                border: "none",
                padding: 0,
              }}
            />
          );
        })}
      </div>

      {/* Labels */}
      <div className="flex w-full mt-1.5 mb-1">
        {activeEntries.map(([macro, value]) => {
          const config = MACRO_CONFIG[macro] ?? { label: macro, color: "#94a3b8", bg: "#f1f5f9" };
          const pct = (value / total) * 100;
          const isActive = activePopup === macro;
          return (
            <button
              key={macro}
              onClick={() => togglePopup(macro)}
              className="flex justify-center overflow-hidden"
              style={{ width: `${pct}%`, background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              <span
                className="text-[9px] font-bold truncate"
                style={{
                  color: config.color,
                  textDecoration: isActive ? "underline" : "none",
                }}
              >
                {config.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Floating popup */}
      {activePopup && (() => {
        const config = MACRO_CONFIG[activePopup] ?? { label: activePopup, color: "#94a3b8", bg: "#f1f5f9" };
        const ingreds = ingredients[activePopup] ?? [];
        return (
          <div
            className="mt-3 rounded-xl overflow-hidden"
            style={{ border: `1.5px solid ${config.color}30`, backgroundColor: config.bg }}
          >
            {/* Popup header */}
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{ backgroundColor: config.color }}
            >
              <span className="text-[11px] font-bold text-white">
                {config.label} — Contributing Ingredients
              </span>
              <button onClick={() => setActivePopup(null)}>
                <span className="material-symbols-outlined text-white" style={{ fontSize: "15px" }}>
                  close
                </span>
              </button>
            </div>

            {/* Ingredient chips */}
            <div className="px-3 py-2.5">
              {ingreds.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {ingreds.map((name) => (
                    <span
                      key={name}
                      className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: `${config.color}18`, color: config.color }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-slate-400 italic">No ingredients mapped to this macro.</p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
