"""
Ingredient Validation Service — Post-Parser
Validates the structured ingredient output from parser_service.py.

Runs AFTER parsing, BEFORE analysis.
If validation fails → re-call parser with feedback (max 1 retry).

Checks:
  a. Structure Check — ingredients separated by , ; and &
  b. Count Check    — minimum 3 ingredients required

Design:
  - Don't overuse AI — validation is rule-based
  - On fail: feed specific errors back to parser for 1 retry
  - If retry also fails: proceed with best-effort + flag in logs
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

MIN_INGREDIENT_COUNT = 3


# ── Validation Checks ────────────────────────────────────────────────────────

def _check_structure(ingredients: list[dict]) -> list[str]:
    """
    a. Structure Check
    Each ingredient must have at minimum: rank and raw_text.
    raw_text must be a non-empty string.
    """
    issues = []
    for i, ing in enumerate(ingredients):
        raw = ing.get("raw_text")
        if not raw or not isinstance(raw, str) or not raw.strip():
            issues.append(f"Ingredient at position {i + 1} has missing or empty raw_text")
        if ing.get("rank") is None:
            issues.append(f"Ingredient '{raw or f'position {i + 1}'}' has no rank assigned")
    return issues


def _check_count(ingredients: list[dict]) -> list[str]:
    """
    b. Count Check
    Minimum 3 ingredients required for a packaged food product.
    """
    count = len(ingredients)
    if count < MIN_INGREDIENT_COUNT:
        return [
            f"Only {count} ingredient(s) extracted. "
            f"Packaged foods typically have at least {MIN_INGREDIENT_COUNT} ingredients. "
            f"Re-check the OCR text for missed ingredients separated by commas, semicolons, 'and', or '&'."
        ]
    return []


# ── Public API ───────────────────────────────────────────────────────────────

def validate_ingredients(parsed_output: dict) -> dict:
    """
    Validate the parsed ingredient output.

    Args:
        parsed_output: The "parsed_output" dict from parser_service.py containing
                       "ingredients" list and other metadata.

    Returns:
        Validation result dict:
        {
            "valid": bool,
            "ingredient_count": int,
            "issues": [str],
            "feedback_for_parser": str | None,
        }

        - valid: True if all checks pass
        - issues: List of human-readable issue descriptions
        - feedback_for_parser: Formatted string to append to parser prompt for retry.
                               None if validation passed.
    """
    ingredients = parsed_output.get("ingredients", [])
    all_issues: list[str] = []

    # Run all checks
    all_issues.extend(_check_structure(ingredients))
    all_issues.extend(_check_count(ingredients))

    is_valid = len(all_issues) == 0
    ingredient_count = len(ingredients)

    # Build feedback string for parser retry
    feedback = None
    if not is_valid:
        feedback_lines = [
            "VALIDATION FEEDBACK — The previous extraction had these issues:",
            *[f"  - {issue}" for issue in all_issues],
            "",
            "Please re-extract ingredients from the OCR text, fixing these issues.",
            f"Ensure at least {MIN_INGREDIENT_COUNT} ingredients are extracted.",
            "Look for ingredients separated by commas (,), semicolons (;), 'and', or '&'.",
            "Every ingredient must have a rank and raw_text.",
        ]
        feedback = "\n".join(feedback_lines)

    # Log
    if is_valid:
        logger.info(
            "[IngredientValidation] PASSED | %d ingredients extracted",
            ingredient_count,
        )
    else:
        logger.warning(
            "[IngredientValidation] FAILED | %d ingredients | %d issues: %s",
            ingredient_count, len(all_issues), "; ".join(all_issues),
        )

    return {
        "valid": is_valid,
        "ingredient_count": ingredient_count,
        "issues": all_issues,
        "feedback_for_parser": feedback,
    }
