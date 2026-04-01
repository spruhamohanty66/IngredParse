import { AnalysisResult } from "@/lib/types";

interface Props {
  ingredients: AnalysisResult["ingredients"];
}

const BAR_COLORS = ["#ec5b13", "#e8622a", "#e06b3d", "#d97450", "#cf7e62"];
const BAR_BG    = ["rgba(236,91,19,0.14)", "rgba(236,91,19,0.11)", "rgba(236,91,19,0.09)", "rgba(236,91,19,0.07)", "rgba(236,91,19,0.05)"];
const BAR_WIDTHS = [100, 80, 62, 47, 35];

export default function IngredientConcentrationChart({ ingredients }: Props) {
  const sorted = [...ingredients].sort((a, b) => a.rank - b.rank);
  const topN = sorted.slice(0, 5);
  const count = topN.length;

  if (count === 0) return null;

  // Scale widths proportionally when fewer than 5 ingredients
  const widths = count < 5
    ? topN.map((_, i) => 100 - (i * (65 / (count - 1 || 1))))
    : BAR_WIDTHS;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <h3 className="text-sm font-bold text-slate-800 mb-0.5">Ingredient Concentration</h3>
      <p className="text-[11px] text-slate-400 mb-3">
        {count < 5 ? `All ${count} ingredients` : "Top ingredients"} by order in product
      </p>

      <div className="space-y-2">
        {topN.map((ing, i) => (
          <div key={ing.rank} className="flex items-center gap-2">
            {/* Rank badge */}
            <span
              className="text-[10px] font-bold w-4 text-right flex-shrink-0"
              style={{ color: BAR_COLORS[i] }}
            >
              {ing.rank}
            </span>

            {/* Bar + name */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div
                  className="h-5 rounded-md flex items-center px-2 gap-1.5 flex-shrink-0"
                  style={{
                    width: `${widths[i]}%`,
                    backgroundColor: BAR_BG[i],
                  }}
                >
                  <span
                    className="text-[10px] font-semibold truncate"
                    style={{ color: "#1e293b" }}
                  >
                    {ing.raw_text}
                  </span>
                  {ing.quantity?.value != null && (
                    <span
                      className="text-[9px] font-bold flex-shrink-0 ml-auto"
                      style={{ color: BAR_COLORS[i] }}
                    >
                      {ing.quantity.value}{ing.quantity.unit ?? ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
