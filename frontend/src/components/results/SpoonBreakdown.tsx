"use client";

import { useState } from "react";
import { NutritionData, NutrientValues } from "@/lib/types";
import { scaleNutrientValues } from "@/lib/serving-size";

// ── Conversion constants ──────────────────────────────────────────────────────

const TSP_SUGAR_G    = 4;    // 1 tsp sugar  = 4g
const TSP_FAT_G      = 5;    // 1 tsp oil    = 5g
const SODIUM_DAILY   = 2000; // mg — FSSAI daily reference
const SODIUM_PER_SALT_G = 400; // 1g salt ≈ 400mg sodium
const TSP_SALT_G     = 5;    // 1 tsp salt   = 5g

const MAX_SPOONS     = 3;    // always show max 3 spoon icons; actual count shown as number

const SALT_HEAVY_TYPES = ["chips", "snacks", "noodles", "savory", "namkeen", "instant"];

// ── Spoon icon row ────────────────────────────────────────────────────────────

interface SpoonRowProps {
  tsp: number;
  color: string;
}

// SVG spoon drawn inline — no icon-font dependency
function SpoonSVG({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill={color}
      style={{ opacity, flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* bowl */}
      <ellipse cx="12" cy="7" rx="5" ry="4" />
      {/* handle */}
      <rect x="11" y="11" width="2" height="10" rx="1" />
    </svg>
  );
}

function SpoonRow({ tsp, color }: SpoonRowProps) {
  // Always render exactly MAX_SPOONS icons.
  // Filled = full teaspoons (capped at MAX_SPOONS).
  // Remaining slots shown at low opacity to indicate "empty".
  // Actual count shown as a bold number to the right.
  const fullCount  = Math.floor(tsp);
  const hasPartial = tsp % 1 >= 0.25;
  const filled     = Math.min(fullCount, MAX_SPOONS);
  // partial slot only if < MAX_SPOONS filled
  const showPartial = hasPartial && filled < MAX_SPOONS;
  const partialAt   = showPartial ? filled : -1;
  const countLabel  = tsp.toFixed(1);

  if (tsp < 0.25) {
    return <p className="text-[10px] text-slate-300 mt-1.5">Less than ¼ tsp</p>;
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      {/* 3 spoon slots */}
      <div className="flex items-center gap-1">
        {Array.from({ length: MAX_SPOONS }).map((_, i) => {
          if (i < filled)          return <SpoonSVG key={i} color={color} />;
          if (i === partialAt)     return <SpoonSVG key={i} color={color} opacity={0.35} />;
          return <SpoonSVG key={i} color={color} opacity={0.12} />;
        })}
      </div>
      {/* Actual count */}
      <span className="text-base font-extrabold tabular-nums" style={{ color }}>
        {countLabel}
      </span>
      <span className="text-[10px] text-slate-400 font-medium">tsp</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  nutrition: NutritionData;
  productType: string | null;
}

type ViewKey = "perServing" | "fullPack";

export default function SpoonBreakdown({ nutrition, productType }: Props) {
  const [view, setView] = useState<ViewKey>("perServing");

  const canFullPack = nutrition.servings_per_pack != null && nutrition.servings_per_pack > 1;

  const values: NutrientValues =
    view === "fullPack" && nutrition.servings_per_pack != null
      ? scaleNutrientValues(nutrition.per_serving, nutrition.servings_per_pack)
      : nutrition.per_serving;

  const sugarG   = values.total_sugar_g ?? 0;
  const fatG     = values.total_fat_g   ?? 0;
  const sodiumMg = values.sodium_mg     ?? 0;

  const sugarTsp = sugarG   / TSP_SUGAR_G;
  const fatTsp   = fatG     / TSP_FAT_G;
  const saltTsp  = (sodiumMg / SODIUM_PER_SALT_G) / TSP_SALT_G;
  const sodiumPct = Math.round((sodiumMg / SODIUM_DAILY) * 100);

  const isHighSodium = nutrition.flags.high_sodium;
  const isSaltHeavy  = productType != null &&
    SALT_HEAVY_TYPES.some((t) => productType.toLowerCase().includes(t));
  const showSodium   = (isHighSodium || isSaltHeavy) && sodiumMg > 0;

  const viewLabel =
    view === "perServing"
      ? (nutrition.default_serving_label ?? nutrition.serving_size ?? "1 serving")
      : (nutrition.full_pack_serving_label ?? `Full pack (${nutrition.servings_per_pack} servings)`);

  if (sugarG === 0 && fatG === 0 && !showSodium) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">

      {/* ── Header + toggle ── */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-slate-900 text-sm tracking-tight">Spoon Breakdown</h3>
          <p className="text-[10px] text-slate-400 mt-0.5 font-medium">{viewLabel}</p>
        </div>
        <div className="flex gap-0.5 flex-shrink-0 ml-3 p-0.5 bg-slate-100 rounded-full">
          {(["perServing", "fullPack"] as const).map((v) => {
            const disabled = v === "fullPack" && !canFullPack;
            return (
              <button
                key={v}
                onClick={() => !disabled && setView(v)}
                disabled={disabled}
                className="px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-150"
                style={
                  view === v
                    ? { backgroundColor: "#fff", color: "#0f172a", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }
                    : { backgroundColor: "transparent", color: disabled ? "#d1d5db" : "#94a3b8" }
                }
              >
                {v === "perServing" ? "Per Serving" : "Full Pack"}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Rows ── */}
      <div className="space-y-5">

        {/* Sugar */}
        {sugarG > 0 && (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">🍬</span>
              <span className="text-xs font-bold text-slate-800">Sugar</span>
              <span className="text-xs font-bold" style={{ color: "#ec5b13" }}>
                {sugarTsp.toFixed(1)} tsp
              </span>
              <span className="text-[10px] text-slate-400">({sugarG.toFixed(1)}g)</span>
            </div>
            <SpoonRow tsp={sugarTsp} color="#ec5b13" />
          </div>
        )}

        {/* Fat */}
        {fatG > 0 && (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">🫙</span>
              <span className="text-xs font-bold text-slate-800">Fat</span>
              <span className="text-xs font-bold" style={{ color: "#f59e0b" }}>
                {fatTsp.toFixed(1)} tsp
              </span>
              <span className="text-[10px] text-slate-400">({fatG.toFixed(1)}g)</span>
            </div>
            <SpoonRow tsp={fatTsp} color="#f59e0b" />
          </div>
        )}

        {/* Sodium — conditional */}
        {showSodium && (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">🧂</span>
              <span className="text-xs font-bold text-slate-800">Salt</span>
              <span
                className="text-xs font-bold"
                style={{ color: isHighSodium ? "#dc2626" : "#3b82f6" }}
              >
                {saltTsp >= 0.1 ? `${saltTsp.toFixed(1)} tsp` : "< ¼ tsp"}
              </span>
              <span className="text-[10px] text-slate-400">({sodiumPct}% daily sodium)</span>
            </div>
            <SpoonRow tsp={saltTsp} color={isHighSodium ? "#dc2626" : "#3b82f6"} />
          </div>
        )}

      </div>

      <p className="text-[9px] text-slate-300 mt-4">
        1 tsp sugar ≈ 4g · 1 tsp oil ≈ 5g · daily sodium ref: 2000mg (FSSAI)
      </p>
    </div>
  );
}
