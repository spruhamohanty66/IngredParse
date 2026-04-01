"""
Analysis Service
Runs after all ingredients are enriched (DB match + GPT-4 fallback).

Steps:
  1. Allergen Detection       — rule-based, no AI
  2. Ingredient Signals       — sugar / sodium / processed_fat grouping
  3. Persona Analysis+Verdict — GPT-4, one call per scan

All configurable rules are in config/analysis_rules.py (mirrors analysis.md).
"""

from __future__ import annotations

import os
import json
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)
from prompts.prompts import PERSONA_ANALYSIS_PROMPT
from data.banned_ingredients_list import FSSAI_BANNED_INGREDIENTS
from config.analysis_rules import (
    TOP_4_ALLERGENS,
    ALLERGEN_KEYWORDS as _ALLERGEN_KEYWORDS,
    SIGNAL_TYPES,
    WATCHLIST_TO_SIGNAL as _WATCHLIST_TO_SIGNAL,
    SODIUM_EXCLUDED_ROLES,
    SODIUM_TOP_RANK_THRESHOLD,
    SODIUM_MIN_SOURCES_TO_FLAG,
    REFINED_GRAIN_KEYWORDS,
    REFINED_GRAIN_TOP_RANK_THRESHOLD,
    REFINED_GRAIN_MIN_COUNT_TO_FLAG,
    CATEGORY_TYPES,
    ALWAYS_NATURAL_KEYWORDS as _ALWAYS_NATURAL_KEYWORDS,
    ADDITIVE_TAGS as _ADDITIVE_TAGS,
    ADDITIVE_ROLES as _ADDITIVE_ROLES,
    TRACKED_MACROS as _TRACKED_MACROS,
    MACRO_SLOT_WEIGHTS as _MACRO_SLOT_WEIGHTS,
    FUNCTIONAL_ROLE_TO_CATEGORY as _FUNCTIONAL_ROLE_TO_CATEGORY,
    WATCHLIST_TO_CATEGORY as _WATCHLIST_TO_CATEGORY,
    COMPLEXITY_THRESHOLDS,
)

# ── Constants ─────────────────────────────────────────────────────────────────

