const steps = [
  { icon: "photo_camera", title: "Snap or Upload", desc: "Take a photo of any food label" },
  { icon: "smart_toy",    title: "AI Analyses",    desc: "Ingredients & nutrition decoded" },
  { icon: "shield",       title: "Get Verdict",    desc: "Allergens, risks & recommendations" },
];

export default function HowItWorks() {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-[18px]" style={{ color: "#ec5b13" }}>help_outline</span>
        <h3 className="text-sm font-bold text-slate-700">How It Works</h3>
      </div>

      <div className="flex gap-2.5">
        {steps.map((s, i) => (
          <div
            key={i}
            className="flex-1 flex flex-col items-center text-center rounded-2xl py-4 px-2 bg-white/80 border border-slate-100/60"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}
          >
            <div className="relative mb-2">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(236,91,19,0.1)" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "20px", color: "#ec5b13" }}>
                  {s.icon}
                </span>
              </div>
              <span
                className="absolute -top-1 -left-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{ backgroundColor: "#ec5b13" }}
              >
                {i + 1}
              </span>
            </div>
            <p className="text-[11px] font-bold text-slate-700 leading-tight">{s.title}</p>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
