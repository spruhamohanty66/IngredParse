"use client";

import { useState, useMemo } from "react";
import { NutrientValues, NutritionData } from "@/lib/types";
import {
  buildOuterRingData,
  buildInnerRingData,
  SunburstSegment,
  QUALITY_COLORS,
  VITAMIN_COLORS,
  MINERAL_COLORS,
} from "@/lib/sunburst-data";
import { scaleNutrientValues } from "@/lib/serving-size";

type ViewKey = "perServing" | "fullPack";

interface Props {
  nutrition: NutritionData;
  view: ViewKey;
  onViewChange: (v: ViewKey) => void;
  onChipClick?: () => void;
  persona?: string | null;
}

// ── Segment → category mapping ───────────────────────────────────────────────

const INNER_TO_MACRO: Record<string, string> = {
  Fiber: "Carbohydrates", Sugar: "Carbohydrates",
  "Natural Sugar": "Carbohydrates", "Added Sugar": "Carbohydrates",
  Starch: "Carbohydrates", Carbohydrates: "Carbohydrates",
  Protein: "Protein",
  "Trans Fat": "Fat", "Saturated Fat": "Fat",
  "Monounsaturated Fat": "Fat", "Polyunsaturated Fat": "Fat",
  "Unsaturated Fat": "Fat", Fat: "Fat",
  "Vitamin A": "Vitamins", "Vitamin B6": "Vitamins", "Vitamin B12": "Vitamins",
  "Vitamin C": "Vitamins", "Vitamin D": "Vitamins",
  "Vitamin E": "Vitamins", "Vitamin K": "Vitamins", Vitamins: "Vitamins",
  Calcium: "Minerals", Magnesium: "Minerals", Iron: "Minerals",
  Potassium: "Minerals", Zinc: "Minerals", Sodium: "Minerals", Minerals: "Minerals",
};

const DISPLAY_NAME: Record<string, string> = {
  Carbohydrates:         "Carbs",
  "Natural Sugar":       "Natural Sugar",
  "Added Sugar":         "Added Sugar",
  "Unsaturated Fat":     "Unsaturated",
  "Monounsaturated Fat": "Mono Fat",
  "Polyunsaturated Fat": "Poly Fat",
  "Saturated Fat":       "Saturated",
  "Trans Fat":           "Trans Fat",
  "Vitamin A":           "Vit A",
  "Vitamin B6":          "Vit B6",
  "Vitamin B12":         "Vit B12",
  "Vitamin C":           "Vit C",
  "Vitamin D":           "Vit D",
  "Vitamin E":           "Vit E",
  "Vitamin K":           "Vit K",
};

const MACRO_COLOR: Record<string, string> = {
  Carbohydrates: "#f59e0b",
  Protein:       "#22c55e",
  Fat:           "#64748b",
  Vitamins:      VITAMIN_COLORS.outer,
  Minerals:      MINERAL_COLORS.outer,
};

const CATEGORY_LABEL: Record<string, string> = {
  Carbohydrates: "Carbohydrates",
  Protein:       "Protein",
  Fat:           "Fats",
  Vitamins:      "Vitamins",
  Minerals:      "Minerals",
};

const CATEGORY_ICON: Record<string, string> = {
  Carbohydrates: "bakery_dining",
  Protein:       "fitness_center",
  Fat:           "water_drop",
  Vitamins:      "sunny",
  Minerals:      "diamond",
};

const CATEGORY_BG: Record<string, string> = {
  Carbohydrates: "#fffbeb",
  Protein:       "#f0fdf4",
  Fat:           "#f8fafc",
  Vitamins:      "#faf5ff",
  Minerals:      "#f0fdfa",
};

const CATEGORY_ORDER = ["Carbohydrates", "Protein", "Fat", "Vitamins", "Minerals"];