VALID_PERSONAS = {"kids", "clean_eating"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _iter_all_ingredients(parsed_output: dict):
    """Yield every top-level and sub-ingredient object in the parsed output.
    Expects parsed_output to be pipeline_json["parsed_output"] (already extracted).
    """
    ingredients = parsed_output.get("ingredients", [])
    for ing in ingredients:
        yield ing
        for sub in ing.get("sub_ingredients", []):
            yield sub


def _raw_name(ingredient: dict) -> str:
    return (ingredient.get("raw_text") or "").lower().strip()


# ── Step 1 — Allergen Detection ───────────────────────────────────────────────

def detect_allergens(parsed_output: dict) -> dict:
    """
    Cross-reference every enriched ingredient against the top 4 allergens.

    Priority:
      1. allergy_flag_info from db_data (DB match or GPT-4 fallback)
      2. Keyword scan on raw_text as a safety net

    Returns:
      {
        "milk": false,
        "egg": false,
        "peanut": false,
        "gluten": true,
        "ingredient_map": {
          "Milk Solids": ["Milk"],
          "Wheat Flour": ["Gluten"]
        }
      }
    """
    allergens_detected: set[str] = set()
    ingredient_map: dict[str, list[str]] = {}

    for ing in _iter_all_ingredients(parsed_output):
        raw = ing.get("raw_text", "")
        raw_lower = raw.lower()
        db_data = ing.get("db_data") or {}
        allergy_info = db_data.get("allergy_flag_info") or {}

        triggered: list[str] = []

        # Keyword scan on raw_text — this is the ground truth
        for allergen, keywords in _ALLERGEN_KEYWORDS.items():
            if any(kw in raw_lower for kw in keywords):
                triggered.append(allergen.capitalize())

        # Also check db_data allergy_flag_info, but ONLY accept if keyword-confirmed
        # This prevents GPT-4 hallucinated allergen flags (e.g. "egg" for garlic powder)
        if allergy_info.get("allergy_flag") and not triggered:
            allergy_type = (allergy_info.get("allergy_type") or "").lower()
            for allergen in TOP_4_ALLERGENS:
                if allergen in allergy_type:
                    allergen_keywords = _ALLERGEN_KEYWORDS.get(allergen, [])
                    if any(kw in raw_lower for kw in allergen_keywords):
                        triggered.append(allergen.capitalize())
                    else:
                        logger.warning(
                            "[Allergen] db_data flagged '%s' as %s but no keyword match — ignoring",
                            raw, allergen,
                        )

        if triggered:
            allergens_detected.update(triggered)
            ingredient_map[raw] = triggered

    return {
        "milk":    "Milk"    in allergens_detected,
        "egg":     "Egg"     in allergens_detected,
        "peanut":  "Peanut"  in allergens_detected,
        "gluten":  "Gluten"  in allergens_detected,
        "ingredient_map": ingredient_map,
    }


# ── Step 2 — Ingredient Signals ───────────────────────────────────────────────

def compute_signals(parsed_output: dict) -> dict:
    """
    Group ingredients by signal_category from db_data.

    signal_category values: "sugar" | "sodium" | "processed_fat" | null

    Sodium flagging rules:
      - Only flag if a salt ingredient is in top 3, OR multiple sodium sources exist
      - Raising agents, acidity regulators, anti-caking agents are excluded from sodium

    Returns:
      {
        "sugar":         { "count": 3, "ingredients": ["Sugar", "Glucose Syrup", ...] },
        "sodium":        { "count": 2, "ingredients": ["Salt", "Iodized Salt"] },
        "processed_fat": { "count": 1, "ingredients": ["Palm Oil"] }
      }
    """
    buckets: dict[str, list[str]] = {signal: [] for signal in SIGNAL_TYPES}

    # Track sodium sources with their ranks for post-filtering
    sodium_entries: list[tuple[str, int]] = []  # (raw_text, rank)

    for ing in _iter_all_ingredients(parsed_output):
        raw = ing.get("raw_text") or ""
        rank = ing.get("rank", 999)
        db_data = ing.get("db_data") or {}

        # Primary: use signal_category (GPT-4 fallback ingredients)
        signal = db_data.get("signal_category")

        # Fallback: derive signal from watchlist_category (DB-matched ingredients)
        if not signal:
            signal = _WATCHLIST_TO_SIGNAL.get(db_data.get("watchlist_category"))

        # Exclude raising agents and similar functional additives from sodium signal
        # (roles configured in config/analysis_rules.py → SODIUM_EXCLUDED_ROLES)
        if signal == "sodium":
            role = db_data.get("functional_role_db") or ing.get("functional_role") or ""
            tags = db_data.get("ingredient_tags") or ing.get("tags") or []
            if role in SODIUM_EXCLUDED_ROLES or "stabilizer_thickener" in tags or "functional" in tags:
                continue
            # Collect sodium entries for post-filtering
            if raw and raw not in [e[0] for e in sodium_entries]:
                sodium_entries.append((raw, rank))
            continue

        if signal in SIGNAL_TYPES and raw:
            if raw not in buckets[signal]:
                buckets[signal].append(raw)

    # Sodium flagging: only flag if salt in top N OR multiple salt sources
    # (thresholds configured in config/analysis_rules.py)
    salt_in_top_n = any(rank <= SODIUM_TOP_RANK_THRESHOLD for _, rank in sodium_entries)
    multiple_sources = len(sodium_entries) >= SODIUM_MIN_SOURCES_TO_FLAG

    if salt_in_top_n or multiple_sources:
        buckets["sodium"] = [raw for raw, _ in sodium_entries]

    return {
        signal: {"count": len(names), "ingredients": names}
        for signal, names in buckets.items()
    }


# ── Step 3 — Ingredient Category Distribution ─────────────────────────────────


# _WATCHLIST_TO_CATEGORY imported from config/analysis_rules.py


# _FUNCTIONAL_ROLE_TO_CATEGORY, CATEGORY_TYPES, _ALWAYS_NATURAL_KEYWORDS
# all imported from config/analysis_rules.py


def _is_always_natural(raw_text: str) -> bool:
    """Return True if the ingredient name matches a known-natural ingredient."""
    normalized = raw_text.lower().strip()
    if normalized in _ALWAYS_NATURAL_KEYWORDS:
        return True
    # Partial match for compound names like "Whole Wheat Flour (100%)"
    return any(keyword in normalized for keyword in _ALWAYS_NATURAL_KEYWORDS)


def _resolve_ingredient_category(db_data: dict, raw_text: str = "") -> str | None:
    """
    Resolve ingredient_category for an ingredient.
    Priority: always-natural override → stored ingredient_category → watchlist_category → functional_role_db
    """
    if raw_text and _is_always_natural(raw_text):
        return "natural"

    category = db_data.get("ingredient_category")
    if category in CATEGORY_TYPES:
        return category

    wc = db_data.get("watchlist_category")
    if wc and wc in _WATCHLIST_TO_CATEGORY:
        return _WATCHLIST_TO_CATEGORY[wc]

    role = db_data.get("functional_role_db")
    if role and role in _FUNCTIONAL_ROLE_TO_CATEGORY:
        return _FUNCTIONAL_ROLE_TO_CATEGORY[role]

    return None


def compute_category_distribution(parsed_output: dict) -> dict:
    """
    Count ingredients per category: natural, processed, functional_additive, artificial.
    Uses top-level ingredients only (sub-ingredients are part of their parent).

    Returns:
      {
        "natural":            { "count": 2, "ingredients": ["Wheat Fibre", "Orange Pulp"] },
        "processed":          { "count": 4, "ingredients": ["Sugar", ...] },
        "functional_additive":{ "count": 3, "ingredients": ["Emulsifiers", ...] },
        "artificial":         { "count": 2, "ingredients": ["Tartrazine", ...] },
        "unclassified":       { "count": 1, "ingredients": ["..."] }
      }
    """
    buckets: dict[str, list[str]] = {cat: [] for cat in CATEGORY_TYPES}

    ingredients = parsed_output.get("ingredients", [])
    for ing in ingredients:
        raw = ing.get("raw_text") or ""
        db_data = ing.get("db_data") or {}
        category = _resolve_ingredient_category(db_data, raw_text=raw)

        # Default to "processed" if category cannot be resolved — avoids an "Others" bucket
        bucket = category if category in CATEGORY_TYPES else "processed"
        if raw and raw not in buckets[bucket]:
            buckets[bucket].append(raw)

    return {
        cat: {"count": len(names), "ingredients": names}
        for cat, names in buckets.items()
        if names  # omit empty categories
    }


# ── Step 4 — Macronutrient Dominance ──────────────────────────────────────────

def compute_macro_dominance(parsed_output: dict) -> dict:
    """
    Infer dominant macronutrient profile from ingredient macro_profile data.
    Uses a rank-weighted approach: higher-ranked ingredients contribute more.

    Only top-level ingredients are used (sub-ingredients are excluded) since
    sub-ingredient ranks are fractional and their parent rank already represents
    their relative proportion.

    Returns:
      {
        "dominant":  "carbohydrate",
        "secondary": "fat",
        "tertiary":  "protein",
        "scores": { "carbohydrate": 0.65, "fat": 0.22, "protein": 0.10, "fiber": 0.03 }
      }
    """
    scores: dict[str, float] = {macro: 0.0 for macro in _TRACKED_MACROS}
    ingredients_by_macro: dict[str, list[str]] = {macro: [] for macro in _TRACKED_MACROS}

    ingredients = parsed_output.get("ingredients", [])
    for ing in ingredients:
        rank = ing.get("rank")
        if not isinstance(rank, (int, float)):
            continue

        # Higher rank number = lower proportion → weight = 1/rank
        rank_weight = 1.0 / rank
        raw = ing.get("raw_text") or ""
        db_data = ing.get("db_data") or {}
        macro_profile = db_data.get("macro_profile") or {}

        contributed: set[str] = set()
        for slot, slot_weight in _MACRO_SLOT_WEIGHTS.items():
            macro = macro_profile.get(slot)
            if macro in _TRACKED_MACROS:
                scores[macro] += rank_weight * slot_weight
                contributed.add(macro)

        for macro in contributed:
            if raw and raw not in ingredients_by_macro[macro]:
                ingredients_by_macro[macro].append(raw)

    # Normalise to proportions
    total = sum(scores.values())
    if total == 0:
        return {"dominant": None, "secondary": None, "tertiary": None, "scores": {}, "ingredients": {}}

    normalised = {macro: round(score / total, 4) for macro, score in scores.items()}

    ranked = sorted(normalised.items(), key=lambda x: x[1], reverse=True)
    dominant  = ranked[0][0] if ranked[0][1] > 0 else None
    secondary = ranked[1][0] if len(ranked) > 1 and ranked[1][1] > 0 else None
    tertiary  = ranked[2][0] if len(ranked) > 2 and ranked[2][1] > 0 else None

    return {
        "dominant":    dominant,
        "secondary":   secondary,
        "tertiary":    tertiary,
        "scores":      normalised,
        "ingredients": {macro: ingredients_by_macro[macro] for macro in _TRACKED_MACROS if ingredients_by_macro[macro]},
    }


# ── OpenAI client ─────────────────────────────────────────────────────────────

_openai_client: OpenAI = None


class AnalysisError(Exception):
    """Raised when GPT-4 persona analysis fails."""
    code = "ANALYSIS_ERROR"


def _get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise AnalysisError("OPENAI_API_KEY not set in .env")
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client


# ── Step 3 — Persona Analysis + Verdict ───────────────────────────────────────

def _build_ingredient_summary(parsed_output: dict) -> list[dict]:
    """
    Build a compact ingredient list for the GPT-4 prompt.
    Includes only the fields relevant for persona analysis.
    """
    summary = []
    ingredients = parsed_output.get("parsed_output", {}).get("ingredients", [])
    for ing in ingredients:
        db = ing.get("db_data") or {}
        summary.append({
            "rank":               ing.get("rank"),
            "raw_text":           ing.get("raw_text"),
            "functional_role":    ing.get("functional_role"),
            "ingredient_category": db.get("ingredient_category"),
            "signal_category":    db.get("signal_category"),
            "allergy_flag_info":  db.get("allergy_flag_info"),
            "watchlist_category": db.get("watchlist_category"),
        })
    return summary


def run_persona_analysis(parsed_output: dict, persona: str) -> tuple[list[dict], dict]:
    """
    Call GPT-4 to run persona-based analysis and produce a verdict.
    One GPT-4 call covers both Step 2 (watchlist) and Step 3 (verdict).

    Args:
        parsed_output: full pipeline JSON dict
        persona: "kids" | "clean_eating"

    Returns:
        (watchlist, verdict) — both as dicts ready to merge into pipeline JSON
    """
    if persona not in VALID_PERSONAS:
        raise AnalysisError(f"Invalid persona '{persona}'. Must be one of {VALID_PERSONAS}")

    ingredient_summary = _build_ingredient_summary(parsed_output)
    if not ingredient_summary:
        raise AnalysisError("No ingredients found in parsed_output for analysis")

    prompt = PERSONA_ANALYSIS_PROMPT.replace("{persona}", persona)
    prompt = prompt.replace("{ingredient_list}", json.dumps(ingredient_summary, indent=2))

    client = _get_openai_client()
    response = client.chat.completions.create(
        model="gpt-4o",
        temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}]
    )

    # Capture token usage
    usage = response.usage
    _last_persona_eval = {
        "token_usage": {
            "prompt_tokens": usage.prompt_tokens if usage else 0,
            "completion_tokens": usage.completion_tokens if usage else 0,
            "total_tokens": usage.total_tokens if usage else 0,
        },
        "llm_calls": 1,
    }

    content = response.choices[0].message.content
    if not content:
        raise AnalysisError("GPT-4 returned empty content for persona analysis")

    try:
        result = json.loads(content)
    except json.JSONDecodeError as e:
        raise AnalysisError(f"GPT-4 returned invalid JSON for persona analysis: {e}")

    watchlist_flat = result.get("watchlist", [])
    raw_signals = result.get("positive_signals", [])
    # Remap GPT-4 fields (signal_type/ingredient/insight) to frontend contract (signal/reason)
    positive_signals = [
        {
            "signal": s.get("ingredient") or s.get("signal_type", ""),
            "reason": s.get("insight") or s.get("reason", ""),
        }
        for s in raw_signals
    ]
    verdict = result.get("verdict", {})

    # Write watchlist_category back into each matched ingredient's db_data
    watchlist_map = {entry["ingredient"]: entry["watchlist_category"] for entry in watchlist_flat}
    for ing in parsed_output.get("parsed_output", {}).get("ingredients", []):
        raw = ing.get("raw_text", "")
        if raw in watchlist_map:
            if not isinstance(ing.get("db_data"), dict):
                ing["db_data"] = {}
            ing["db_data"]["watchlist_category"] = watchlist_map[raw]

    # Group flat watchlist by category → 1 entry per category with ingredients list
    grouped: dict[str, dict] = {}
    for entry in watchlist_flat:
        category = entry.get("watchlist_category")
        ingredient = entry.get("ingredient")
        reason = entry.get("reason", "")
        if category not in grouped:
            grouped[category] = {
                "watchlist_category": category,
                "ingredients": [],
                "reason": reason
            }
        grouped[category]["ingredients"].append(ingredient)

    watchlist = list(grouped.values())

    logger.info("[Analysis] Persona: %s | Flagged categories: %d | Positive signals: %d | Safe: %s", persona, len(watchlist), len(positive_signals), verdict.get('safe'))
    logger.debug("[Analysis] Tokens: %s", _last_persona_eval['token_usage']['total_tokens'])
    return watchlist, positive_signals, verdict, _last_persona_eval


