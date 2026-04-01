"""
Text Separator Service — Splits combined OCR text into ingredient and nutrition sections.

When both labels are present in one image, this service:
  1. Identifies the ingredients section (starts with "Ingredients" keyword)
  2. Identifies the nutrition section (starts with "Nutritional Information", "Nutrition Facts", etc.)
  3. Extracts each section separately for targeted parsing
"""

import re


class TextSeparatorError(Exception):
    """Raised when text separation fails."""
    code = "TEXT_SEPARATOR_ERROR"


# Keywords that mark the start of ingredient or nutrition sections
_INGREDIENT_KEYWORDS = [
    "ingredients",
    "ingredient list",
    "contains",
    "product composition",
]

_NUTRITION_KEYWORDS = [
    "nutritional information",
    "nutrition facts",
    "nutrition label",
    "nutrient information",
    "nutritional value",
    "per serving",
    "per 100g",
    "energy",
    "calories",
]


def _find_section_start(text: str, keywords: list[str]) -> int | None:
    """
    Find the line number where a section starts (based on keywords).

    Returns the index of the line containing the first matching keyword,
    or None if not found.
    """
    lines = text.split('\n')
    for idx, line in enumerate(lines):
        line_lower = line.lower().strip()
        for keyword in keywords:
            if keyword in line_lower:
                return idx
    return None


def separate_text(ocr_text: str) -> dict:
    """
    Separate full OCR text into ingredient and nutrition sections.

    Args:
        ocr_text: Full OCR-extracted text containing both sections.

    Returns:
        {
            "ingredient_text": "Water, Sugar, ...",
            "nutrition_text": "Nutritional Information...",
            "has_ingredients": bool,
            "has_nutrition": bool,
        }

    Raises:
        TextSeparatorError: If separation fails.
    """
    if not ocr_text or not isinstance(ocr_text, str):
        raise TextSeparatorError("Invalid OCR text provided.")

    text_lower = ocr_text.lower()
    ingredient_start = _find_section_start(ocr_text, _INGREDIENT_KEYWORDS)
    nutrition_start = _find_section_start(ocr_text, _NUTRITION_KEYWORDS)

    has_ingredients = ingredient_start is not None
    has_nutrition = nutrition_start is not None

    ingredient_text = ""
    nutrition_text = ""

    lines = ocr_text.split('\n')

    if has_ingredients and has_nutrition:
        # Both present — split them
        if ingredient_start < nutrition_start:
            # Ingredients first, then nutrition
            ingredient_text = '\n'.join(lines[ingredient_start:nutrition_start])
            nutrition_text = '\n'.join(lines[nutrition_start:])
        else:
            # Nutrition first, then ingredients
            nutrition_text = '\n'.join(lines[nutrition_start:ingredient_start])
            ingredient_text = '\n'.join(lines[ingredient_start:])
    elif has_ingredients:
        # Only ingredients
        ingredient_text = '\n'.join(lines[ingredient_start:])
    elif has_nutrition:
        # Only nutrition
        nutrition_text = '\n'.join(lines[nutrition_start:])
    else:
        # Neither found — return full text as-is
        # (This shouldn't happen if classify already determined "both")
        ingredient_text = ocr_text
        nutrition_text = ocr_text

    return {
        "ingredient_text": ingredient_text.strip(),
        "nutrition_text": nutrition_text.strip(),
        "has_ingredients": has_ingredients,
        "has_nutrition": has_nutrition,
    }