// Sub-nutrient colors — synced with bar chart (sunburst-data.ts)
const SUB_COLOR: Record<string, string> = {
  // Carbs family
  Fiber:               QUALITY_COLORS.fiber,        // #fde68a
  "Natural Sugar":     QUALITY_COLORS.naturalSugar, // #fb923c
  Sugar:               QUALITY_COLORS.naturalSugar, // #fb923c
  "Added Sugar":       QUALITY_COLORS.addedSugar,   // #ef4444
  Starch:              QUALITY_COLORS.starch,        // #fbbf24
  // Protein
  Protein:             QUALITY_COLORS.protein,       // #22c55e
  // Fat family
  "Saturated Fat":     QUALITY_COLORS.sat,           // #334155
  "Trans Fat":         QUALITY_COLORS.trans,         // #0f172a
  "Monounsaturated":   QUALITY_COLORS.monoSat,       // #475569
  "Polyunsaturated":   QUALITY_COLORS.polySat,       // #64748b
  "Unsaturated Fat":   QUALITY_COLORS.unsat,         // #94a3b8
  "Total Fat":         QUALITY_COLORS.unsat,         // #94a3b8
  // Vitamins — purple family
  "Vitamin A":         VITAMIN_COLORS.high,          // #a78bfa
  "Vitamin B6":        VITAMIN_COLORS.high,
  "Vitamin B12":       VITAMIN_COLORS.mid,           // #c4b5fd
  "Vitamin C":         VITAMIN_COLORS.high,
  "Vitamin D":         VITAMIN_COLORS.mid,
  "Vitamin E":         VITAMIN_COLORS.mid,
  "Vitamin K":         VITAMIN_COLORS.low,           // #ddd6fe
  // Minerals — teal family
  Sodium:              MINERAL_COLORS.high,          // #2dd4bf
  Calcium:             MINERAL_COLORS.high,
  Iron:                MINERAL_COLORS.mid,           // #5eead4
  Magnesium:           MINERAL_COLORS.mid,
  Potassium:           MINERAL_COLORS.low,           // #99f6e4
  Zinc:                MINERAL_COLORS.low,
};

// ── Daily reference values ────────────────────────────────────────────────────

type DailyRef = Partial<Record<keyof NutrientValues, number>>;

const DAILY_REF_ADULT: DailyRef = {
  total_fat_g: 70, saturated_fat_g: 20, sodium_mg: 2000, total_carbs_g: 275,
  fiber_g: 28, total_sugar_g: 25, added_sugar_g: 25, protein_g: 50,
  vitamin_a_mcg: 900, vitamin_b6_mg: 1.7, vitamin_b12_mcg: 2.4, vitamin_c_mg: 90,
  vitamin_d_mcg: 20, vitamin_e_mg: 15, vitamin_k_mcg: 120, calcium_mg: 1300,
  iron_mg: 18, magnesium_mg: 420, potassium_mg: 4700, zinc_mg: 11,
};

const DAILY_REF_KIDS: DailyRef = {
  ...DAILY_REF_ADULT,
  total_fat_g: 50, saturated_fat_g: 15, sodium_mg: 1500,
  total_sugar_g: 20, added_sugar_g: 20, fiber_g: 18,
};

// ── Groups ────────────────────────────────────────────────────────────────────

interface MacroGroup {
  name: string; value: number; fill: string; children: SunburstSegment[];
}

function buildGroups(outer: SunburstSegment[], inner: SunburstSegment[]): MacroGroup[] {
  return outer.map((macro) => ({
    name: macro.name, value: macro.value, fill: macro.fill,
    children: inner.filter((s) => INNER_TO_MACRO[s.name] === macro.name),
  }));
}

// ── Combined bar ──────────────────────────────────────────────────────────────

