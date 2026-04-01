"use client";

import { useState } from "react";
import { AnalysisResult, NutritionData, NutrientValues } from "@/lib/types";
import { scaleNutrientValues } from "@/lib/serving-size";

// ── Allergen config ───────────────────────────────────────────────────────────

const ALLERGEN_CONFIG: Record<string, { label: string; emoji: string }> = {
  milk:   { label: "Milk",   emoji: "🥛" },
  egg:    { label: "Egg",    emoji: "🥚" },
  peanut: { label: "Peanut", emoji: "🥜" },
  gluten: { label: "Gluten", emoji: "🌾" },
};

const ALLERGEN_KEYS = ["milk", "egg", "peanut", "gluten"] as const;

// ── Spoon constants ───────────────────────────────────────────────────────────

const TSP_SUGAR_G       = 4;
const TSP_FAT_G         = 5;
const SODIUM_DAILY_MG   = 2000;
const SODIUM_PER_SALT_G = 400;
const TSP_SALT_G        = 5;
const SALT_HEAVY_TYPES  = ["chips", "snacks", "noodles", "savory", "namkeen", "instant"];

// ── Inline SVG spoon ──────────────────────────────────────────────────────────

function SpoonSVG({ color, opacity = 1, size = 20 }: { color: string; opacity?: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ opacity, flexShrink: 0 }} aria-hidden="true">
      <ellipse cx="12" cy="7" rx="5" ry="4" />
      <rect x="11" y="11" width="2" height="10" rx="1" />
    </svg>
  );
}

// ── Spoon row (always 3 icons + actual count) ─────────────────────────────────

function SpoonRow({ tsp, color }: { tsp: number; color: string }) {
  const full        = Math.floor(tsp);
  const hasPartial  = tsp % 1 >= 0.25;
  const filled      = Math.min(full, 3);
  const showPartial = hasPartial && filled < 3;

  if (tsp < 0.25) return <p className="text-[9px] text-slate-300 mt-1">Less than ¼ tsp</p>;

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 3 }).map((_, i) => {
          if (i < filled)      return <SpoonSVG key={i} color={color} size={18} />;
          if (i === filled && showPartial) return <SpoonSVG key={i} color={color} size={18} opacity={0.35} />;
          return <SpoonSVG key={i} color={color} size={18} opacity={0.12} />;
        })}
      </div>
      <span className="text-sm font-extrabold tabular-nums leading-none" style={{ color }}>
        {tsp.toFixed(1)}
      </span>
      <span className="text-[9px] text-slate-400 font-medium">tsp</span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  allergens: AnalysisResult["analysis"]["allergens"];
  nutrition?: NutritionData | null;
  productType?: string | null;
}

type ViewKey = "perServing" | "fullPack";

// ── Component ─────────────────────────────────────────────────────────────────

