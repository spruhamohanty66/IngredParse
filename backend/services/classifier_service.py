"""
Classifier Service — Rule Based
Classifies extracted OCR text into label type:
- ingredient_label
- nutrition_label
- both

Uses exact match first, then fuzzy match to handle common OCR errors
(e.g. "ngredieents", "lngredients", "Ingrediente").
"""

import sys
import logging
from rapidfuzz import fuzz

logger = logging.getLogger(__name__)

INGREDIENT_KEYWORDS = ["ingredients", "ingredient"]
NUTRITION_KEYWORDS  = ["nutrition facts", "nutritional information", "nutrition"]

# Minimum fuzzy similarity score (0–100) to count as a match
_FUZZY_THRESHOLD = 80


def _fuzzy_has_keyword(text: str, keywords: list[str]) -> bool:
    """
    Check if any word (or short phrase) in the text closely matches any keyword.
    Splits the text into tokens and scores each against each keyword.
    """
    words = text.lower().split()
    for kw in keywords:
        kw_len = len(kw.split())
        # Build n-gram windows the same length as the keyword
        for i in range(len(words) - kw_len + 1):
            window = " ".join(words[i : i + kw_len])
            if fuzz.ratio(window, kw) >= _FUZZY_THRESHOLD:
                return True
    return False


def classify_label(text: str) -> str:
    """
    Classify OCR text based on keyword presence.

    Args:
        text: Raw extracted text from OCR.

    Returns:
        "ingredient_label" | "nutrition_label" | "both"

    Raises:
        ValueError: If no recognizable label type is detected.
    """
    lowered = text.lower()

    # Exact match first (fast path)
    has_ingredients = any(kw in lowered for kw in INGREDIENT_KEYWORDS)
    has_nutrition   = any(kw in lowered for kw in NUTRITION_KEYWORDS)

    # DEBUG: Log what we found
    logger.debug(f"[Classifier] OCR TEXT:\n{text}\n")
    logger.debug(f"[Classifier] Exact match - has_ingredients: {has_ingredients}, has_nutrition: {has_nutrition}")

    # Fuzzy fallback for OCR typos (e.g. "ngredieents", "lngredients")
    if not has_ingredients:
        has_ingredients = _fuzzy_has_keyword(lowered, INGREDIENT_KEYWORDS)
        if has_ingredients:
            logger.debug("[Classifier] Matched 'ingredients' via fuzzy match (OCR typo detected)")

    if not has_nutrition:
        has_nutrition = _fuzzy_has_keyword(lowered, NUTRITION_KEYWORDS)
        if has_nutrition:
            logger.debug("[Classifier] Matched 'nutrition' via fuzzy match (OCR typo detected)")

    result = ""
    if has_ingredients and has_nutrition:
        result = "both"
    elif has_ingredients:
        result = "ingredient_label"
    elif has_nutrition:
        result = "nutrition_label"
    else:
        raise ValueError(
            "Could not detect a recognizable label type. "
            "Please upload a clear image of an ingredients or nutrition label."
        )

    logger.debug(f"[Classifier] FINAL RESULT: {result}")
    return result
