"use client";

import { useState } from "react";
import { AnalysisResult } from "@/lib/types";
import { downloadAnalysisPDF } from "@/lib/pdf-export";
import { useDecisionSignals } from "@/hooks/useDecisionSignals";
import BottomNav from "./BottomNav";
import ProductHeader from "./results/ProductHeader";
import VerdictCard from "./results/VerdictCard";
import IngredientConcentrationChart from "./results/IngredientConcentrationChart";
import MacroNutrientsBar from "./results/MacroNutrientsBar";
import IngredientBreakdown from "./results/IngredientBreakdown";
import WatchlistSection from "./results/WatchlistSection";
import PositiveSignals from "./results/PositiveSignals";
import NutrientQualityMap from "./results/NutrientQualityMap";

import NutritionSummary from "./results/NutritionSummary";
import Disclaimer from "./Disclaimer";

interface Props {
  result: AnalysisResult;
  onBack: () => void;
}

export default function ResultsScreen({ result, onBack }: Props) {
  const { analysis, ingredients, metadata } = result;
  const productName = metadata.product_info.probable_product_name;
  const inputType = metadata.input_type;
  const isCombined = inputType === "both";
  const [downloading, setDownloading] = useState(false);
  const [nutritionView, setNutritionView] = useState<"perServing" | "fullPack">("perServing");

  // North Star eval — track user decision signals
  const { trackInteraction, sendSignals } = useDecisionSignals({
    scanId: result.scan_id,
    labelType: inputType ?? null,
    persona: analysis.verdict?.persona ?? null,
  });

  function handleBack() {
    sendSignals();
    onBack();
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadAnalysisPDF(result);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ position: "fixed", inset: 0, zIndex: 50, backgroundColor: "#f8f6f6" }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-3 flex-shrink-0 glass-effect border-b"
        style={{ borderColor: "rgba(255,255,255,0.4)" }}
      >
        {/* Left — back button + title */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white shadow-sm border border-slate-100"
            aria-label="Go back"
          >
            <span className="material-symbols-outlined text-slate-700" style={{ fontSize: "20px" }}>
              arrow_back
            </span>
          </button>
          <div className="flex flex-col">
            <h1 className="text-base font-bold text-slate-900">
              {inputType === "both" ? "Nutrient and Ingredient Analysis" : (inputType === "nutrition_label") ? "Nutrition Analysis" : "Ingredient Analysis"}
            </h1>
          </div>
        </div>

        {/* Right — download PDF button */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-bold transition-opacity"
          style={{ backgroundColor: "#ec5b13", opacity: downloading ? 0.6 : 1 }}
          aria-label="Download PDF report"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
            {downloading ? "hourglass_empty" : "download"}
          </span>
          {downloading ? "Generating…" : "PDF"}
        </button>
      </header>


      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-4" style={{ paddingBottom: "16px" }}>
        {/* 1. Product Header */}
        <ProductHeader
          productName={productName}
          ingredientComplexity={analysis.ingredient_complexity}
          allergens={(inputType === "ingredient_label" || isCombined) ? analysis.allergens : null}
          nutrition={result.nutrition}
          productType={metadata.product_info.probable_product_type}
          nutritionView={nutritionView}
          durationSeconds={result.duration_seconds}
        />


        {/* 2. Nutrition Summary (with Verdict badge in header) — for nutrition-only and combined modes */}
        {result.nutrition && (
          <NutritionSummary
            nutrition={result.nutrition}
            persona={analysis.verdict?.persona ?? null}
            verdict={inputType === "nutrition_label" || inputType === "both" ? analysis.verdict : null}
            signals={isCombined ? analysis.signals : null}
            positiveSignals={isCombined ? analysis.positive_signals : null}
            watchlist={isCombined ? analysis.watchlist : null}
            isCombined={isCombined}
          />
        )}

        {/* 2b. Summary Card — for ingredient-only mode */}
        {inputType === "ingredient_label" && analysis.verdict?.persona && (
          <VerdictCard
            verdict={analysis.verdict}
            signals={analysis.signals}
            watchlist={analysis.watchlist}
            positiveSignals={analysis.positive_signals}
          />
        )}

        {/* 3. Nutrient Quality Map — for nutrition and combined modes */}
        {result.nutrition && (
          <NutrientQualityMap nutrition={result.nutrition} view={nutritionView} onViewChange={(v) => { setNutritionView(v); trackInteraction("serving_toggle"); }} onChipClick={() => trackInteraction("nutrient_chip_click")} persona={analysis.verdict?.persona} />
        )}

        {/* 5. Ingredient-only sections — hidden for nutrition-only scans */}
        {ingredients.length > 0 && (
          <>
            {/* Combined mode: 4-column layout */}
            {isCombined && (
              <div className="grid grid-cols-4 gap-4">
                {/* Ingredient Concentration Chart — spans 1 column */}
                <IngredientConcentrationChart ingredients={ingredients} />

                {/* Watchlist — spans 1 column */}
                {analysis.watchlist?.length > 0 ? (
                  <WatchlistSection watchlist={analysis.watchlist} persona={analysis.verdict?.persona} onExpand={() => trackInteraction("watchlist_expand")} />
                ) : (
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 mb-3">Watchlist</h3>
                    <p className="text-xs text-slate-400">No items on watchlist</p>
                  </div>
                )}

                {/* Ingredient Breakdown — spans 2 columns, match height */}
                <div className="col-span-2 flex">
                  <IngredientBreakdown categoryDistribution={analysis.category_distribution} ingredients={ingredients} onCategoryClick={() => trackInteraction("ingredient_category_click")} />
                </div>
              </div>
            )}

            {/* Ingredient-only mode: 2-column layout */}
            {!isCombined && (
              <div className="grid grid-cols-2 gap-4">
                <IngredientConcentrationChart ingredients={ingredients} />
                <MacroNutrientsBar macroDominance={analysis.macro_dominance} onBarClick={() => trackInteraction("macro_bar_click")} />
              </div>
            )}

            {/* Ingredient Breakdown — ingredient-only mode only */}
            {!isCombined && (
              <IngredientBreakdown categoryDistribution={analysis.category_distribution} ingredients={ingredients} onCategoryClick={() => trackInteraction("ingredient_category_click")} />
            )}

          </>
        )}

        {/* 7. Disclaimer */}
        <Disclaimer />
      </main>

      {/* Bottom nav */}
      <BottomNav />
    </div>
  );
}

// Inline signals component — shows sugar / sodium / processed fat counts
function IngredientSignals({
  signals,
}: {
  signals: AnalysisResult["analysis"]["signals"];
}) {
  const rows: Array<{ label: string; count: number; ingredients: string[]; icon: string; color: string }> = [
    {
      label: "Sugar Sources",
      count: signals.sugar.count,
      ingredients: signals.sugar.ingredients,
      icon: "water_drop",
      color: "#ec5b13",
    },
    {
      label: "Sodium Sources",
      count: signals.sodium.count,
      ingredients: signals.sodium.ingredients,
      icon: "grain",
      color: "#3b82f6",
    },
    {
      label: "Processed Fats",
      count: signals.processed_fat.count,
      ingredients: signals.processed_fat.ingredients,
      icon: "opacity",
      color: "#f59e0b",
    },
  ].filter((r) => r.count > 0);

  if (rows.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-bold text-slate-800">Ingredient Signals</h3>
      </div>
      <div className="px-5 pb-5 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start gap-3">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ backgroundColor: `${row.color}18` }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "14px", color: row.color }}
              >
                {row.icon}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">{row.label}</span>
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: `${row.color}18`, color: row.color }}
                >
                  {row.count}
                </span>
              </div>
              {row.ingredients.length > 0 && (
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                  {row.ingredients.join(", ")}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
