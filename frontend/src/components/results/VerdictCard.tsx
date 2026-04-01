import { AnalysisResult } from "@/lib/types";

type Tier = "not_recommended" | "moderately_recommended" | "highly_recommended";

interface Props {
  verdict: AnalysisResult["analysis"]["verdict"];
  signals?: AnalysisResult["analysis"]["signals"] | null;
  watchlist?: AnalysisResult["analysis"]["watchlist"] | null;
  positiveSignals?: Array<{ signal: string; reason: string }> | null;
}

const VERDICT_COLORS: Record<Tier, { bg: string; color: string; label: string }> = {
  not_recommended:        { bg: "#fef2f2", color: "#dc2626", label: "Not Recommended" },
  moderately_recommended: { bg: "#fef3c7", color: "#d97706", label: "Occasionally OK" },
  highly_recommended:     { bg: "#f0fdf4", color: "#16a34a", label: "Recommended" },
};

const VERDICT_LABELS: Record<Tier, string> = {
  not_recommended:        "Not Recommended",
  moderately_recommended: "Occasionally OK",
  highly_recommended:     "Recommended",
};

function resolveTier(verdict: Props["verdict"]): Tier {
  if (verdict.label) return verdict.label;
  return verdict.safe ? "highly_recommended" : "not_recommended";
}

export default function VerdictCard({ verdict, signals, watchlist, positiveSignals }: Props) {
  const tier = resolveTier(verdict);
  const verdictStyle = VERDICT_COLORS[tier];
  const verdictLabel = VERDICT_LABELS[tier];

  // ── Build caution items (5 pointers: sugar, refined grains, excess fat, high sodium, artificial colors) ──
  const cautionItems: Array<{ label: string }> = [];

  // 1. Sugar sources
  if (signals?.sugar?.count > 0) {
    cautionItems.push({
      label: `${signals.sugar.count} sugar source${signals.sugar.count > 1 ? "s" : ""} (${signals.sugar.ingredients.join(", ")})`,
    });
  }

  // 2. Refined grains in top 5 (from watchlist — category "highly_processed" with refined grain reason)
  if (watchlist) {
    watchlist.forEach((item) => {
      if (item.reason?.toLowerCase().includes("refined grain")) {
        cautionItems.push({ label: `Refined grains in top 5 (${item.ingredients.join(", ")})` });
      }
    });
  }

  // 3. Processed fat — flag only when multiple fat/oil sources in ingredients
  if (signals?.processed_fat?.count > 1) {
    cautionItems.push({
      label: `Multiple fat sources — ${signals.processed_fat.ingredients.join(", ")}`,
    });
  }

  // 4. High sodium
  if (signals?.sodium?.count > 0) {
    cautionItems.push({
      label: `High sodium — ${signals.sodium.count} source${signals.sodium.count > 1 ? "s" : ""} (${signals.sodium.ingredients.join(", ")})`,
    });
  }

  // 5. Artificial colors (from watchlist)
  if (watchlist) {
    watchlist.forEach((item) => {
      if (item.watchlist_category === "artificial_color") {
        cautionItems.push({ label: `Artificial colors (${item.ingredients.join(", ")})` });
      }
    });
  }

  // ── Build positive items (deduplicated) ──────────────────────────────────
  const posItems: Array<{ label: string }> = [];
  const seenPositive = new Set<string>();

  // From verdict highlights (when highly recommended)
  if (verdict.highlights?.length > 0 && tier === "highly_recommended") {
    verdict.highlights.forEach((h) => {
      const label = h.reason ? `${h.ingredient} — ${h.reason}` : h.ingredient;
      const key = label.toLowerCase();
      if (!seenPositive.has(key)) {
        seenPositive.add(key);
        posItems.push({ label });
      }
    });
  }

  // From positive signals
  if (positiveSignals) {
    positiveSignals.forEach((sig) => {
      const label = sig.reason || sig.signal;
      const key = label.toLowerCase();
      if (!seenPositive.has(key)) {
        seenPositive.add(key);
        posItems.push({ label });
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      {/* Header: "Summary" + verdict badge */}
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-bold text-slate-900 text-sm">Summary</h3>
        <span
          className="text-xs font-extrabold px-2.5 py-1 rounded-full tracking-wide"
          style={{ backgroundColor: verdictStyle.color, color: "#fff" }}
        >
          {verdictLabel}
        </span>
      </div>

      {/* Two-column: Caution | Positive */}
      <div className="grid grid-cols-2 gap-4">
        {/* CAUTION CARD */}
        <div className="rounded-2xl p-4 border border-orange-200" style={{ backgroundColor: "#fff7ed" }}>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-sm font-bold text-slate-900">Caution</p>
            <span className="text-[7px] font-extrabold px-1.5 py-0.5 rounded-full tracking-wide bg-orange-600 text-white">
              HIGH
            </span>
          </div>
          <div className="space-y-1.5">
            {cautionItems.length > 0 ? (
              cautionItems.map((item, idx) => (
                <p key={idx} className="text-[10px] font-semibold text-slate-800">• {item.label}</p>
              ))
            ) : (
              <p className="text-[10px] font-semibold text-slate-400">NA</p>
            )}
          </div>
        </div>

        {/* POSITIVE CARD */}
        <div className="rounded-2xl p-4 border border-green-200" style={{ backgroundColor: "#f0fdf4" }}>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-sm font-bold text-slate-900">Positive</p>
            <span className="text-[7px] font-extrabold px-1.5 py-0.5 rounded-full tracking-wide bg-green-600 text-white">
              POSITIVE
            </span>
          </div>
          <div className="space-y-1.5">
            {posItems.length > 0 ? (
              posItems.map((item, idx) => (
                <p key={idx} className="text-[10px] font-semibold text-slate-800">• {item.label}</p>
              ))
            ) : (
              <p className="text-[10px] font-semibold text-slate-400">NA</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