export default function AllergenCard({ allergens, nutrition, productType }: Props) {
  const [view, setView] = useState<ViewKey>("perServing");

  // ── Spoon values ───────────────────────────────────────────────────────────
  const canFullPack = nutrition != null && (nutrition.servings_per_pack ?? 0) > 1;

  const values: NutrientValues | null = nutrition
    ? view === "fullPack" && nutrition.servings_per_pack != null
      ? scaleNutrientValues(nutrition.per_serving, nutrition.servings_per_pack)
      : nutrition.per_serving
    : null;

  const sugarG   = values?.total_sugar_g ?? 0;
  const fatG     = values?.total_fat_g   ?? 0;
  const sodiumMg = values?.sodium_mg     ?? 0;

  const sugarTsp = sugarG   / TSP_SUGAR_G;
  const fatTsp   = fatG     / TSP_FAT_G;
  const saltTsp  = (sodiumMg / SODIUM_PER_SALT_G) / TSP_SALT_G;
  const sodiumPct = Math.round((sodiumMg / SODIUM_DAILY_MG) * 100);

  const isHighSodium = nutrition?.flags.high_sodium ?? false;
  const isSaltHeavy  = productType != null &&
    SALT_HEAVY_TYPES.some((t) => productType.toLowerCase().includes(t));
  const showSodium   = (isHighSodium || isSaltHeavy) && sodiumMg > 0;

  const showSpoon = nutrition != null && (sugarG > 0 || fatG > 0 || showSodium);

  const viewLabel =
    view === "perServing"
      ? (nutrition?.default_serving_label ?? nutrition?.serving_size ?? "1 serving")
      : (nutrition?.full_pack_serving_label ?? `Full pack (${nutrition?.servings_per_pack} servings)`);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

      {/* ── Allergen section ── */}
      <div className="px-4 pt-3 pb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">Allergens</p>
        <div className="grid grid-cols-4 gap-2">
          {ALLERGEN_KEYS.map((key) => {
            const cfg      = ALLERGEN_CONFIG[key];
            const detected = allergens[key] === true;
            return (
              <div
                key={key}
                className="flex flex-col items-center justify-center rounded-xl py-2.5 px-1 gap-0.5"
                style={
                  detected
                    ? { backgroundColor: "#fef2f2", border: "1px solid #fecaca" }
                    : { backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }
                }
              >
                <span className="text-lg leading-none">{cfg.emoji}</span>
                <span
                  className="text-[8px] font-bold uppercase leading-none mt-1"
                  style={{ color: detected ? "#dc2626" : "#64748b" }}
                >
                  {cfg.label}
                </span>
                <span
                  className="text-[7px] font-medium leading-none mt-0.5"
                  style={{ color: detected ? "#ef4444" : "#94a3b8" }}
                >
                  {detected ? "⚠ Present" : "✓ Clear"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Spoon Breakdown section (only when nutrition available) ── */}
      {showSpoon && (
        <>
          <div className="border-t border-slate-100 mx-4" />

          <div className="px-4 pt-3 pb-3">
            {/* Sub-header + toggle */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Spoon Breakdown</p>
                <p className="text-[9px] text-slate-300 mt-0.5">{viewLabel}</p>
              </div>
              <div className="flex gap-0.5 p-0.5 bg-slate-100 rounded-full">
                {(["perServing", "fullPack"] as const).map((v) => {
                  const disabled = v === "fullPack" && !canFullPack;
                  return (
                    <button
                      key={v}
                      onClick={() => !disabled && setView(v)}
                      disabled={disabled}
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-150"
                      style={
                        view === v
                          ? { backgroundColor: "#fff", color: "#0f172a", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }
                          : { backgroundColor: "transparent", color: disabled ? "#d1d5db" : "#94a3b8" }
                      }
                    >
                      {v === "perServing" ? "Serving" : "Full Pack"}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rows */}
            <div className="space-y-3">
              {sugarG > 0 && (
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm leading-none">🍬</span>
                    <span className="text-[11px] font-bold text-slate-700">Sugar</span>
                    <span className="text-[9px] text-slate-400">({sugarG.toFixed(1)}g)</span>
                  </div>
                  <SpoonRow tsp={sugarTsp} color="#ec5b13" />
                </div>
              )}
              {fatG > 0 && (
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm leading-none">🫙</span>
                    <span className="text-[11px] font-bold text-slate-700">Fat</span>
                    <span className="text-[9px] text-slate-400">({fatG.toFixed(1)}g)</span>
                  </div>
                  <SpoonRow tsp={fatTsp} color="#f59e0b" />
                </div>
              )}
              {showSodium && (
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm leading-none">🧂</span>
                    <span className="text-[11px] font-bold text-slate-700">Salt</span>
                    <span className="text-[9px] text-slate-400">({sodiumPct}% daily)</span>
                  </div>
                  <SpoonRow tsp={saltTsp} color={isHighSodium ? "#dc2626" : "#3b82f6"} />
                </div>
              )}
            </div>

            <p className="text-[8px] text-slate-200 mt-3">1 tsp sugar ≈ 4g · 1 tsp oil ≈ 5g</p>
          </div>
        </>
      )}
    </div>
  );
}
