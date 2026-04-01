"use client";

import { useState } from "react";
import { AnalysisResult } from "@/lib/types";

interface Props {
  categoryDistribution: AnalysisResult["analysis"]["category_distribution"];
  ingredients: AnalysisResult["ingredients"];
  onCategoryClick?: () => void;
}

interface CategoryConfig {
  label: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
}

const CATEGORY_ORDER = ["natural", "processed", "artificial"];

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  natural: {
    label: "Natural",
    description: "Comes directly from plants, animals, or minerals with little to no processing",
    icon: "eco",
    color: "#16a34a",
    bg: "#f0fdf4",
  },
  processed: {
    label: "Processed",
    description: "Derived from natural sources but modified through refining or extraction",
    icon: "inventory_2",
    color: "#d97706",
    bg: "#fffbeb",
  },
  artificial: {
    label: "Artificial",
    description: "Man-made ingredients created through chemical processes",
    icon: "science",
    color: "#dc2626",
    bg: "#fef2f2",
  },
};

// Short human-readable explanations for functional roles (Processed / Artificial only)
const ROLE_DESCRIPTIONS: Record<string, string> = {
  emulsifier:        "Blends oil & water",
  preservative:      "Extends shelf life",
  sweetener:         "Adds sweetness",
  color:             "Adds colour",
  colorant:          "Adds colour",
  flavor:            "Adds flavour",
  flavoring_agent:   "Adds flavour",
  flavor_enhancer:   "Boosts taste",
  antioxidant:       "Prevents oxidation",
  thickener:         "Thickens texture",
  raising_agent:     "Helps dough rise",
  stabilizer:        "Keeps texture stable",
  humectant:         "Retains moisture",
  acidity_regulator: "Controls acidity",
  anti_caking_agent: "Prevents clumping",
  bleaching_agent:   "Whitens ingredient",
  bulking_agent:     "Adds bulk / volume",
  fat_source:        "Provides fat",
  protein_source:    "Provides protein",
  fruit_component:   "Fruit-derived",
  base_ingredient:   "Core ingredient",
};

const TAG_CONFIG: Record<string, { label: string; color: string }> = {
  functional:            { label: "Functional",             color: "#8b5cf6" },
  sweetener:             { label: "Sweetener",              color: "#ec5b13" },
  flavor_enhancer:       { label: "Flavor Enhancer",        color: "#3b82f6" },
  colorant:              { label: "Colorant",               color: "#f59e0b" },
  preservative:          { label: "Preservative",           color: "#64748b" },
  stabilizer_thickener:  { label: "Stabilizer / Thickener", color: "#0ea5e9" },
  may_increase_cravings: { label: "May increase cravings",  color: "#ef4444" },
};

export default function IngredientBreakdown({ categoryDistribution, ingredients, onCategoryClick }: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Build lookup: ingredient name → tags
  const tagsByName: Record<string, string[]> = {};
  for (const ing of ingredients) {
    const name = ing.raw_text;
    const tags = ing.db_data?.ingredient_tags ?? [];
    if (name && tags.length > 0) tagsByName[name] = tags;
  }

  // Build lookup: ingredient name → functional role description
  const roleByName: Record<string, string> = {};
  for (const ing of ingredients) {
    const name = ing.raw_text;
    if (!name) continue;
    const role = ing.db_data?.functional_role_db ?? ing.functional_role;
    if (role) {
      const key = role.toLowerCase().replace(/\s+/g, "_");
      if (ROLE_DESCRIPTIONS[key]) roleByName[name] = ROLE_DESCRIPTIONS[key];
    }
  }

  // Build lookup: ingredient name → human_review_flag
  const reviewByName: Record<string, boolean> = {};
  for (const ing of ingredients) {
    if (ing.raw_text && ing.db_data?.human_review_flag) {
      reviewByName[ing.raw_text] = true;
    }
  }
  const reviewCount = Object.keys(reviewByName).length;

  const toggle = (key: string) => {
    setActiveCategory((prev) => (prev === key ? null : key));
    onCategoryClick?.();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden w-full flex flex-col">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">Ingredient Breakdown</h3>
          {reviewCount > 0 && (
            <span className="text-[9px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              {reviewCount} pending expert review
            </span>
          )}
        </div>
      </div>

      {/* 3-column card row */}
      <div className="grid grid-cols-3 gap-2 px-3 pb-3">
        {CATEGORY_ORDER.map((key) => {
          const config = CATEGORY_CONFIG[key];
          const data = categoryDistribution?.[key];
          const count = data?.count ?? 0;
          const isActive = activeCategory === key;

          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className="rounded-xl p-3 flex flex-col items-center gap-1.5 transition-all"
              style={{
                backgroundColor: isActive ? config.color : config.bg,
                border: `1.5px solid ${isActive ? config.color : config.color + "40"}`,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "22px", color: isActive ? "#fff" : config.color }}
              >
                {config.icon}
              </span>
              <span
                className="text-[11px] font-bold leading-tight text-center"
                style={{ color: isActive ? "#fff" : config.color }}
              >
                {config.label}
              </span>
              <span
                className="text-lg font-extrabold leading-none"
                style={{ color: isActive ? "#fff" : "#1e293b" }}
              >
                {count}
              </span>
              <span
                className="text-[9px] leading-none"
                style={{ color: isActive ? "#ffffffaa" : "#94a3b8" }}
              >
                ingredients
              </span>
            </button>
          );
        })}
      </div>

      {/* Expanded ingredient list — scrollable to match grid siblings */}
      {activeCategory && (() => {
        const config = CATEGORY_CONFIG[activeCategory];
        const data = categoryDistribution?.[activeCategory];
        if (!data || data.count === 0) return (
          <div className="px-4 pb-4 text-xs text-slate-400 italic">No ingredients in this category.</div>
        );
        return (
          <div className="px-3 pb-3 flex-1 overflow-y-auto no-scrollbar">
            <p className="text-[10px] text-slate-400 italic mb-2">{config.description}</p>
            <div className="grid grid-cols-2 gap-2">
              {data.ingredients.map((name: string) => {
                const tags = tagsByName[name] ?? [];
                const underReview = reviewByName[name] ?? false;
                return (
                  <div
                    key={name}
                    className="rounded-xl p-2.5 flex flex-col gap-1.5"
                    style={{
                      backgroundColor: `${config.color}0d`,
                      borderLeft: `3px solid ${config.color}`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[11px] font-semibold text-slate-800 leading-tight line-clamp-2 flex-1">
                        {name}
                      </span>
                      {underReview && (
                        <span
                          className="material-symbols-outlined flex-shrink-0"
                          style={{ fontSize: "13px", color: "#d97706" }}
                          title="Pending expert review"
                        >
                          rate_review
                        </span>
                      )}
                    </div>
                    {/* Functional role description — Processed & Artificial only */}
                    {(activeCategory === "processed" || activeCategory === "artificial") && roleByName[name] && (
                      <span
                        className="text-[9px] italic leading-tight"
                        style={{ color: config.color }}
                      >
                        {roleByName[name]}
                      </span>
                    )}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.map((tag) => {
                          const tc = TAG_CONFIG[tag];
                          if (!tc) return null;
                          return (
                            <span
                              key={tag}
                              className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: `${tc.color}20`, color: tc.color }}
                            >
                              {tc.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