# ── Step 5 — Additive Density (Kids persona only) ─────────────────────────────

def compute_additive_density(parsed_output: dict, persona: str) -> dict | None:
    """
    For the Kids persona, count functional additives and return a density rating.
    Returns None for non-Kids personas.

    Density levels:
      0       → "none"   (clean product)
      1-2     → "low"
      3-4     → "medium"
      5+      → "high"
    """
    if persona != "kids":
        return None

    ingredients = parsed_output.get("parsed_output", {}).get("ingredients", [])
    additive_names: list[str] = []

    for ing in ingredients:
        raw = ing.get("raw_text", "")
        db_data = ing.get("db_data") or {}
        tags = set(db_data.get("ingredient_tags") or [])
        role = db_data.get("functional_role") or ""
        category = db_data.get("ingredient_category") or ""

        is_additive = (
            bool(tags & _ADDITIVE_TAGS)
            or role in _ADDITIVE_ROLES
            or category == "artificial"
        )

        if is_additive and raw and raw not in additive_names:
            additive_names.append(raw)

    count = len(additive_names)
    if count == 0:
        density = "none"
    elif count <= 2:
        density = "low"
    elif count <= 4:
        density = "medium"
    else:
        density = "high"

    return {
        "count": count,
        "density": density,
        "additives": additive_names,
    }


