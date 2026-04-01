"""
Analysis Agent — Analyzes enriched ingredient and/or nutrition data to generate verdicts.

This agent handles three scenarios:
  1. Ingredient-only: Analyze parsed ingredients, generate ingredient verdict
  2. Nutrition-only: Analyze parsed nutrition, generate nutrition verdict
  3. Both: Analyze both and combine verdicts

Single responsibility: Analysis only — does NOT parse or persist data.
"""

import logging
import time
from datetime import datetime

from services.analysis_service import (
    detect_allergens,
    compute_signals,
    compute_category_distribution,
    compute_macro_dominance,
    compute_additive_density,
    compute_ingredient_complexity,
    run_persona_analysis,
    detect_banned_ingredients,
    detect_refined_grains_top5,
    AnalysisError,
)
from services.nutrition_analysis_service import analyse_nutrition

logger = logging.getLogger(__name__)


def _analyze_ingredients_phase(parsed_ingredients: dict, persona: str) -> dict:
    """
    Run ingredient analysis on parsed ingredient data.

    Args:
        parsed_ingredients: Output of ingredient parsing (contains "parsed_output" key)
        persona: "kids" | "clean_eating"

    Returns:
        Dict with keys:
          - allergens
          - signals
          - category_distribution
          - macro_dominance
          - additive_density
          - ingredient_complexity
          - watchlist
          - positive_signals
          - verdict
    """
    # Build a temporary pipeline dict for analysis service compatibility
    pipeline = parsed_ingredients.copy()

    parsed_output = pipeline.get("parsed_output", {})

    # Step 1 — Allergen Detection (rule-based)
    allergens = detect_allergens(parsed_output)

    # Step 2 — Ingredient Signals (rule-based)
    signals = compute_signals(parsed_output)

    # Step 3 — Ingredient Category Distribution (rule-based)
    category_distribution = compute_category_distribution(parsed_output)

    # Step 4 — Macronutrient Dominance (rule-based, ingredient-based inference)
    macro_dominance = compute_macro_dominance(parsed_output)

    # Step 5 — Additive Density (Kids only, rule-based)
    additive_density = compute_additive_density(parsed_output, persona)

    # Step 6 — Ingredient Complexity (rule-based)
    ingredient_complexity = compute_ingredient_complexity(pipeline)

    # Step 7 — Persona Analysis + Verdict (GPT-4)
    watchlist, positive_signals, verdict, persona_eval = run_persona_analysis(pipeline, persona)

    # Step 8 — Banned Ingredient Detection (rule-based, merged into watchlist)
    banned_entries = detect_banned_ingredients(parsed_output)
    watchlist = watchlist + banned_entries

    # Step 9 — Refined Grains in Top 5 Detection (rule-based, merged into watchlist)
    refined_grain_entries = detect_refined_grains_top5(parsed_output)
    watchlist = watchlist + refined_grain_entries

    return {
        "allergens": allergens,
        "signals": signals,
        "category_distribution": category_distribution,
        "macro_dominance": macro_dominance,
        "additive_density": additive_density,
        "ingredient_complexity": ingredient_complexity,
        "watchlist": watchlist,
        "positive_signals": positive_signals,
        "verdict": verdict,
        "_persona_eval": persona_eval,
    }


def _analyze_nutrition_phase(parsed_nutrition: dict, persona: str) -> dict:
    """
    Run nutrition analysis on parsed nutrition data.

    Args:
        parsed_nutrition: Output of nutrition parsing (contains per_serving, per_100g, flags, etc.)
        persona: "kids" | "clean_eating"

    Returns:
        Dict with keys:
          - nutrition_verdict (dict with label, safe, summary, highlights, etc.)
    """
    # Run persona-specific nutrition analysis
    analysis_result = analyse_nutrition(parsed_nutrition, persona)

    return {
        "nutrition_verdict": analysis_result["verdict"],
        "nutrition_persona_flags": analysis_result["persona_flags"],
    }


