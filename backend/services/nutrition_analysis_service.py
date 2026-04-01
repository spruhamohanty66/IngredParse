"""
Nutrition Analysis Service — Rule-Based
Applies persona-specific threshold overrides and generates a nutrition verdict.
Runs after nutrition_parser_service.py has produced per_100g values and standard flags.

No AI calls — pure rule-based logic from analysis.md.
"""

# ── Persona-specific threshold overrides (per 100g) ───────────────────────────
# Only fields that DIFFER from the standard thresholds are listed here.
# Standard thresholds are already applied by nutrition_parser_service.py.
#
# Standard (reference):
#   high_sugar    : total_sugar_g   > 22.5g
#   high_sodium   : sodium_mg       > 600mg
#   high_sat_fat  : saturated_fat_g > 5.0g
#   high_trans_fat: trans_fat_g     > 0.2g
#   low_fiber     : fiber_g         < 3.0g
#   low_protein   : protein_g       < 5.0g

_PERSONA_THRESHOLDS = {
    "kids": {
        # Stricter sodium for children — but plain salt in small snacks is acceptable
        "high_sodium":    ("sodium_mg",       "gt", 800.0),
        # Zero tolerance for trans fat
        "high_trans_fat": ("trans_fat_g",     "gt", 0.0),
        # Calorie density flag (kids-specific, not in standard flags)
        "high_calories":  ("calories",        "gt", 400.0),
    },
    "clean_eating": {
        # Stricter sugar threshold
        "high_sugar":     ("total_sugar_g",   "gt", 10.0),
        # Stricter sodium threshold
        "high_sodium":    ("sodium_mg",       "gt", 400.0),
        # Stricter saturated fat threshold
        "high_sat_fat":   ("saturated_fat_g", "gt", 3.0),
        # Zero tolerance for trans fat
        "high_trans_fat": ("trans_fat_g",     "gt", 0.0),
    },
}

