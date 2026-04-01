import { NutrientValues } from "./types";

export interface SunburstSegment {
  name: string;
  value: number;
  fill: string;
  unit: string;
  isPlaceholder?: boolean;
  dvPct?: number | null;
}

// ── Color palettes ───────────────────────────────────────────────────────────

// Carbs: amber family (light=good → dark=concern)
// Protein: green family
// Fat: slate family (light=good → dark=concern)
export const MACRO_COLORS = {
  carbs:   "#f59e0b",
  protein: "#22c55e",
  fat:     "#64748b",
};

export const QUALITY_COLORS = {
  // Carbs family — yellow → orange → red as quality worsens
  fiber:        "#fde68a",  // amber-200   — most positive (light yellow)
  starch:       "#fbbf24",  // amber-400   — neutral       (bright amber)
  naturalSugar: "#fb923c",  // orange-400  — moderate      (clear orange)
  addedSugar:   "#ef4444",  // red-500     — limit         (clear red)
  // Protein family — green
  protein: "#22c55e",
  // Fat family — slate, light → dark as quality worsens
  unsat:   "#94a3b8",  // slate-400  — good (generic unsaturated)
  polySat: "#64748b",  // slate-500  — good (polyunsaturated)
  monoSat: "#475569",  // slate-600  — good (monounsaturated)
  sat:     "#334155",  // slate-700  — limit (saturated)
  trans:   "#0f172a",  // slate-950  — avoid (trans)
};

// Vitamins: purple family
export const VITAMIN_COLORS = {
  outer:       "#8b5cf6",
  high:        "#a78bfa",
  mid:         "#c4b5fd",
  low:         "#ddd6fe",
  placeholder: "#e2e8f0",
};

// Minerals: teal family
export const MINERAL_COLORS = {
  outer:       "#0d9488",
  high:        "#2dd4bf",
  mid:         "#5eead4",
  low:         "#99f6e4",
  placeholder: "#e2e8f0",
};

// ── Vitamin / Mineral field maps ─────────────────────────────────────────────

const VITAMIN_FIELDS: Array<keyof NutrientValues> = [
  "vitamin_a_mcg",
  "vitamin_b6_mg",
  "vitamin_b12_mcg",
  "vitamin_c_mg",
  "vitamin_d_mcg",
  "vitamin_e_mg",
  "vitamin_k_mcg",
];

const VITAMIN_NAMES: Record<string, string> = {
  vitamin_a_mcg:   "Vitamin A",
  vitamin_b6_mg:   "Vitamin B6",
  vitamin_b12_mcg: "Vitamin B12",
  vitamin_c_mg:    "Vitamin C",
  vitamin_d_mcg:   "Vitamin D",
  vitamin_e_mg:    "Vitamin E",
  vitamin_k_mcg:   "Vitamin K",
};

const MINERAL_FIELDS: Array<keyof NutrientValues> = [
  "calcium_mg",
  "magnesium_mg",
  "iron_mg",
  "potassium_mg",
  "zinc_mg",
  "sodium_mg",
];