# ── Step 6 — Banned Ingredient Detection (rule-based) ─────────────────────────

def detect_banned_ingredients(parsed_output: dict) -> list[dict]:
    """
    Check every ingredient against the FSSAI banned list.
    Returns a list of watchlist entries (same shape as GPT-4 watchlist entries).
    Only flags if the ingredient matches a keyword in FSSAI_BANNED_INGREDIENTS.
    Returns [] if the banned list is empty or no match found.
    """
    if not FSSAI_BANNED_INGREDIENTS:
        return []

    flagged: list[dict] = []
    seen: set[str] = set()

    for ing in _iter_all_ingredients(parsed_output):
        raw = ing.get("raw_text") or ""
        raw_lower = raw.lower()

        for banned in FSSAI_BANNED_INGREDIENTS:
            if any(kw in raw_lower for kw in banned.get("keywords", [])):
                category_key = banned["name"]
                if category_key not in seen:
                    seen.add(category_key)
                    flagged.append({
                        "watchlist_category": "banned_ingredient",
                        "ingredients": [raw],
                        "reason": banned.get("reason", "Banned under FSSAI regulations"),
                    })
                else:
                    # Add to existing entry for this banned ingredient
                    for entry in flagged:
                        if entry["reason"] == banned.get("reason"):
                            if raw not in entry["ingredients"]:
                                entry["ingredients"].append(raw)
                break

    return flagged


