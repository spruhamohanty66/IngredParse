"use client";

import { useState } from "react";
import { AnalysisResult } from "@/lib/types";

interface Props {
  watchlist: AnalysisResult["analysis"]["watchlist"];
  persona: string | undefined;
  onExpand?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  high_sugar: "High Sugar",
  processed_fat: "Processed Fat",
  artificial_color: "Artificial Color",
  artificial_flavor: "Artificial Flavor",
  high_sodium: "High Sodium",
  artificial_sweetener: "Artificial Sweetener",
  chemical_preservative: "Chemical Preservative",
  refined_carbohydrate: "Refined Carbohydrate",
  highly_processed: "Highly Processed",
  banned_ingredient: "Banned Ingredient",
};

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getRiskIcon(cat: string): { icon: string; color: string } {
  const red = { icon: "warning", color: "#ef4444" };
  const orange = { icon: "info", color: "#f59e0b" };
  const green = { icon: "check_circle", color: "#22c55e" };

  const redCategories = [
    "high_sugar",
    "processed_fat",
    "high_sodium",
    "artificial_sweetener",
    "banned_ingredient",
    "highly_processed",
  ];
  const orangeCategories = [
    "artificial_color",
    "artificial_flavor",
    "chemical_preservative",
    "refined_carbohydrate",
  ];

  if (redCategories.includes(cat)) return red;
  if (orangeCategories.includes(cat)) return orange;
  return green;
}

function getPersonaPill(persona: string | undefined): string {
  if (!persona) return "";
  if (persona === "kids") return "FOR KIDS";
  if (persona === "clean_eating") return "FOR CLEAN EATING";
  return `FOR ${persona.toUpperCase()}`;
}

export default function WatchlistSection({ watchlist, persona, onExpand }: Props) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggle = (i: number) => {
    const opening = expandedIndex !== i;
    setExpandedIndex(expandedIndex === i ? null : i);
    if (opening) onExpand?.();
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <h3 className="text-sm font-bold text-slate-800">Watchlist</h3>
        <span
          className="text-[9px] font-bold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: "rgba(236,91,19,0.1)",
            color: "#ec5b13",
            border: "1px solid rgba(236,91,19,0.2)",
          }}
        >
          {getPersonaPill(persona)}
        </span>
      </div>

      {watchlist.length === 0 ? (
        <div className="px-5 pb-5 flex items-center gap-3">
          <span
            className="material-symbols-outlined flex-shrink-0"
            style={{ fontSize: "22px", color: "#22c55e" }}
          >
            check_circle
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-700">No concerns detected</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              No flagged ingredients for this persona.
            </p>
          </div>
        </div>
      ) : (
      <div className="divide-y divide-slate-100">
        {watchlist.map((item, i) => {
          const risk = getRiskIcon(item.watchlist_category);
          const label = getCategoryLabel(item.watchlist_category);
          const isOpen = expandedIndex === i;

          return (
            <div key={i}>
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
              >
                {/* Risk icon */}
                <span
                  className="material-symbols-outlined flex-shrink-0"
                  style={{ fontSize: "20px", color: risk.color }}
                >
                  {risk.icon}
                </span>

                {/* Label */}
                <span className="flex-1 text-sm font-semibold" style={{ color: "#ec5b13" }}>
                  {label}
                </span>

                {/* Chevron */}
                <span
                  className="material-symbols-outlined transition-transform duration-200"
                  style={{
                    fontSize: "18px",
                    color: "#94a3b8",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  expand_more
                </span>
              </button>

              {isOpen && (
                <div className="px-5 pb-4 pt-0 space-y-1">
                  <p className="text-xs text-slate-600">{item.reason}</p>
                  {item.ingredients.length > 0 && (
                    <p className="text-xs text-slate-400">
                      <span className="font-semibold text-slate-500">Ingredients: </span>
                      {item.ingredients.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
