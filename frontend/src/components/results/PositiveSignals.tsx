import { AnalysisResult } from "@/lib/types";

interface Props {
  signals: AnalysisResult["analysis"]["positive_signals"];
}

export default function PositiveSignals({ signals }: Props) {
  if (!signals || signals.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-bold text-slate-800">Positive Signals</h3>
      </div>
      <div className="px-5 pb-5 space-y-3">
        {signals.map((s, i) => (
          <div
            key={i}
            className="flex items-start gap-3"
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ backgroundColor: "rgba(34,197,94,0.12)" }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "14px", color: "#22c55e" }}
              >
                check_circle
              </span>
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-slate-800">{s.signal}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{s.reason}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