def detect_refined_grains_top5(parsed_output: dict) -> list[dict]:
    """
    Detect refined grains in top positions and return watchlist entries.

    Rules (from analysis.md):
      - Refined grain in top 3 → Flag as `highly_processed`
      - 2 or more refined grains anywhere → Flag as `highly_processed`
      - Single refined grain at rank 4+ → Do NOT flag

    Refined grain keywords: maida, refined wheat flour, white rice flour,
    corn flour (as base starch), refined semolina.

    Returns a list of watchlist entries matching the shape of GPT-4 entries.

    Keywords and thresholds configured in config/analysis_rules.py.
    """
    ingredients = parsed_output.get("ingredients", [])
    refined_grain_matches = []
    refined_grain_top_n = []

    # Find all refined grains and check if any are in top N
    # (threshold from config/analysis_rules.py → REFINED_GRAIN_TOP_RANK_THRESHOLD)
    for ing in ingredients:
        rank = ing.get("rank", 999)
        raw_text = (ing.get("raw_text") or "").lower().strip()

        is_refined_grain = any(kw in raw_text for kw in REFINED_GRAIN_KEYWORDS)

        if is_refined_grain:
            refined_grain_matches.append((rank, raw_text))
            if rank <= REFINED_GRAIN_TOP_RANK_THRESHOLD:
                refined_grain_top_n.append(raw_text)

    # Apply flagging rules
    flagged: list[dict] = []

    # Rule A: Refined grain in top N
    if refined_grain_top_n:
        flagged.append({
            "watchlist_category": "highly_processed",
            "ingredients": refined_grain_top_n,
            "reason": "Refined grain - stripped of fibre and nutrients",
        })

    # Rule B: N+ refined grains anywhere (and not already flagged by Rule A)
    if len(refined_grain_matches) >= REFINED_GRAIN_MIN_COUNT_TO_FLAG and not refined_grain_top_n:
        all_refined = [text for _, text in refined_grain_matches]
        flagged.append({
            "watchlist_category": "highly_processed",
            "ingredients": all_refined,
            "reason": f"{len(all_refined)} refined grain ingredients detected",
        })

    return flagged


