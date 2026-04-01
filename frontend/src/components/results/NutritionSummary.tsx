"use client";

import { NutritionData, NutrientValues } from "@/lib/types";

// Daily limits (WHO-aligned, persona-aware)
const DAILY_LIMITS = {
  kids: {
    total_sugar_g: 20,
    sodium_mg: 1500,
    total_fat_g: 50,
    saturated_fat_g: 15,
    trans_fat_g: 0.1,
    fiber_g: 18,
    protein_g: 50,
    calcium_mg: 1000,
    iron_mg: 8,
    vitamin_d_mcg: 15,
    vitamin_c_mg: 45,
  },
  clean_eating: {
    total_sugar_g: 25,
    sodium_mg: 2000,
    total_fat_g: 70,
    saturated_fat_g: 20,
    trans_fat_g: 0.1,
    fiber_g: 28,
    protein_g: 50,
    calcium_mg: 1000,
    iron_mg: 18,
    vitamin_d_mcg: 15,
    vitamin_c_mg: 90,
  },
};

interface Verdict {
  label?: "not_recommended" | "moderately_recommended" | "highly_recommended";
  summary: string;
  highlights?: Array<{ nutrient: string; reason: string }>;
}

interface AnalysisSignals {
  sugar?: { count: number; ingredients: string[] };
  sodium?: { count: number; ingredients: string[] };
  processed_fat?: { count: number; ingredients: string[] };
}

interface Props {
  nutrition: NutritionData;
  persona: string | null;
  verdict?: Verdict | null;
  signals?: AnalysisSignals | null;
  positiveSignals?: Array<{ signal: string; reason: string }> | null;
  watchlist?: Array<{ watchlist_category: string; ingredients: string[]; reason: string }> | null;
  isCombined?: boolean;
}

interface NutrientCard {
  category: string;
  pct: number;
  type: "good" | "bad";
  status: "excess" | "high" | "sufficient";
  subItems?: Array<{ name: string; pct: number }>;
}

