const personas = [
  { id: "kids",       label: "Safe for Kids",    icon: "mood",         color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  comingSoon: false },
  { id: "clean",      label: "Clean Eating",     icon: "eco",          color: "#22c55e", bg: "rgba(34,197,94,0.12)",   comingSoon: false },
  { id: "moms",       label: "Expecting Moms",   icon: "favorite",     color: "#ec4899", bg: "rgba(236,72,153,0.12)",  comingSoon: true  },
  { id: "specialized",label: "Diet Specific",    icon: "track_changes",color: "#8b5cf6", bg: "rgba(139,92,246,0.12)", comingSoon: true  },
];

interface Props {
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export default function PersonaSelector({ selected, onSelect }: Props) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-[18px]" style={{ color: "#ec5b13" }}>group</span>
        <h3 className="text-sm font-bold text-slate-700">Choose Your Diet Persona</h3>
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        {personas.map((p) => {
          const isSelected = selected === p.id;
          return (
            <button
              key={p.id}
              disabled={p.comingSoon}
              onClick={() => onSelect(isSelected ? null : p.id)}
              className="flex flex-col items-center gap-1.5 rounded-2xl py-3 px-1 transition-all relative"
              style={{
                backgroundColor: isSelected ? p.bg : "rgba(255,255,255,0.8)",
                border: isSelected ? `2px solid ${p.color}` : "2px solid rgba(0,0,0,0.04)",
                opacity: p.comingSoon ? 0.55 : 1,
                cursor: p.comingSoon ? "not-allowed" : "pointer",
                boxShadow: isSelected
                  ? `0 2px 12px ${p.bg}`
                  : "0 1px 3px rgba(0,0,0,0.04)",
                transform: isSelected ? "scale(1.03)" : "scale(1)",
              }}
            >
              {isSelected && (
                <span
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: p.color }}
                >
                  <span className="material-symbols-outlined text-white" style={{ fontSize: "12px" }}>check</span>
                </span>
              )}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: p.bg, color: p.color }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "26px" }}>
                  {p.icon}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-wrap justify-center">
                <span className="text-[10px] font-semibold text-slate-600 leading-tight text-center">{p.label}</span>
                {p.comingSoon && (
                  <span
                    className="text-[7px] font-bold uppercase tracking-wider px-1 py-px rounded-full inline-block"
                    style={{ backgroundColor: "rgba(100,116,139,0.12)", color: "#94a3b8" }}
                  >
                    Soon
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
