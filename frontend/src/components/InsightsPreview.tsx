// isNewUser will be replaced by real data once auth + scan history is wired up
const isNewUser = true;

export default function InsightsPreview() {
  return (
    <section
      className="p-5 rounded-2xl text-white relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
      }}
    >
      <div
        className="absolute top-0 right-0 w-32 h-32 organic-shape blur-2xl pointer-events-none"
        style={{ backgroundColor: "rgba(236,91,19,0.15)" }}
      />
      <div
        className="absolute bottom-0 left-0 w-24 h-24 organic-shape blur-2xl pointer-events-none"
        style={{ backgroundColor: "rgba(34,197,94,0.08)" }}
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-lg" style={{ color: "#ec5b13" }}>
            analytics
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
            Weekly Insights
          </span>
        </div>

        {isNewUser ? (
          <div className="flex flex-col items-center text-center py-3 gap-2.5">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(236,91,19,0.15)" }}>
              <span className="material-symbols-outlined text-2xl" style={{ color: "#ec5b13" }}>
                qr_code_scanner
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold opacity-90">No scans yet this week</p>
              <p className="text-xs opacity-40 leading-relaxed mt-1">
                Scan your first food label to start tracking weekly health insights.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <h4 className="text-lg font-bold leading-snug">
              You&apos;ve scanned 12 &ldquo;Clean&rdquo; items this week!
            </h4>
            <p className="text-xs opacity-60">
              That&apos;s 20% more than last week. Your gut health is improving.
            </p>
            <button className="bg-white text-slate-900 px-4 py-1.5 rounded-lg text-sm font-bold">
              View Report
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
