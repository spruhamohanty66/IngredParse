/**
 * Disclaimer text — shown at the bottom of results screen and included in PDF.
 * Update text here and it updates everywhere.
 */
export const DISCLAIMER_LINES = [
  "This analysis is designed to help you better understand food ingredients. It is for informational purposes only and not a substitute for professional medical advice. Please consult a healthcare professional for personalized guidance. This is not an endorsement of any product.",
  "This analysis is independent and does not imply compliance with, endorsement by, or certification under the Food Safety and Standards Authority of India (FSSAI) or any other regulatory body.",
] as const;

export default function Disclaimer() {
  return (
    <div
      className="rounded-xl px-4 py-4 text-center"
      style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}
    >
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">
        Disclaimer
      </p>
      {DISCLAIMER_LINES.map((line, i) => (
        <p key={i} className="text-[10px] text-slate-400 leading-relaxed mb-1.5 last:mb-0">
          {line}
        </p>
      ))}
    </div>
  );
}
