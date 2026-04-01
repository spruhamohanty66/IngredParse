import { AnalysisResult } from "@/lib/types";

interface Props {
  additiveDensity: AnalysisResult["analysis"]["additive_density"];
}

const DENSITY_CONFIG = {
  none:   { label: "No Additives",    color: "#22c55e", bg: "rgba(34,197,94,0.08)",   bar: 0   },
  low:    { label: "Low Additives",   color: "#84cc16", bg: "rgba(132,204,22,0.08)",  bar: 33  },
  medium: { label: "Moderate",        color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  bar: 66  },
  high:   { label: "High Additives",  color: "#ef4444", bg: "rgba(239,68,68,0.08)",   bar: 100 },
};

export default function AdditiveDensity({ additiveDensity }: Props) {
  if (!additiveDensity) return null;

  const { count, density, additives } = additiveDensity;
  const cfg = DENSITY_CONFIG[density];

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Additive Presence</h3>
          <p className="text-[10px] text-slate-400">Kids persona · {count} additive{count !== 1 ? "s" : ""} detected</p>
        </div>
        <span
          className="text-[10px] font-bold px-2.5 py-1 rounded-full"
          style={{ backgroundColor: cfg.bg, color: cfg.color }}
        >
          {cfg.label}
        </span>
      </div>

      {/* Density bar */}
      <div className="w-full h-2 rounded-full mb-3" style={{ backgroundColor: "#f1f5f9" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${cfg.bar}%`, backgroundColor: cfg.color }}
        />
      </div>

      {/* Additive chips */}
      {additives.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {additives.map((name) => (
            <span
              key={name}
              className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${cfg.color}14`, color: cfg.color }}
            >
              {name}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-slate-400">No functional additives detected in this product.</p>
      )}
    </div>
  );
}