# ── Step 7 — Ingredient Complexity ────────────────────────────────────────────

def compute_ingredient_complexity(parsed_output: dict) -> dict:
    """
    Count top-level ingredients and return a complexity level.

    Thresholds:
      <= 5  → "simple"
      6-10  → "moderate"
      > 10  → "complex"
    """
    ingredients = parsed_output.get("parsed_output", {}).get("ingredients", [])
    count = len(ingredients)

    # Thresholds from config/analysis_rules.py → COMPLEXITY_THRESHOLDS
    if count <= COMPLEXITY_THRESHOLDS["simple"]:
        level = "simple"
    elif count <= COMPLEXITY_THRESHOLDS["moderate"]:
        level = "moderate"
    else:
        level = "complex"

    return {"count": count, "level": level}


# ── Main entry point ──────────────────────────────────────────────────────────

def run_analysis(pipeline_json: dict, persona: str) -> dict:
    """
    Run all analysis steps on the enriched pipeline JSON.
    Adds 'allergens', 'signals', and 'verdict' sections in place.
    Returns the updated pipeline JSON.

    Args:
        pipeline_json: full pipeline JSON after DB match + GPT-4 fallback
        persona: "kids" | "clean_eating"
    """
    parsed_output = pipeline_json.get("parsed_output", {})

    # Step 1 — Allergen Detection (rule-based)
    pipeline_json["allergens"] = detect_allergens(parsed_output)

    # Step 2 — Ingredient Signals (rule-based)
    pipeline_json["signals"] = compute_signals(parsed_output)

    # Step 3 — Ingredient Category Distribution (rule-based)
    pipeline_json["category_distribution"] = compute_category_distribution(parsed_output)

    # Step 5 — Macronutrient Dominance (rule-based, ingredient-based inference)
    pipeline_json["macro_dominance"] = compute_macro_dominance(parsed_output)

    # Step 5b — Additive Density (Kids only, rule-based)
    pipeline_json["additive_density"] = compute_additive_density(parsed_output, persona)

    # Step 5c — Ingredient Complexity (rule-based)
    pipeline_json["ingredient_complexity"] = compute_ingredient_complexity(pipeline_json)

    # Step 6 — Persona Analysis + Verdict (GPT-4)
    watchlist, positive_signals, verdict, _persona_eval = run_persona_analysis(pipeline_json, persona)

    # Step 6b — Banned Ingredient Detection (rule-based, merged into watchlist)
    banned_entries = detect_banned_ingredients(parsed_output)
    watchlist = watchlist + banned_entries

    # Step 6c — Refined Grains in Top 5 Detection (rule-based, merged into watchlist)
    refined_grain_entries = detect_refined_grains_top5(parsed_output)
    watchlist = watchlist + refined_grain_entries

    pipeline_json["watchlist"] = watchlist
    pipeline_json["positive_signals"] = positive_signals
    pipeline_json["verdict"] = verdict

    return pipeline_json
