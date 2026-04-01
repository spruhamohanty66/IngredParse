"""
Nutrition Validation Service — Post-Parser
Validates the structured nutrition output from nutrition_parser_service.py.

Runs AFTER parsing, BEFORE analysis.
If validation fails → re-call parser with feedback (max 1 retry).

Checks:
  a. Nutrient-Value Pairing — name + value + unit present
  b. Valid Unit Check       — only g, mg, kcal, % allowed
  c. Numeric Validation     — values must be numeric and non-negative
  d. Duplicate Detection    — same nutrient appearing twice
  e. Cross-Field Consistency — sugar ≤ total carbs, sat fat ≤ total fat
  f. Format Consistency     — no mixed units for same nutrient
  Serving Details Validation — at least serving_size or servings_per_pack must exist

Design:
  - Don't overuse AI — validation is rule-based
  - On fail: feed specific errors back to parser for 1 retry
  - If retry also fails: proceed with best-effort + flag in logs
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# ── Valid units (suffix in field names maps to expected unit) ─────────────────

_FIELD_UNIT_MAP = {
    "_g":   "g",
    "_mg":  "mg",
    "_mcg": "mcg",
}

# Calories has no unit suffix — it's kcal
_CALORIE_FIELD = "calories"

# ── Cross-field consistency rules ────────────────────────────────────────────
# (child_field, parent_field, rule_description)
_CONSISTENCY_RULES = [
    ("total_sugar_g",    "total_carbs_g",    "Sugar must be ≤ Total Carbs"),
    ("added_sugar_g",    "total_sugar_g",     "Added Sugar must be ≤ Total Sugar"),
    ("added_sugar_g",    "total_carbs_g",     "Added Sugar must be ≤ Total Carbs"),
    ("saturated_fat_g",  "total_fat_g",       "Saturated Fat must be ≤ Total Fat"),
    ("trans_fat_g",      "total_fat_g",       "Trans Fat must be ≤ Total Fat"),
    ("fiber_g",          "total_carbs_g",     "Fiber must be ≤ Total Carbs"),
]


# ── Validation Checks ────────────────────────────────────────────────────────

def _check_nutrient_value_pairing(nutrient_block: dict, block_name: str) -> list[str]:
    """
    a. Nutrient-Value Pairing
    Each nutrient field must have a numeric value or be explicitly null.
    Non-null values must be numbers.
    """
    issues = []
    for field, value in nutrient_block.items():
        if value is None:
            continue  # Null/absent is valid
        if not isinstance(value, (int, float)):
            issues.append(
                f"[{block_name}] '{field}' has non-numeric value: {value!r}"
            )
    return issues


def _check_valid_units(nutrient_block: dict, block_name: str) -> list[str]:
    """
    b. Valid Unit Check
    Field name suffixes must match allowed units: _g (grams), _mg (milligrams),
    _mcg (micrograms). Calories field has no unit suffix.
    Unknown suffixes indicate a schema violation.
    """
    issues = []
    allowed_suffixes = list(_FIELD_UNIT_MAP.keys())

    for field in nutrient_block:
        if field == _CALORIE_FIELD:
            continue
        has_valid_suffix = any(field.endswith(suffix) for suffix in allowed_suffixes)
        if not has_valid_suffix:
            issues.append(
                f"[{block_name}] '{field}' has unknown unit suffix. "
                f"Expected one of: {', '.join(allowed_suffixes)}"
            )
    return issues


def _check_numeric_non_negative(nutrient_block: dict, block_name: str) -> list[str]:
    """
    c. Numeric Validation
    All non-null values must be numeric and non-negative.
    """
    issues = []
    for field, value in nutrient_block.items():
        if value is None:
            continue
        if not isinstance(value, (int, float)):
            continue  # Already caught in pairing check
        if value < 0:
            issues.append(
                f"[{block_name}] '{field}' has negative value: {value}"
            )
    return issues


def _check_duplicates(nutrient_block: dict, block_name: str) -> list[str]:
    """
    d. Duplicate Detection
    Since we use a dict, true duplicates can't exist at the JSON level.
    But we check for semantically duplicate fields (e.g., 'sugar_g' and 'total_sugar_g').
    """
    issues = []
    # Normalize field names to detect semantic duplicates
    seen_bases = {}
    for field in nutrient_block:
        # Strip unit suffix to get base nutrient name
        base = field
        for suffix in _FIELD_UNIT_MAP:
            if field.endswith(suffix):
                base = field[: -len(suffix)]
                break
        if base in seen_bases:
            issues.append(
                f"[{block_name}] Possible duplicate: '{field}' and '{seen_bases[base]}' "
                f"may refer to the same nutrient"
            )
        else:
            seen_bases[base] = field
    return issues


def _check_cross_field_consistency(nutrient_block: dict, block_name: str) -> list[str]:
    """
    e. Cross-Field Consistency
    Child nutrient must be ≤ parent nutrient (e.g., sugar ≤ total carbs).
    Only checked when both fields have non-null values.
    """
    issues = []
    for child_field, parent_field, rule_desc in _CONSISTENCY_RULES:
        child_val = nutrient_block.get(child_field)
        parent_val = nutrient_block.get(parent_field)

        if child_val is None or parent_val is None:
            continue
        if not isinstance(child_val, (int, float)) or not isinstance(parent_val, (int, float)):
            continue

        if child_val > parent_val:
            issues.append(
                f"[{block_name}] Inconsistency: {child_field}={child_val} > "
                f"{parent_field}={parent_val}. {rule_desc}"
            )
    return issues


def _check_format_consistency(per_serving: dict, per_100g: dict) -> list[str]:
    """
    f. Format Consistency
    Same nutrient should not have vastly different magnitudes between per_serving
    and per_100g that suggest unit mismatch (e.g., 10g vs 0.01kg).
    If serving size is known, per_100g should be >= per_serving (for serving < 100g).
    """
    issues = []
    for field in per_serving:
        sv = per_serving.get(field)
        hg = per_100g.get(field)
        if sv is None or hg is None:
            continue
        if not isinstance(sv, (int, float)) or not isinstance(hg, (int, float)):
            continue
        if sv == 0 and hg == 0:
            continue

        # If per_100g value is more than 100x the per_serving value,
        # likely a unit mismatch (e.g., mg vs g)
        if sv > 0 and hg / sv > 100:
            issues.append(
                f"'{field}': per_serving={sv} vs per_100g={hg} — "
                f"ratio is {hg / sv:.0f}x, possible unit mismatch"
            )
    return issues


def _check_serving_details(nutrition: dict) -> list[str]:
    """
    Serving Details Validation
    At least one of serving_size or servings_per_pack must exist.
    """
    serving_size = nutrition.get("serving_size")
    servings_per_pack = nutrition.get("servings_per_pack")

    if not serving_size and servings_per_pack is None:
        return [
            "Neither serving_size nor servings_per_pack is present. "
            "At least one must be extracted from the nutrition label."
        ]
    return []


# ── Public API ───────────────────────────────────────────────────────────────

def validate_nutrition(nutrition: dict) -> dict:
    """
    Validate the parsed nutrition output.

    Args:
        nutrition: The nutrition dict from nutrition_parser_service.py containing
                   per_serving, per_100g, serving_size, servings_per_pack, etc.

    Returns:
        Validation result dict:
        {
            "valid": bool,
            "issues": [str],
            "feedback_for_parser": str | None,
        }

        - valid: True if all checks pass
        - issues: List of human-readable issue descriptions
        - feedback_for_parser: Formatted string to append to parser prompt for retry.
                               None if validation passed.
    """
    per_serving = nutrition.get("per_serving", {})
    per_100g = nutrition.get("per_100g", {})
    all_issues: list[str] = []

    # a. Nutrient-Value Pairing
    all_issues.extend(_check_nutrient_value_pairing(per_serving, "per_serving"))
    all_issues.extend(_check_nutrient_value_pairing(per_100g, "per_100g"))

    # b. Valid Unit Check
    all_issues.extend(_check_valid_units(per_serving, "per_serving"))
    all_issues.extend(_check_valid_units(per_100g, "per_100g"))

    # c. Numeric Validation
    all_issues.extend(_check_numeric_non_negative(per_serving, "per_serving"))
    all_issues.extend(_check_numeric_non_negative(per_100g, "per_100g"))

    # d. Duplicate Detection
    all_issues.extend(_check_duplicates(per_serving, "per_serving"))
    all_issues.extend(_check_duplicates(per_100g, "per_100g"))

    # e. Cross-Field Consistency
    all_issues.extend(_check_cross_field_consistency(per_serving, "per_serving"))
    all_issues.extend(_check_cross_field_consistency(per_100g, "per_100g"))

    # f. Format Consistency
    all_issues.extend(_check_format_consistency(per_serving, per_100g))

    # Serving Details
    all_issues.extend(_check_serving_details(nutrition))

    is_valid = len(all_issues) == 0

    # Build feedback for parser retry
    feedback = None
    if not is_valid:
        feedback_lines = [
            "VALIDATION FEEDBACK — The previous extraction had these issues:",
            *[f"  - {issue}" for issue in all_issues],
            "",
            "Please re-extract nutrition data from the OCR text, fixing these issues.",
            "Ensure all values are numeric and non-negative.",
            "Ensure sugar ≤ total carbs and saturated fat ≤ total fat.",
            "Ensure serving_size or servings_per_pack is present.",
            "Use consistent units: g, mg, mcg for nutrients, kcal for calories.",
        ]
        feedback = "\n".join(feedback_lines)

    # Log
    if is_valid:
        logger.info("[NutritionValidation] PASSED")
    else:
        logger.warning(
            "[NutritionValidation] FAILED | %d issues: %s",
            len(all_issues), "; ".join(all_issues),
        )

    return {
        "valid": is_valid,
        "issues": all_issues,
        "feedback_for_parser": feedback,
    }