def _normalise_nutrition_highlights(highlights: list) -> list:
    """
    Normalise nutrition highlights to use 'ingredient' field instead of 'nutrient'.
    Frontend expects all highlights to have 'ingredient' and 'reason' fields.
    """
    if not highlights:
        return highlights

    normalised = []
    for h in highlights:
        normalised.append({
            "ingredient": h.get("nutrient", h.get("ingredient", "")),
            "reason": h.get("reason", ""),
        })
    return normalised


def _combine_verdicts(ingredient_verdict: dict, nutrition_verdict: dict, persona: str) -> dict:
    """
    Combine ingredient and nutrition verdicts into a unified verdict.

    Logic: Stricter verdict wins.
      - If either is "not_recommended" → Result is "not_recommended"
      - If both are "highly_recommended" → Result is "highly_recommended"
      - Otherwise → Result is "moderately_recommended"

    Args:
        ingredient_verdict: Verdict from ingredient analysis (may be None)
        nutrition_verdict: Verdict from nutrition analysis (may be None)
        persona: User persona for context

    Returns:
        Combined verdict dict with label, safe, summary, highlights
    """
    if not ingredient_verdict or not nutrition_verdict:
        # Shouldn't happen if this function is called correctly, but fallback gracefully
        return ingredient_verdict or nutrition_verdict or {}

    ing_label = ingredient_verdict.get("label", "moderately_recommended")
    nutr_label = nutrition_verdict.get("label", "moderately_recommended")

    # Verdict severity — higher = stricter
    _SEVERITY = {
        "not_recommended": 2,
        "moderately_recommended": 1,
        "highly_recommended": 0,
    }

    ing_severity = _SEVERITY.get(ing_label, 1)
    nutr_severity = _SEVERITY.get(nutr_label, 1)

    # Stricter verdict wins
    if ing_severity > nutr_severity:
        combined_label = ing_label
        combined_safe = ingredient_verdict.get("safe", True)
    elif nutr_severity > ing_severity:
        combined_label = nutr_label
        combined_safe = nutrition_verdict.get("safe", True)
    else:
        # Equal severity — use nutrition's verdict as tiebreaker
        combined_label = nutr_label
        combined_safe = nutrition_verdict.get("safe", True)

    # Combine highlights from both verdicts
    ing_highlights = ingredient_verdict.get("highlights", [])
    nutr_highlights = _normalise_nutrition_highlights(nutrition_verdict.get("highlights", []))
    combined_highlights = ing_highlights + nutr_highlights

    # Combine summaries
    ing_summary = ingredient_verdict.get("summary", "")
    nutr_summary = nutrition_verdict.get("summary", "")
    combined_summary = ". ".join(filter(None, [ing_summary, nutr_summary]))

    return {
        "persona": persona,
        "safe": combined_safe,
        "label": combined_label,
        "summary": combined_summary,
        "highlights": combined_highlights,
        "ingredient_verdict": ingredient_verdict,
        "nutrition_verdict": nutrition_verdict,
    }


