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

// ── Inline SVG spoon ──────────────────────────────────────────────────────────

function SpoonSVG({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={color} style={{ opacity, flexShrink: 0 }} aria-hidden="true">
      <ellipse cx="12" cy="7" rx="5" ry="4" />
      <rect x="11" y="11" width="2" height="10" rx="1" />
    </svg>
  );
}

// ── Single spoon + count ──────────────────────────────────────────────────────

function SpoonCount({ tsp, color }: { tsp: number; color: string }) {
  const isEmpty = tsp === 0;
  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <SpoonSVG color={color} opacity={isEmpty ? 0.2 : 1} />
      <span
        className="text-sm font-extrabold tabular-nums leading-none"
        style={{ color, opacity: isEmpty ? 0.35 : 1 }}
      >
        {tsp.toFixed(1)}
      </span>
      <span className="text-[9px] text-slate-400">tsp</span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

type ViewKey = "perServing" | "fullPack";

interface Props {
  productName: string | null;
  ingredientComplexity: AnalysisResult["analysis"]["ingredient_complexity"];
  allergens?: AnalysisResult["analysis"]["allergens"] | null;
  nutrition?: NutritionData | null;
  productType?: string | null;
  nutritionView?: ViewKey;
  durationSeconds?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductHeader({
  productName, nutrition, productType, allergens,
  nutritionView = "perServing", durationSeconds,
}: Props) {
  const baseValues = nutrition?.per_serving ?? null;
  const values: NutrientValues | null =
    nutritionView === "fullPack" && baseValues
      ? scaleNutrientValues(baseValues, nutrition?.servings_per_pack ?? 1)
      : baseValues;

  const sugarG   = values?.total_sugar_g ?? 0;
  const fatG     = values?.total_fat_g   ?? 0;
  const sodiumMg = values?.sodium_mg     ?? 0;

  const sugarTsp = sugarG / TSP_SUGAR_G;
  const fatTsp   = fatG   / TSP_FAT_G;
  const saltTsp  = (sodiumMg / SODIUM_PER_SALT_G) / TSP_SALT_G;

  const isHighSodium = nutrition?.flags.high_sodium ?? false;
  const showSpoon    = nutrition != null;

  // Remove "Probable: " prefix from product name if present
  const cleanProductName = productName?.replace(/^Probable:\s*/i, "") ?? null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex items-stretch">

        {/* Left — product name */}
        <div className="flex-1 px-4 py-3 flex flex-col justify-center min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#ec5b13" }}>
            Analysis Result
          </p>
          <h2 className="text-2xl font-extrabold text-slate-900 leading-snug line-clamp-3">
            {cleanProductName ?? "Unknown Product"}
          </h2>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontSize: "13px", color: "#a78bfa" }}>auto_awesome</span>
              <span className="text-[10px] font-semibold" style={{ color: "#a78bfa" }}>AI derived</span>
            </div>
            {durationSeconds != null && (
              <span className="text-[10px] font-bold text-green-600">
                · Analysed in {durationSeconds} secs
              </span>
            )}
          </div>
        </div>

        {/* Right — allergens + nutrition (side by side) */}
        {(allergens || showSpoon) && (
          <div
            className="px-3 py-3 flex justify-center gap-6 border-l border-slate-100"
            style={showSpoon ? { minWidth: "340px" } : undefined}
          >
            {/* Allergens section (left column) — matching AllergenCard style */}
            {allergens && (
              <div className="flex flex-col justify-center">
                <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">Allergens</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALLERGEN_KEYS.map((key) => {
                    const cfg = ALLERGEN_CONFIG[key];
                    const detected = allergens[key] === true;
                    return (
                      <div
                        key={key}
                        className="flex flex-col items-center justify-center rounded-lg py-1.5 px-0.5 gap-0.5"
                        style={
                          detected
                            ? { backgroundColor: "#fff7ed", border: "1px solid #fed7aa" }
                            : { backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0" }
                        }
                      >
                        <span className="text-base leading-none">{cfg.emoji}</span>
                        <span
                          className="text-[7px] font-bold uppercase leading-none"
                          style={{ color: detected ? "#ea580c" : "#16a34a" }}
                        >
                          {cfg.label}
                        </span>
                        <span
                          className="text-[6px] font-medium leading-none"
                          style={{ color: detected ? "#ea580c" : "#16a34a" }}
                        >
                          {detected ? "⚠ Present" : "✓ Clear"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Nutrition section (right column) — matching SpoonBreakdown style */}
            {showSpoon && (
              <div className="flex flex-col justify-center space-y-3">
                {/* Sugar */}
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm leading-none">🍬</span>
                    <span className="text-xs font-bold text-slate-800">Sugar</span>
                    <span className="text-xs font-bold" style={{ color: "#ec5b13" }}>
                      {sugarTsp.toFixed(1)} tsp
                    </span>
                    <span className="text-[10px] text-slate-400">({sugarG.toFixed(1)}g)</span>
                  </div>
                </div>

                {/* Fat */}
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm leading-none">🫙</span>
                    <span className="text-xs font-bold text-slate-800">Fat</span>
                    <span className="text-xs font-bold" style={{ color: "#f59e0b" }}>
                      {fatTsp.toFixed(1)} tsp
                    </span>
                    <span className="text-[10px] text-slate-400">({fatG.toFixed(1)}g)</span>
                  </div>
                </div>

                {/* Salt */}
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm leading-none">🧂</span>
                    <span className="text-xs font-bold text-slate-800">Salt</span>
                    <span className="text-xs font-bold" style={{ color: isHighSodium ? "#dc2626" : "#3b82f6" }}>
                      {saltTsp.toFixed(1)} tsp
                    </span>
                    <span className="text-[10px] text-slate-400">({sodiumMg.toFixed(0)}mg)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
