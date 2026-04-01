export default function BottomNav() {
  return (
    <nav
      className="flex-shrink-0 glass-effect border-t"
      style={{
        borderColor: "rgba(255,255,255,0.4)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex items-center justify-between px-8 pt-3 pb-3 relative">
        {/* Home */}
        <a href="#" className="flex flex-col items-center gap-0.5" style={{ color: "#ec5b13" }}>
          <span className="material-symbols-outlined text-[22px]">home</span>
          <span className="text-[9px] font-bold">Home</span>
        </a>

        {/* History */}
        <a href="#" className="flex flex-col items-center gap-0.5 text-slate-400 transition-colors hover:text-slate-600">
          <span className="material-symbols-outlined text-[22px]">history</span>
          <span className="text-[9px] font-bold">History</span>
        </a>

        {/* FAB — lifted above nav */}
        <div className="flex flex-col items-center" style={{ marginTop: "-32px" }}>
          <button
            className="w-14 h-14 text-white rounded-full flex items-center justify-center transition-transform active:scale-95"
            style={{
              background: "linear-gradient(135deg, #ec5b13 0%, #f07830 100%)",
              boxShadow: "0 4px 20px rgba(236,91,19,0.45)",
              border: "4px solid #f8f6f6",
            }}
          >
            <span className="material-symbols-outlined text-2xl">add</span>
          </button>
          <span className="text-[9px] font-bold text-slate-400 mt-1">Scan</span>
        </div>

        {/* Insights */}
        <a href="#" className="flex flex-col items-center gap-0.5 text-slate-400 transition-colors hover:text-slate-600">
          <span className="material-symbols-outlined text-[22px]">bar_chart</span>
          <span className="text-[9px] font-bold">Insights</span>
        </a>

        {/* Profile */}
        <a href="#" className="flex flex-col items-center gap-0.5 text-slate-400 transition-colors hover:text-slate-600">
          <span className="material-symbols-outlined text-[22px]">person</span>
          <span className="text-[9px] font-bold">Profile</span>
        </a>
      </div>
    </nav>
  );
}