def run_analysis_agent(
    parsed_ingredients: dict | None,
    parsed_nutrition: dict | None,
    persona: str,
    label_type: str,
) -> dict:
    """
    Analyze enriched ingredient and/or nutrition data to generate verdicts, signals, and recommendations.

    Handles three modes:
      1. Ingredient-only: parsed_ingredients provided, parsed_nutrition is None
      2. Nutrition-only: parsed_nutrition provided, parsed_ingredients is None
      3. Combined: Both provided → analyzes both and merges verdicts

    Args:
        parsed_ingredients: Output of ingredient agent (parsed_output structure) or None
        parsed_nutrition: Output of nutrition agent (nutrition dict structure) or None
        persona: "kids" | "clean_eating"
        label_type: "ingredient_label" | "nutrition_label" | "both"

    Returns:
        Dict with analysis results (structure depends on mode):
          - For ingredient-only: allergens, signals, category_distribution, macro_dominance,
                                additive_density, ingredient_complexity, watchlist,
                                positive_signals, verdict, analysis_type
          - For nutrition-only: nutrition_verdict, nutrition_persona_flags, analysis_type
          - For combined: allergens, signals, category_distribution, macro_dominance,
                         additive_density, ingredient_complexity, watchlist,
                         positive_signals, verdict (merged), nutrition_verdict,
                         nutrition_persona_flags, analysis_type

    Raises:
        AnalysisError: If analysis fails
    """
    start_time = time.time()
    start_dt = datetime.now().isoformat()

    logger.info(
        f"[AnalysisAgent] START | Time: {start_dt} | Persona: {persona} | LabelType: {label_type} | "
        f"HasIngredients: {parsed_ingredients is not None} | HasNutrition: {parsed_nutrition is not None}"
    )

    results = {}

    try:
        # Phase 1: Ingredient Analysis
        if parsed_ingredients:
            logger.debug("[AnalysisAgent] Starting ingredient analysis phase...")
            try:
                ing_analysis = _analyze_ingredients_phase(parsed_ingredients, persona)
                results.update(ing_analysis)
                logger.debug(
                    f"[AnalysisAgent] Ingredient analysis complete | Allergens: {len(ing_analysis.get('allergens', {}))} | "
                    f"Signals: {sum(v.get('count', 0) for v in ing_analysis.get('signals', {}).values())}"
                )
            except Exception as e:
                raise AnalysisError(f"Ingredient analysis failed: {str(e)}")

        # Phase 2: Nutrition Analysis
        if parsed_nutrition:
            logger.debug("[AnalysisAgent] Starting nutrition analysis phase...")
            try:
                nutr_analysis = _analyze_nutrition_phase(parsed_nutrition, persona)
                results.update(nutr_analysis)
                nutrition_verdict = nutr_analysis.get("nutrition_verdict", {})
                logger.debug(
                    f"[AnalysisAgent] Nutrition analysis complete | Verdict: {nutrition_verdict.get('label', 'N/A')} | "
                    f"Safe: {nutrition_verdict.get('safe', 'N/A')}"
                )
            except Exception as e:
                raise AnalysisError(f"Nutrition analysis failed: {str(e)}")

        # Phase 3: Combine Verdicts (if both present)
        if parsed_ingredients and parsed_nutrition:
            logger.debug("[AnalysisAgent] Combining ingredient and nutrition verdicts...")
            ingredient_verdict = results.get("verdict")
            nutrition_verdict = results.get("nutrition_verdict")

            combined_verdict = _combine_verdicts(ingredient_verdict, nutrition_verdict, persona)
            results["verdict"] = combined_verdict
            results["analysis_type"] = "combined"
            logger.debug(
                f"[AnalysisAgent] Verdicts combined | Final: {combined_verdict.get('label', 'N/A')} | "
                f"Safe: {combined_verdict.get('safe', 'N/A')}"
            )

        elif parsed_ingredients:
            results["analysis_type"] = "ingredient_only"
            logger.debug("[AnalysisAgent] Analysis type: ingredient_only")

        elif parsed_nutrition:
            results["analysis_type"] = "nutrition_only"
            logger.debug("[AnalysisAgent] Analysis type: nutrition_only")

        # Aggregate eval metrics for analysis agent
        persona_eval = results.pop("_persona_eval", {"token_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "llm_calls": 0})
        agent_tokens = persona_eval["token_usage"]
        agent_llm_calls = persona_eval["llm_calls"]

        elapsed_time = time.time() - start_time
        end_dt = datetime.now().isoformat()

        logger.info(
            f"[AnalysisAgent] END | Time: {end_dt} | Duration: {elapsed_time:.2f}s | "
            f"Type: {results.get('analysis_type', 'unknown')} | "
            f"Status: SUCCESS | Output keys: {len(results)} | "
            f"FinalVerdict: {results.get('verdict', {}).get('label', 'N/A')} | "
            f"LLMCalls: {agent_llm_calls} | Tokens: {agent_tokens['total_tokens']}"
        )

        results["_agent_eval"] = {
            "agent": "AnalysisAgent",
            "token_usage": agent_tokens,
            "llm_calls": agent_llm_calls,
            "duration_seconds": round(elapsed_time, 2),
        }
        return results

    except Exception as e:
        elapsed_time = time.time() - start_time
        end_dt = datetime.now().isoformat()
        logger.error(
            f"[AnalysisAgent] END | Time: {end_dt} | Duration: {elapsed_time:.2f}s | "
            f"Status: FAILED | Error: {str(e)}"
        )
        raise