function CombinedBar({ groups, selected }: { groups: MacroGroup[]; selected: string | null }) {
  const activeGroups = groups.filter((g) => g.value > 0);
  const total = activeGroups.reduce((s, g) => s + g.value, 0);
  if (total === 0) return null;

  return (
    <div>
      <div className="flex h-8 sm:h-10 rounded-xl overflow-hidden" style={{ gap: 3 }}>
        {activeGroups.map((group) => {
          const groupPct = (group.value / total) * 100;
          const items = group.children.length > 0
            ? group.children
            : [{ name: group.name, value: group.value, fill: group.fill, unit: "g" }];
          const subTotal = items.reduce((s, c) => s + c.value, 0);
          const dimmed = selected != null && group.name !== selected;

          return (
            <div
              key={group.name}
              className="flex overflow-hidden flex-shrink-0 transition-opacity duration-200"
              style={{ width: `${groupPct}%`, gap: 1, minWidth: 8, opacity: dimmed ? 0.25 : 1 }}
            >
              {items.map((child) => {
                const subPct = subTotal > 0 ? (child.value / subTotal) * 100 : 100 / items.length;
                const label = DISPLAY_NAME[child.name] ?? child.name;
                return (
                  <div
                    key={child.name}
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ width: `${subPct}%`, backgroundColor: child.fill, minWidth: 3 }}
                    title={`${label}: ${child.unit === "g" ? child.value.toFixed(1) + "g" : child.name}`}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex mt-1.5" style={{ gap: 3 }}>
        {activeGroups.map((group) => {
          const groupPct = (group.value / total) * 100;
          const dimmed = selected != null && group.name !== selected;
          return (
            <div key={group.name} className="flex justify-center overflow-hidden flex-shrink-0 transition-opacity duration-200" style={{ width: `${groupPct}%`, minWidth: 8, opacity: dimmed ? 0.35 : 1 }}>
              <span className="text-[9px] font-bold uppercase tracking-wide truncate" style={{ color: MACRO_COLOR[group.name] }}>
                {CATEGORY_LABEL[group.name]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Daily intake sub-nutrient builders ────────────────────────────────────────

interface ComputedSub {
  name: string; value: number; unit: string; ref: number | null; pct: number | null; isTransFat: boolean;
}

function buildCarbsSubs(values: NutrientValues, dailyRef: DailyRef): ComputedSub[] {
  const carbs = values.total_carbs_g ?? 0;
  if (carbs <= 0) return [];

  const fiber = Math.min(Math.max(values.fiber_g ?? 0, 0), carbs);
  const totalSugar = Math.min(Math.max(values.total_sugar_g ?? 0, 0), carbs - fiber);
  const starch = Math.max(carbs - fiber - totalSugar, 0);

  const hasAddedSugar = (values.added_sugar_g ?? 0) > 0;
  const addedSugar = hasAddedSugar ? Math.min(Math.max(values.added_sugar_g ?? 0, 0), totalSugar) : 0;
  const naturalSugar = totalSugar - addedSugar;

  const sugarRef = dailyRef.total_sugar_g ?? null;
  const fiberRef = dailyRef.fiber_g ?? null;

  const subs: ComputedSub[] = [];
  if (fiber > 0.01) subs.push({ name: "Fiber", value: fiber, unit: "g", ref: fiberRef, pct: fiberRef ? (fiber / fiberRef) * 100 : null, isTransFat: false });
  if (hasAddedSugar) {
    if (naturalSugar > 0.01) subs.push({ name: "Natural Sugar", value: naturalSugar, unit: "g", ref: sugarRef, pct: sugarRef ? (naturalSugar / sugarRef) * 100 : null, isTransFat: false });
    if (addedSugar > 0.01) subs.push({ name: "Added Sugar", value: addedSugar, unit: "g", ref: dailyRef.added_sugar_g ?? sugarRef, pct: (dailyRef.added_sugar_g ?? sugarRef) ? (addedSugar / (dailyRef.added_sugar_g ?? sugarRef!)) * 100 : null, isTransFat: false });
  } else if (totalSugar > 0.01) {
    subs.push({ name: "Sugar", value: totalSugar, unit: "g", ref: sugarRef, pct: sugarRef ? (totalSugar / sugarRef) * 100 : null, isTransFat: false });
  }
  if (starch > 0.01) subs.push({ name: "Starch", value: starch, unit: "g", ref: null, pct: null, isTransFat: false });
  return subs;
}

function buildFatSubs(values: NutrientValues, dailyRef: DailyRef): ComputedSub[] {
  const fat = values.total_fat_g ?? 0;
  if (fat <= 0) return [];

  const sat = Math.min(Math.max(values.saturated_fat_g ?? 0, 0), fat);
  const trans = Math.min(Math.max(values.trans_fat_g ?? 0, 0), fat - sat);
  const mono = Math.min(Math.max(values.monounsaturated_fat_g ?? 0, 0), fat - sat - trans);
  const poly = Math.min(Math.max(values.polyunsaturated_fat_g ?? 0, 0), fat - sat - trans - mono);
  const hasMono = (values.monounsaturated_fat_g ?? 0) > 0;
  const hasPoly = (values.polyunsaturated_fat_g ?? 0) > 0;
  const unsat = (!hasMono && !hasPoly) ? Math.max(fat - sat - trans, 0) : 0;

  const subs: ComputedSub[] = [];
  const satRef = dailyRef.saturated_fat_g ?? null;
  const fatRef = dailyRef.total_fat_g ?? null;

  if (sat > 0.01) subs.push({ name: "Saturated Fat", value: sat, unit: "g", ref: satRef, pct: satRef ? (sat / satRef) * 100 : null, isTransFat: false });
  if (trans > 0.01) subs.push({ name: "Trans Fat", value: trans, unit: "g", ref: null, pct: null, isTransFat: true });
  if (hasMono && mono > 0.01) subs.push({ name: "Monounsaturated", value: mono, unit: "g", ref: null, pct: null, isTransFat: false });
  if (hasPoly && poly > 0.01) subs.push({ name: "Polyunsaturated", value: poly, unit: "g", ref: null, pct: null, isTransFat: false });
  if (!hasMono && !hasPoly && unsat > 0.01) subs.push({ name: "Unsaturated Fat", value: unsat, unit: "g", ref: null, pct: null, isTransFat: false });
  if (subs.length === 0) subs.push({ name: "Total Fat", value: fat, unit: "g", ref: fatRef, pct: fatRef ? (fat / fatRef) * 100 : null, isTransFat: false });
  return subs;
}

interface FieldSub { name: string; field: keyof NutrientValues; unit: string; }

const VITAMIN_SUBS: FieldSub[] = [
  { name: "Vitamin A", field: "vitamin_a_mcg", unit: "mcg" }, { name: "Vitamin B6", field: "vitamin_b6_mg", unit: "mg" },
  { name: "Vitamin B12", field: "vitamin_b12_mcg", unit: "mcg" }, { name: "Vitamin C", field: "vitamin_c_mg", unit: "mg" },
  { name: "Vitamin D", field: "vitamin_d_mcg", unit: "mcg" }, { name: "Vitamin E", field: "vitamin_e_mg", unit: "mg" },
  { name: "Vitamin K", field: "vitamin_k_mcg", unit: "mcg" },
];

const MINERAL_SUBS: FieldSub[] = [
  { name: "Sodium", field: "sodium_mg", unit: "mg" }, { name: "Calcium", field: "calcium_mg", unit: "mg" },
  { name: "Iron", field: "iron_mg", unit: "mg" }, { name: "Magnesium", field: "magnesium_mg", unit: "mg" },
  { name: "Potassium", field: "potassium_mg", unit: "mg" }, { name: "Zinc", field: "zinc_mg", unit: "mg" },
];

function buildFieldSubs(defs: FieldSub[], values: NutrientValues, dailyRef: DailyRef): ComputedSub[] {
  return defs
    .map((d) => {
      const value = values[d.field] as number | null;
      if (value == null) return null;
      const ref = (dailyRef[d.field] as number | undefined) ?? null;
      return { name: d.name, value, unit: d.unit, ref, pct: ref ? (value / ref) * 100 : null, isTransFat: false };
    })
    .filter((s): s is ComputedSub => s !== null);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatVal(value: number, unit: string): string {
  if (unit === "g") return `${value.toFixed(1)}g`;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;
}

// Categories where higher %DV is positive (green = good)
const POSITIVE_CATEGORIES = new Set(["Vitamins", "Minerals", "Protein"]);

function pctColor(pct: number, category?: string): string {
  if (category && POSITIVE_CATEGORIES.has(category)) {
    // For vitamins/minerals/protein: higher is better
    if (pct > 50) return "#22c55e";
    if (pct > 20) return "#f59e0b";
    return "#94a3b8";
  }
  if (pct > 50) return "#ef4444";
  if (pct > 20) return "#f59e0b";
  return "#22c55e";
}

function pctLabel(pct: number, category?: string): string {
  if (pct === 0) return "ABSENT";
  if (category && POSITIVE_CATEGORIES.has(category)) {
    if (pct >= 100) return "RICH";
    if (pct > 50) return "GOOD";
    if (pct > 20) return "MODERATE";
    return "LOW";
  }
  if (pct >= 100) return "EXCESS";
  if (pct > 50) return "HIGH";
  if (pct > 20) return "MODERATE";
  return "LOW";
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ComputedCategory {
  catName: string; dominantPct: number; dominantName: string; activeSubs: ComputedSub[];
}

export default function NutrientQualityMap({ nutrition, view, onViewChange, onChipClick, persona }: Props) {
  const packMultiplier = nutrition.servings_per_pack ?? 1;
  const values: NutrientValues =
    view === "fullPack"
      ? scaleNutrientValues(nutrition.per_serving, packMultiplier)
      : nutrition.per_serving;
  const fullPackLabel = nutrition.full_pack_serving_label ?? `Full Pack (${packMultiplier} servings)`;
  const dvPercent = nutrition.dv_percent;

  const dailyRef = persona === "kids" ? DAILY_REF_KIDS : DAILY_REF_ADULT;
  const personaLabel = persona === "kids" ? "Child" : "Adult";

  const outerData = buildOuterRingData(values, dvPercent);
  const innerData = buildInnerRingData(values, dvPercent);
  const groups = buildGroups(outerData, innerData);

  // Build daily intake data for all 5 categories
  const categoryData: ComputedCategory[] = useMemo(() =>
    CATEGORY_ORDER.map((catName) => {
      let activeSubs: ComputedSub[];
      if (catName === "Carbohydrates") activeSubs = buildCarbsSubs(values, dailyRef);
      else if (catName === "Fat") activeSubs = buildFatSubs(values, dailyRef);
      else if (catName === "Protein") activeSubs = buildFieldSubs([{ name: "Protein", field: "protein_g", unit: "g" }], values, dailyRef);
      else if (catName === "Vitamins") activeSubs = buildFieldSubs(VITAMIN_SUBS, values, dailyRef);
      else activeSubs = buildFieldSubs(MINERAL_SUBS, values, dailyRef);

      let dominantPct = 0;
      let dominantName = catName;
      for (const sub of activeSubs) {
        if (sub.pct != null && sub.pct > dominantPct) { dominantPct = sub.pct; dominantName = sub.name; }
      }
      return { catName, dominantPct, dominantName, activeSubs };
    }),
  [values, dailyRef]);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  if (outerData.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <h3 className="font-bold text-slate-900 text-sm mb-1">Nutrient Map & Daily Intake</h3>
        <p className="text-xs text-slate-400">Nutritional data not available.</p>
      </div>
    );
  }

  const activeData = categoryData.find((c) => c.catName === selectedCategory) ?? null;

  // Fixed height: each sub-row ≈ 28px (text + bar + gap), header ≈ 30px, padding 24px
  const maxSubs = Math.max(...categoryData.map((c) => c.activeSubs.length), 1);
  const panelMinHeight = 30 + maxSubs * 28 + 24;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">

      {/* Header + toggle */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900 text-sm tracking-tight">Nutrient Map & Daily Intake</h3>
          <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
            {view === "perServing" ? "Per Serving" : fullPackLabel} · {personaLabel} daily limits
          </p>
        </div>
        <div className="flex gap-0.5 flex-shrink-0 p-0.5 bg-slate-100 rounded-full">
          {(["perServing", "fullPack"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className="px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-150"
              style={
                view === v
                  ? { backgroundColor: "#fff", color: "#0f172a", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }
                  : { backgroundColor: "transparent", color: "#94a3b8" }
              }
            >
              {v === "perServing" ? "Per Serving" : "Full Pack"}
            </button>
          ))}
        </div>
      </div>

      {/* Combined bar */}
      <CombinedBar groups={groups} selected={selectedCategory} />

      {/* Category chips — horizontal row */}
      <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar">
        {categoryData.map((cat) => {
          const isActive = selectedCategory === cat.catName;
          const isAbsent = cat.activeSubs.length === 0;
          const color = isAbsent ? "#94a3b8" : pctColor(cat.dominantPct, cat.catName);
          const catColor = MACRO_COLOR[cat.catName];

          return (
            <button
              key={cat.catName}
              onClick={() => { setSelectedCategory(cat.catName === selectedCategory ? null : cat.catName); onChipClick?.(); }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 flex-shrink-0 transition-all duration-150"
              style={{
                backgroundColor: isActive ? catColor : isAbsent ? "#f8fafc" : CATEGORY_BG[cat.catName],
                border: `1.5px solid ${isActive ? catColor : isAbsent ? "#e2e8f0" : catColor + "30"}`,
                opacity: isAbsent && !isActive ? 0.6 : 1,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "14px", color: isActive ? "#fff" : catColor }}
              >
                {CATEGORY_ICON[cat.catName]}
              </span>
              <span
                className="text-[10px] font-bold"
                style={{ color: isActive ? "#fff" : catColor }}
              >
                {CATEGORY_LABEL[cat.catName]}
              </span>
              <span
                className="text-[11px] font-extrabold tabular-nums"
                style={{ color: isActive ? "#fff" : isAbsent ? "#94a3b8" : "#1e293b" }}
              >
                {isAbsent ? "—" : `${Math.round(cat.dominantPct)}%`}
              </span>
              <span
                className="text-[7px] font-bold px-1 py-0.5 rounded-full leading-none"
                style={{
                  backgroundColor: isActive ? "rgba(255,255,255,0.25)" : `${color}18`,
                  color: isActive ? "#fff" : color,
                }}
              >
                {isAbsent ? "ABSENT" : pctLabel(cat.dominantPct, cat.catName)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Breakdown panel — fixed height to prevent layout shift */}
      {activeData && (
        <div className="mt-3" style={{ minHeight: panelMinHeight }}>
          {activeData.activeSubs.length > 0 ? (
            <div
              className="rounded-xl p-3"
              style={{ backgroundColor: CATEGORY_BG[activeData.catName], border: `1px solid ${MACRO_COLOR[activeData.catName]}25`, minHeight: panelMinHeight }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "15px", color: MACRO_COLOR[activeData.catName] }}
                >
                  {CATEGORY_ICON[activeData.catName]}
                </span>
                <h4 className="text-xs font-bold" style={{ color: MACRO_COLOR[activeData.catName] }}>
                  {CATEGORY_LABEL[activeData.catName]} Breakdown
                </h4>
              </div>

              <div className="space-y-2">
                {activeData.activeSubs.map((sub) => {
                  const subColor = SUB_COLOR[sub.name] ?? MACRO_COLOR[activeData.catName];
                  return (
                    <div key={sub.name}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: subColor }}
                          />
                          <span className="text-[11px] font-semibold text-slate-700">{sub.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-800 tabular-nums">
                            {formatVal(sub.value, sub.unit)}
                          </span>
                          {sub.isTransFat ? (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">
                              Limit
                            </span>
                          ) : sub.pct != null ? (
                            <span
                              className="text-[10px] font-bold tabular-nums min-w-[36px] text-right"
                              style={{ color: pctColor(sub.pct, activeData.catName) }}
                            >
                              {Math.round(sub.pct)}%
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-300 min-w-[36px] text-right">—</span>
                          )}
                        </div>
                      </div>
                      {sub.pct != null && !sub.isTransFat && (
                        <div className="w-full h-1 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(sub.pct, 100)}%`, backgroundColor: subColor }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              className="rounded-xl p-3 flex items-center gap-2"
              style={{ backgroundColor: CATEGORY_BG[activeData.catName], border: `1px solid ${MACRO_COLOR[activeData.catName]}25`, minHeight: panelMinHeight }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "16px", color: MACRO_COLOR[activeData.catName], opacity: 0.4 }}
              >
                {CATEGORY_ICON[activeData.catName]}
              </span>
              <p className="text-xs font-semibold" style={{ color: MACRO_COLOR[activeData.catName], opacity: 0.6 }}>
                {CATEGORY_LABEL[activeData.catName]} not declared on this label
              </p>
            </div>
          )}
        </div>
      )}

      <p className="text-[9px] text-slate-300 mt-2 px-0.5">
        Based on WHO-aligned {personaLabel.toLowerCase()} daily reference values · not medical advice
      </p>
    </div>
  );
}