const MINERAL_NAMES: Record<string, string> = {
  calcium_mg:   "Calcium",
  magnesium_mg: "Magnesium",
  iron_mg:      "Iron",
  potassium_mg: "Potassium",
  zinc_mg:      "Zinc",
  sodium_mg:    "Sodium",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDvColor(
  dvPct: number | null | undefined,
  colors: { high: string; mid: string; low: string }
): string {
  if (dvPct == null) return colors.low;
  if (dvPct > 20)   return colors.high;
  if (dvPct >= 5)   return colors.mid;
  return colors.low;
}

// Scale %DV values down so micronutrients stay visually proportional
// to gram-based macros (e.g. Iron 26%DV should not dwarf Protein 2.1g)
const DV_SCALE  = 0.12;
const DV_MIN    = 0.3;
const DV_MAX    = 2.0;

function scaleDv(dv: number | null): number {
  if (dv == null) return 0.5;
  return Math.min(Math.max(dv * DV_SCALE, DV_MIN), DV_MAX);
}

// ── Vitamin / Mineral inner ring builders ────────────────────────────────────

export function buildVitaminsInnerData(
  values: NutrientValues,
  dvPercent?: Record<string, number | null> | null
): SunburstSegment[] {
  const segments: SunburstSegment[] = [];
  for (const field of VITAMIN_FIELDS) {
    const val = values[field] as number | null;
    const dv  = dvPercent?.[field] ?? null;
    if (val != null || dv != null) {
      segments.push({
        name:  VITAMIN_NAMES[field],
        value: scaleDv(dv),
        fill:  getDvColor(dv, VITAMIN_COLORS),
        unit:  field.endsWith("_mcg") ? "mcg" : "mg",
        dvPct: dv,
      });
    }
  }
  return segments;
}

export function buildMineralsInnerData(
  values: NutrientValues,
  dvPercent?: Record<string, number | null> | null
): SunburstSegment[] {
  const segments: SunburstSegment[] = [];
  for (const field of MINERAL_FIELDS) {
    const val = values[field] as number | null;
    const dv  = dvPercent?.[field] ?? null;
    if (val != null || dv != null) {
      segments.push({
        name:  MINERAL_NAMES[field],
        value: scaleDv(dv),
        fill:  getDvColor(dv, MINERAL_COLORS),
        unit:  "mg",
        dvPct: dv,
      });
    }
  }
  return segments;
}

// ── Outer ring ───────────────────────────────────────────────────────────────

/**
 * Outer ring — up to 5 categories: Carbohydrates, Protein, Fat, Vitamins, Minerals.
 * Only categories with actual data are included — no placeholders.
 * Macros are sized by grams; Vitamins/Minerals by %DV sum (different scales — add legend note in UI).
 */
export function buildOuterRingData(
  values: NutrientValues,
  dvPercent?: Record<string, number | null> | null
): SunburstSegment[] {
  const segments: SunburstSegment[] = [];

  // Carbohydrates — only if data present
  if ((values.total_carbs_g ?? 0) > 0) {
    segments.push({ name: "Carbohydrates", value: values.total_carbs_g!, fill: MACRO_COLORS.carbs, unit: "g" });
  }

  // Protein — only if data present
  if ((values.protein_g ?? 0) > 0) {
    segments.push({ name: "Protein", value: values.protein_g!, fill: MACRO_COLORS.protein, unit: "g" });
  }

  // Fat — only if data present
  if ((values.total_fat_g ?? 0) > 0) {
    segments.push({ name: "Fat", value: values.total_fat_g!, fill: MACRO_COLORS.fat, unit: "g" });
  }

  // Vitamins — outer value = sum of inner segment values; only if at least one vitamin present
  const vitaminInner = buildVitaminsInnerData(values, dvPercent);
  const vitaminValue = vitaminInner.reduce((s, seg) => s + seg.value, 0);
  if (vitaminValue > 0) {
    segments.push({ name: "Vitamins", value: vitaminValue, fill: VITAMIN_COLORS.outer, unit: "%" });
  }

  // Minerals — outer value = sum of inner segment values; only if at least one mineral present
  const mineralInner = buildMineralsInnerData(values, dvPercent);
  const mineralValue = mineralInner.reduce((s, seg) => s + seg.value, 0);
  if (mineralValue > 0) {
    segments.push({ name: "Minerals", value: mineralValue, fill: MINERAL_COLORS.outer, unit: "%" });
  }

  return segments;
}

// ── Inner ring ───────────────────────────────────────────────────────────────

/**
 * Inner ring — quality breakdown per macro + vitamin/mineral sub-segments.
 * Sub-segment values sum to their parent outer segment value for angular alignment.
 */
export function buildInnerRingData(
  values: NutrientValues,
  dvPercent?: Record<string, number | null> | null
): SunburstSegment[] {
  const segments: SunburstSegment[] = [];

  // ── Carbohydrate sub-segments — only if carbs data present ──────────────
  const carbs = values.total_carbs_g ?? 0;
  if (carbs > 0) {
    const fiber      = Math.min(Math.max(values.fiber_g       ?? 0, 0), carbs);
    const totalSugar = Math.min(Math.max(values.total_sugar_g ?? 0, 0), carbs - fiber);
    const starch     = carbs - fiber - totalSugar;

    const hasAddedSugar = (values.added_sugar_g ?? 0) > 0;
    const addedSugar    = hasAddedSugar
      ? Math.min(Math.max(values.added_sugar_g ?? 0, 0), totalSugar)
      : 0;
    const naturalSugar  = totalSugar - addedSugar;

    if (fiber > 0.01) {
      segments.push({ name: "Fiber",         value: fiber,        fill: QUALITY_COLORS.fiber,        unit: "g" });
    }
    if (hasAddedSugar) {
      if (naturalSugar > 0.01) {
        segments.push({ name: "Natural Sugar", value: naturalSugar, fill: QUALITY_COLORS.naturalSugar, unit: "g" });
      }
      if (addedSugar > 0.01) {
        segments.push({ name: "Added Sugar",   value: addedSugar,   fill: QUALITY_COLORS.addedSugar,   unit: "g" });
      }
    } else if (totalSugar > 0.01) {
      segments.push({ name: "Sugar",          value: totalSugar,   fill: QUALITY_COLORS.addedSugar,   unit: "g" });
    }
    if (starch > 0.01) {
      segments.push({ name: "Starch",         value: starch,       fill: QUALITY_COLORS.starch,       unit: "g" });
    }
    // Fallback: no sub-breakdown available, show single Carbohydrates segment
    if (fiber <= 0.01 && totalSugar <= 0.01 && starch <= 0.01) {
      segments.push({ name: "Carbohydrates",  value: carbs,        fill: MACRO_COLORS.carbs,          unit: "g" });
    }
  }

  // ── Protein sub-segment — only if protein data present ─────────────────
  const protein = values.protein_g ?? 0;
  if (protein > 0) {
    segments.push({ name: "Protein", value: protein, fill: QUALITY_COLORS.protein, unit: "g" });
  }

  // ── Fat sub-segments — only if fat data present ───────────────────────
  const fat = values.total_fat_g ?? 0;
  if (fat > 0) {
    const sat   = Math.min(Math.max(values.saturated_fat_g       ?? 0, 0), fat);
    const trans = Math.min(Math.max(values.trans_fat_g           ?? 0, 0), fat - sat);
    const mono  = Math.min(Math.max(values.monounsaturated_fat_g ?? 0, 0), fat - sat - trans);
    const poly  = Math.min(Math.max(values.polyunsaturated_fat_g ?? 0, 0), fat - sat - trans - mono);
    const hasMono = (values.monounsaturated_fat_g ?? 0) > 0;
    const hasPoly = (values.polyunsaturated_fat_g ?? 0) > 0;
    const residual = fat - sat - trans - (hasMono ? mono : 0) - (hasPoly ? poly : 0);
    const unsat = hasMono || hasPoly ? Math.max(residual, 0) : fat - sat - trans;

    if (trans > 0.01) {
      segments.push({ name: "Trans Fat",          value: trans, fill: QUALITY_COLORS.trans,   unit: "g" });
    }
    if (sat > 0.01) {
      segments.push({ name: "Saturated Fat",       value: sat,   fill: QUALITY_COLORS.sat,     unit: "g" });
    }
    if (hasMono && mono > 0.01) {
      segments.push({ name: "Monounsaturated Fat", value: mono,  fill: QUALITY_COLORS.monoSat, unit: "g" });
    }
    if (hasPoly && poly > 0.01) {
      segments.push({ name: "Polyunsaturated Fat", value: poly,  fill: QUALITY_COLORS.polySat, unit: "g" });
    }
    if (!hasMono && !hasPoly && unsat > 0.01) {
      segments.push({ name: "Unsaturated Fat",     value: unsat, fill: QUALITY_COLORS.unsat,   unit: "g" });
    }
    // Fallback: no sub-breakdown available, show single Fat segment
    const anyFatSub = sat + trans + (hasMono ? mono : 0) + (hasPoly ? poly : 0) + ((!hasMono && !hasPoly) ? unsat : 0);
    if (anyFatSub <= 0.01) {
      segments.push({ name: "Fat", value: fat, fill: MACRO_COLORS.fat, unit: "g" });
    }
  }

  // ── Vitamin sub-segments — only present vitamins ──────────────────────
  const vitaminSegs = buildVitaminsInnerData(values, dvPercent);
  segments.push(...vitaminSegs);

  // ── Mineral sub-segments — only present minerals ──────────────────────
  const mineralSegs = buildMineralsInnerData(values, dvPercent);
  segments.push(...mineralSegs);

  return segments;
}

/** Returns the dominant macro name from the outer ring (highest gram value among Carbs/Protein/Fat). */
export function getDominantMacro(outer: SunburstSegment[]): string | null {
  const macros = outer.filter((s) => ["Carbohydrates", "Protein", "Fat"].includes(s.name));
  if (macros.length === 0) return null;
  return macros.reduce((a, b) => (b.value > a.value ? b : a)).name;
}

/**
 * Merges inner ring segments smaller than `threshold` fraction of the total
 * into an "Other" bucket. Applied globally across all inner segments.
 */
export function mergeSmallSegments(
  segments: SunburstSegment[],
  threshold = 0.02
): SunburstSegment[] {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return segments;

  const kept: SunburstSegment[] = [];
  let otherValue = 0;

  for (const seg of segments) {
    if (!seg.isPlaceholder && seg.value / total < threshold) {
      otherValue += seg.value;
    } else {
      kept.push(seg);
    }
  }

  if (otherValue > 0.01) {
    kept.push({ name: "Other", value: otherValue, fill: "#cbd5e1", unit: "" });
  }

  return kept;
}