# Flags that count as HIGH-RISK for verdict purposes (per persona)
_HIGH_RISK_FLAGS = {
    "kids":         {"high_sugar", "high_sodium", "high_sat_fat", "high_trans_fat"},
    "clean_eating": {"high_sugar", "high_sodium", "high_sat_fat", "high_trans_fat"},
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _apply_persona_flags(per_100g: dict, persona: str) -> dict:
    """
    Recompute flags using persona-specific thresholds.

    For flags not overridden by the persona, the standard flag value is preserved
    from the parser output. For overridden flags, recompute from per_100g values.

    Returns a new flags dict — does not mutate the input.
    """
    overrides = _PERSONA_THRESHOLDS.get(persona, {})
    flags = {}

    for flag, (field, operator, threshold) in overrides.items():
        value = per_100g.get(field)
        if value is None:
            flags[flag] = None
        elif operator == "gt":
            flags[flag] = value > threshold
        elif operator == "lt":
            flags[flag] = value < threshold
        else:
            flags[flag] = None

    return flags


def _build_verdict(persona_flags: dict, persona: str, daily_impact: dict = None) -> dict:
    """
    Determine the nutrition verdict based on persona flags AND daily intake impact.

    Daily Intake Impact Checks:
      - If sodium/fat/added_sugar EXCEED daily limit (>100%) → major concern
      - If vitamins/minerals PRESENT and MEET/EXCEED daily limit (>100%) → positive highlight

    Verdict tiers (from analysis.md):

    Not Recommended — any of:
      - high_trans_fat is True
      - high_sugar AND high_sodium are both True
      - high_sat_fat AND high_sugar are both True
      - Exceeds daily limit on MULTIPLE bad nutrients (sodium + sugar, etc)

    Highly Recommended — all of:
      - All high-risk flags are False (not null, not True)
      - low_protein is not True
      - Does not exceed daily limits on bad nutrients

    Moderately Recommended — all other cases
    """
    def is_true(flag: str) -> bool:
        return persona_flags.get(flag) is True

    def is_false(flag: str) -> bool:
        return persona_flags.get(flag) is False

    # Calculate daily impact scores for bad nutrients
    exceeds_limit_count = 0
    if daily_impact:
        # Check if exceeds daily limits on BAD nutrients
        if daily_impact.get("sodium_exceeds_daily"): exceeds_limit_count += 1
        if daily_impact.get("added_sugar_exceeds_daily"): exceeds_limit_count += 1
        if daily_impact.get("fat_exceeds_daily"): exceeds_limit_count += 1

    # Not Recommended conditions
    if (
        is_true("high_trans_fat")
        or (is_true("high_sugar") and is_true("high_sodium"))
        or (is_true("high_sat_fat") and is_true("high_sugar"))
        or exceeds_limit_count >= 2  # Multiple bad nutrients exceed daily limit
    ):
        label = "not_recommended"
        safe  = False

    # Highly Recommended — zero high-risk flags AND protein is not low AND stays within limits
    elif (
        all(is_false(f) for f in _HIGH_RISK_FLAGS[persona])
        and not is_true("low_protein")
        and exceeds_limit_count == 0
    ):
        label = "highly_recommended"
        safe  = True

    # Everything else
    else:
        label = "moderately_recommended"
        safe  = True

    highlights = _build_highlights(persona_flags, persona, daily_impact)
    summary    = _build_summary(label, persona_flags, persona, daily_impact)

    return {
        "persona": persona,
        "safe":    safe,
        "label":   label,
        "summary": summary,
        "highlights": highlights,
    }


def _build_highlights(persona_flags: dict, persona: str, daily_impact: dict = None) -> list:
    """
    Return up to 3 highlight items combining:
      1. Flagged nutrients from persona analysis (negative)
      2. Daily intake exceedances (negative)
      3. Vitamins/minerals meeting daily limits (positive)

    Priority: Bad nutrients first, then positive nutrients.
    """
    _NEGATIVE_MESSAGES = {
        "high_trans_fat": "Trans fat detected — limit consumption",
        "high_sugar":     "High sugar content per 100g",
        "high_sodium":    "High sodium content per 100g",
        "high_sat_fat":   "High saturated fat per 100g",
        "high_calories":  "High calorie density per 100g",
        "low_fiber":      "Fiber — absent or minimal in this product",
        "low_protein":    "Protein — absent or minimal in this product",
        "sodium_exceeds": "Sodium exceeds daily limit for serving",
        "sugar_exceeds":  "Added sugar exceeds daily limit for serving",
        "fat_exceeds":    "Total fat exceeds daily limit for serving",
    }

    _POSITIVE_MESSAGES = {
        "calcium_sufficient":   "Good source of calcium",
        "iron_sufficient":      "Good source of iron",
        "vitamin_d_sufficient": "Good source of vitamin D",
        "vitamin_c_sufficient": "Good source of vitamin C",
        "fiber_sufficient":     "Good source of dietary fiber",
        "protein_sufficient":   "Good source of protein",
    }

    highlights = []

    # Priority 1: Negative nutrients flagged by persona analysis
    priority_negative = [
        "high_trans_fat", "high_sugar", "high_sodium",
        "high_sat_fat", "high_calories", "low_fiber", "low_protein",
    ]
    for flag in priority_negative:
        if persona_flags.get(flag) is True:
            highlights.append({
                "nutrient": flag,
                "reason":   _NEGATIVE_MESSAGES.get(flag, flag),
            })
        if len(highlights) == 3:
            return highlights

    # Priority 2: Daily intake exceedances (negative)
    if daily_impact:
        if daily_impact.get("sodium_exceeds_daily"):
            highlights.append({
                "nutrient": "sodium_exceeds",
                "reason":   _NEGATIVE_MESSAGES["sodium_exceeds"],
            })
        if daily_impact.get("sugar_exceeds_daily") and len(highlights) < 3:
            highlights.append({
                "nutrient": "sugar_exceeds",
                "reason":   _NEGATIVE_MESSAGES["sugar_exceeds"],
            })
        if daily_impact.get("fat_exceeds_daily") and len(highlights) < 3:
            highlights.append({
                "nutrient": "fat_exceeds",
                "reason":   _NEGATIVE_MESSAGES["fat_exceeds"],
            })

    # Only add positive highlights if no major concerns
    if len(highlights) < 2 and daily_impact:
        if daily_impact.get("calcium_sufficient"):
            highlights.append({
                "nutrient": "calcium",
                "reason":   _POSITIVE_MESSAGES["calcium_sufficient"],
            })
        if daily_impact.get("iron_sufficient") and len(highlights) < 3:
            highlights.append({
                "nutrient": "iron",
                "reason":   _POSITIVE_MESSAGES["iron_sufficient"],
            })
        if daily_impact.get("vitamin_d_sufficient") and len(highlights) < 3:
            highlights.append({
                "nutrient": "vitamin_d",
                "reason":   _POSITIVE_MESSAGES["vitamin_d_sufficient"],
            })

    return highlights[:3]  # Return max 3


def _build_summary(label: str, persona_flags: dict, persona: str, daily_impact: dict = None) -> str:
    """
    Generate a one-sentence plain-language summary (max 20 words) including daily intake info.
    """
    if label == "not_recommended":
        if persona_flags.get("high_trans_fat") is True:
            return "Contains trans fat — best consumed occasionally."

        daily_concerns = []
        if daily_impact:
            if daily_impact.get("sodium_exceeds_daily"):
                daily_concerns.append("sodium")
            if daily_impact.get("added_sugar_exceeds_daily"):
                daily_concerns.append("sugar")
            if daily_impact.get("fat_exceeds_daily"):
                daily_concerns.append("fat")

        if len(daily_concerns) >= 2:
            return f"Exceeds daily limits for {' and '.join(daily_concerns)} — limit consumption."

        if persona_flags.get("high_sugar") and persona_flags.get("high_sodium"):
            return "High sugar and sodium levels — best consumed occasionally."
        if persona_flags.get("high_sat_fat") and persona_flags.get("high_sugar"):
            return "High saturated fat and sugar — not recommended."

    if label == "highly_recommended":
        return "Good nutritional profile — low in concerning nutrients."

    # Moderately recommended — describe the dominant concern
    concerns = [f for f in ["high_sugar", "high_sodium", "high_sat_fat"] if persona_flags.get(f) is True]

    # Also check daily limits
    if daily_impact:
        if daily_impact.get("sodium_exceeds_daily") and "sodium" not in str(concerns):
            concerns.append("high_sodium")
        if daily_impact.get("added_sugar_exceeds_daily") and "sugar" not in str(concerns):
            concerns.append("high_sugar")

    if concerns:
        concern_str = " and ".join(c.replace("high_", "").replace("_", " ") for c in concerns[:2])
        return f"Moderate {concern_str} levels — occasional consumption recommended."

    return "Acceptable nutritional profile with some areas to monitor."


# ── Main entry point ───────────────────────────────────────────────────────────

# ── Daily limits (WHO-aligned) ────────────────────────────────────────────────

_DAILY_LIMITS = {
    "kids": {
        "sodium_mg": 1500,
        "total_fat_g": 50,
        "added_sugar_g": 20,
        "calcium_mg": 1000,
        "iron_mg": 8,
        "vitamin_d_mcg": 15,
    },
    "clean_eating": {
        "sodium_mg": 2000,
        "total_fat_g": 70,
        "added_sugar_g": 25,
        "calcium_mg": 1000,
        "iron_mg": 8,
        "vitamin_d_mcg": 15,
    },
}


def _calculate_daily_impact(per_serving: dict, persona: str) -> dict:
    """
    Compare per-serving nutrition against daily limits.
    Returns dict indicating which nutrients exceed or meet daily limits.
    """
    limits = _DAILY_LIMITS.get(persona, _DAILY_LIMITS["clean_eating"])
    impact = {}

    # Bad nutrients — exceeding is negative
    impact["sodium_exceeds_daily"] = (per_serving.get("sodium_mg") or 0) > limits.get("sodium_mg", 2000)
    impact["fat_exceeds_daily"] = (per_serving.get("total_fat_g") or 0) > limits.get("total_fat_g", 70)
    impact["added_sugar_exceeds_daily"] = (per_serving.get("added_sugar_g") or 0) > limits.get("added_sugar_g", 25)

    # Good nutrients — meeting or exceeding is positive
    calcium = per_serving.get("calcium_mg") or 0
    iron = per_serving.get("iron_mg") or 0
    vitamin_d = per_serving.get("vitamin_d_mcg") or 0

    impact["calcium_sufficient"] = calcium >= (limits.get("calcium_mg", 1000) * 0.5)  # 50% or more
    impact["iron_sufficient"] = iron >= (limits.get("iron_mg", 8) * 0.5)
    impact["vitamin_d_sufficient"] = vitamin_d >= (limits.get("vitamin_d_mcg", 15) * 0.5)

    return impact


def analyse_nutrition(nutrition: dict, persona: str) -> dict:
    """
    Apply persona-specific nutrition analysis and generate a verdict.

    Args:
        nutrition: Output of nutrition_parser_service.parse_nutrition() —
                   must contain per_serving, per_100g and standard flags.
        persona:   "kids" | "clean_eating"

    Returns:
        Dict with:
          - persona_flags : recomputed flags using persona-specific thresholds
          - verdict       : label, safe, summary, highlights
    """
    per_serving     = nutrition.get("per_serving") or {}
    per_100g        = nutrition.get("per_100g") or {}
    standard_flags  = nutrition.get("flags") or {}

    # Start from standard flags, then override with persona-specific thresholds
    persona_flags = dict(standard_flags)
    persona_flags.update(_apply_persona_flags(per_100g, persona))

    # Calculate daily impact
    daily_impact = _calculate_daily_impact(per_serving, persona)

    # Build verdict with daily impact info
    verdict = _build_verdict(persona_flags, persona, daily_impact)

    return {
        "persona_flags": persona_flags,
        "verdict":       verdict,
    }