export default function NutritionSummary({
  nutrition,
  persona,
  verdict,
  signals,
  positiveSignals,
  watchlist,
  isCombined
}: Props) {
  const personaKey = persona === "kids" ? "kids" : "clean_eating";
  const limits = DAILY_LIMITS[personaKey];
  const values: NutrientValues = nutrition.per_serving;
  const ctxLabel = nutrition.default_serving_label ?? nutrition.serving_size ?? "1 serving";

  // Verdict badge colors
  const verdictColors: Record<string, { bg: string; color: string; label: string }> = {
    not_recommended: { bg: "#fef2f2", color: "#dc2626", label: "Not Recommended" },
    moderately_recommended: { bg: "#fef3c7", color: "#d97706", label: "Occasionally OK" },
    highly_recommended: { bg: "#f0fdf4", color: "#16a34a", label: "Recommended" },
  };

  const verdictStyle = verdict?.label ? verdictColors[verdict.label] : null;

  // Build nutrient cards grouped by category
  const nutrientCards: NutrientCard[] = [];

  // BAD NUTRIENTS - grouped by category
  const sugar = values.total_sugar_g ? (values.total_sugar_g / limits.total_sugar_g) * 100 : 0;
  const sodium = values.sodium_mg ? (values.sodium_mg / limits.sodium_mg) * 100 : 0;
  const fatTotal = values.total_fat_g ? (values.total_fat_g / limits.total_fat_g) * 100 : 0;
  const fatSat = values.saturated_fat_g ? (values.saturated_fat_g / limits.saturated_fat_g) * 100 : 0;
  const fatTrans = values.trans_fat_g ? (values.trans_fat_g / limits.trans_fat_g) * 100 : 0;

  // Sugar
  if (sugar >= 50) {
    nutrientCards.push({
      category: "Sugar",
      pct: sugar,
      type: "bad",
      status: sugar > 100 ? "excess" : "high",
    });
  }

  // Sodium
  if (sodium >= 50) {
    nutrientCards.push({
      category: "Sodium",
      pct: sodium,
      type: "bad",
      status: sodium > 100 ? "excess" : "high",
    });
  }

  // Fat (combined)
  if (fatTotal >= 50) {
    const subItems = [];
    if (values.saturated_fat_g) subItems.push({ name: "Sat", pct: fatSat });
    if (values.trans_fat_g) subItems.push({ name: "Trans", pct: fatTrans });
    nutrientCards.push({
      category: "Fat",
      pct: fatTotal,
      type: "bad",
      status: fatTotal > 100 ? "excess" : "high",
      subItems: subItems.length > 0 ? subItems : undefined,
    });
  }

  // GOOD NUTRIENTS
  const fiber = values.fiber_g ? (values.fiber_g / limits.fiber_g) * 100 : 0;
  const protein = values.protein_g ? (values.protein_g / limits.protein_g) * 100 : 0;
  const calcium = values.calcium_mg ? (values.calcium_mg / limits.calcium_mg) * 100 : 0;
  const iron = values.iron_mg ? (values.iron_mg / limits.iron_mg) * 100 : 0;

  if (fiber >= 50) {
    nutrientCards.push({
      category: "Fiber",
      pct: fiber,
      type: "good",
      status: "sufficient",
    });
  }

  if (protein >= 50) {
    nutrientCards.push({
      category: "Protein",
      pct: protein,
      type: "good",
      status: "sufficient",
    });
  }

  if (calcium >= 50) {
    nutrientCards.push({
      category: "Calcium",
      pct: calcium,
      type: "good",
      status: "sufficient",
    });
  }

  if (iron >= 50) {
    nutrientCards.push({
      category: "Iron",
      pct: iron,
      type: "good",
      status: "sufficient",
    });
  }

  // VITAMINS - always show if present
  const vitamins: NutrientCard[] = [];
  const vitaminData = [
    { key: "vitamin_a_mcg", name: "Vitamin A", limit: limits.vitamin_a_mcg || 900 },
    { key: "vitamin_c_mg", name: "Vitamin C", limit: limits.vitamin_c_mg || 90 },
    { key: "vitamin_d_mcg", name: "Vitamin D", limit: limits.vitamin_d_mcg || 15 },
  ];

  vitaminData.forEach(({ key, name, limit }) => {
    const val = values[key as keyof NutrientValues] as number | null;
    if (val && val > 0) {
      const pct = (val / limit) * 100;
      vitamins.push({
        category: name,
        pct,
        type: "good",
        status: "sufficient",
      });
    }
  });

  // Sort bad nutrients (worst first), take top 3
  const badCards = nutrientCards.filter((c) => c.type === "bad").sort((a, b) => b.pct - a.pct).slice(0, 3);
  const goodCards = [...nutrientCards.filter((c) => c.type === "good"), ...vitamins];

  const allCards = [...badCards, ...goodCards];

  // Only show if there are highlighted nutrients
  if (allCards.length === 0 && !verdict) return null;

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      {allCards.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          {/* Header + Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 mb-3 sm:mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm">Summary</h3>
              {verdict && verdictStyle && (
                <span
                  className="text-xs font-extrabold px-2.5 py-1 rounded-full tracking-wide"
                  style={{ backgroundColor: verdictStyle.color, color: "#fff" }}
                >
                  {verdictStyle.label}
                </span>
              )}
            </div>
          </div>

          {/* Three-Column Card Layout - Responsive */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {/* CAUTION CARD */}
            {(() => {
              // Build unified caution bullet list (deduplicated)
              const cautionItems: Array<{ label: string; pct?: number }> = [];
              const seen = new Set<string>();

              // Add nutrition bad nutrients
              badCards.forEach((card) => {
                const key = card.category.toLowerCase();
                seen.add(key);
                cautionItems.push({ label: `High ${card.category}`, pct: Math.round(card.pct) });
              });

              // Add ingredient signals (deduplicate against nutrition)
              if (isCombined && signals) {
                if (signals.sugar?.count > 0 && !seen.has("sugar")) {
                  cautionItems.push({ label: `High Sugar (${signals.sugar.count} sources)` });
                }
                if (signals.sodium?.count > 0 && !seen.has("sodium")) {
                  cautionItems.push({ label: `High Sodium (${signals.sodium.count} sources)` });
                }
                if (signals.processed_fat?.count > 1 && !seen.has("fat")) {
                  cautionItems.push({ label: `Multiple Fat Sources (${signals.processed_fat.ingredients.join(", ")})` });
                }
              }

              // Add watchlist items (deduplicate against nutrition)
              if (isCombined && watchlist) {
                watchlist.forEach((item) => {
                  const key = item.watchlist_category.toLowerCase();
                  if (key.includes("sugar") && seen.has("sugar")) return;
                  if (key.includes("sodium") && seen.has("sodium")) return;
                  if (key.includes("fat") && seen.has("fat")) return;
                  const label = item.watchlist_category
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase());
                  cautionItems.push({ label });
                });
              }

              return cautionItems.length > 0 ? (
                <div className="rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-orange-200" style={{ backgroundColor: "#fff7ed" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-sm font-bold text-slate-900">Caution</p>
                    <span className="text-[7px] font-extrabold px-1.5 py-0.5 rounded-full tracking-wide bg-orange-600 text-white">
                      HIGH
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {cautionItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-slate-800">• {item.label}</p>
                        {item.pct != null && (
                          <span className="text-[10px] font-bold text-orange-600">{item.pct}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-slate-200" style={{ backgroundColor: "#f8fafc" }}>
                  <p className="text-[9px] text-slate-400 text-center font-medium">No concerns</p>
                </div>
              );
            })()}

            {/* POSITIVE CARD */}
            {(() => {
              // Build unified positive bullet list
              const positiveItems: Array<{ label: string; pct?: number }> = [];

              goodCards.forEach((card) => {
                positiveItems.push({ label: card.category, pct: Math.round(card.pct) });
              });

              if (isCombined && positiveSignals) {
                positiveSignals.slice(0, 3).forEach((sig) => {
                  positiveItems.push({ label: sig.reason });
                });
              }

              return positiveItems.length > 0 ? (
                <div className="rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-green-200" style={{ backgroundColor: "#f0fdf4" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-sm font-bold text-slate-900">Positive</p>
                    <span className="text-[7px] font-extrabold px-1.5 py-0.5 rounded-full tracking-wide bg-green-600 text-white">
                      POSITIVE
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {positiveItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-slate-800">• {item.label}</p>
                        {item.pct != null && (
                          <span className="text-[10px] font-bold text-green-600">{item.pct}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-slate-200" style={{ backgroundColor: "#f8fafc" }}>
                  <p className="text-[9px] text-slate-400 text-center font-medium">No positives</p>
                </div>
              );
            })()}

            {/* ENERGY CARD */}
            {(() => {
              const cal = values.calories ?? 0;
              if (cal <= 0) return null;

              // Activity equivalence using standard MET values — persona-aware
              const bodyWeight = personaKey === "kids" ? 25 : 70;
              const walkMin = Math.round(cal / (3.5 * bodyWeight / 60));
              const runMin = Math.round(cal / (10 * bodyWeight / 60));
              const cycleMin = Math.round(cal / (7 * bodyWeight / 60));

              // Persona-aware activity labels
              const activities = personaKey === "kids"
                ? [
                    { emoji: "🏃", label: "playing outdoors", min: walkMin },
                    { emoji: "🚴", label: "cycling", min: cycleMin },
                    { emoji: "🏊", label: "swimming", min: runMin },
                  ]
                : [
                    { emoji: "🚶", label: "walking", min: walkMin },
                    { emoji: "🏃", label: "running", min: runMin },
                    { emoji: "🚴", label: "cycling", min: cycleMin },
                  ];

              return (
                <div className="rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-violet-200" style={{ backgroundColor: "#f5f3ff" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-sm font-bold text-slate-900">Energy</p>
                  </div>

                  <div className="flex items-baseline gap-1 mb-2.5">
                    <span className="text-2xl font-extrabold" style={{ color: "#7c3aed" }}>
                      {Math.round(cal)}
                    </span>
                    <span className="text-xs font-bold text-slate-500">kcal</span>
                    <span className="text-[10px] text-slate-400 ml-1">per {ctxLabel}</span>
                  </div>

                  <p className="text-[10px] text-slate-500 font-medium mb-2">
                    To burn this, you would need:
                  </p>

                  <div className="space-y-1.5">
                    {activities.map((act) => (
                      <div key={act.label} className="flex items-center gap-2">
                        <span className="text-sm leading-none">{act.emoji}</span>
                        <p className="text-[10px] font-semibold text-slate-800">
                          <span style={{ color: "#7c3aed" }}>{act.min} min</span> of {act.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
