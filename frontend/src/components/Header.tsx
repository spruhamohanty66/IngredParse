import BrandLogo from "./BrandLogo";

export default function Header() {
  return (
    <header className="flex items-center justify-between px-5 py-3.5 flex-shrink-0 z-50 glass-effect border-b" style={{ borderColor: "rgba(255,255,255,0.4)" }}>
      <BrandLogo size="md" showTagline />
      <div className="flex gap-2.5">
        <button className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100/80 text-slate-500 transition-colors hover:bg-slate-200/80">
          <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>notifications</span>
        </button>
        <div
          className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0"
          style={{ border: "2px solid rgba(236,91,19,0.15)" }}
        >
          <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
            <span className="material-symbols-outlined text-slate-400" style={{ fontSize: "18px" }}>person</span>
          </div>
        </div>
      </div>
    </header>
  );
}
