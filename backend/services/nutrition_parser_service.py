"""
Nutrition Parser Service — Agentic (GPT-4)
Parses raw OCR text from a nutrition label into structured nutrient data.
Only runs if label type is nutrition_label or both.

Responsibilities:
  1. GPT-4 extraction  — extract per_serving and per_100g values from OCR text
  2. per_100g compute  — calculate per_100g from per_serving if only per_serving was extracted
  3. Flag application  — apply standard threshold flags to per_100g values

Persona-specific analysis is handled by nutrition_analysis_service.py (separate service).
"""

import os
import re
import json
import time
from datetime import datetime, timezone
from openai import OpenAI
import logging
from prompts.prompts import NUTRITION_PARSER_PROMPT

logger = logging.getLogger(__name__)

SUPPORTED_LABEL_TYPES = {"nutrition_label", "both"}

# Standard flag thresholds — per 100g (from analysis.md)
_FLAG_THRESHOLDS = {
    "high_sugar":    ("total_sugar_g",    "gt", 22.5),
    "high_sodium":   ("sodium_mg",        "gt", 600),
    "high_sat_fat":  ("saturated_fat_g",  "gt", 5.0),
    "high_trans_fat":("trans_fat_g",      "gt", 0.2),
    "low_fiber":     ("fiber_g",          "lt", 3.0),
    "low_protein":   ("protein_g",        "lt", 5.0),
}


class NutritionParserError(Exception):
    """Raised when the nutrition parser fails."""
    code = "NUTRITION_PARSE_FAILED"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _clean_response(raw: str) -> str:
    """Strip whitespace and markdown code fences from GPT-4 response."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    return raw


def _parse_serving_size_grams(serving_size: str) -> float | None:
    """
    Try to extract a numeric gram/ml value from a serving_size string.

    Returns the numeric value if the string is a simple weight/volume
    (e.g. "30g", "100ml", "25 g"). Returns None if it cannot be parsed
    (e.g. "1 biscuit", "2 pieces") — meaning per_100g cannot be computed.
    """
    if not serving_size:
        return None

    # Match patterns like "30g", "30 g", "100ml", "100 ml", "30G"
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(?:g|ml|G|ML|grams?|gram)\s*", serving_size.strip(), re.IGNORECASE)
    if match:
        return float(match.group(1))

    return None


def _empty_nutrient_block() -> dict:
    return {
        "calories": None,
        "total_fat_g": None,
        "saturated_fat_g": None,
        "monounsaturated_fat_g": None,
        "polyunsaturated_fat_g": None,
        "trans_fat_g": None,
        "cholesterol_mg": None,
        "sodium_mg": None,
        "total_carbs_g": None,
        "fiber_g": None,
        "total_sugar_g": None,
        "added_sugar_g": None,
        "protein_g": None,
        # Vitamins
        "vitamin_a_mcg": None,
        "vitamin_b6_mg": None,
        "vitamin_b12_mcg": None,
        "vitamin_c_mg": None,
        "vitamin_d_mcg": None,
        "vitamin_e_mg": None,
        "vitamin_k_mcg": None,
        # Minerals
        "calcium_mg": None,
        "magnesium_mg": None,
        "iron_mg": None,
        "potassium_mg": None,
        "zinc_mg": None,
    }


def _empty_dv_percent() -> dict:
    """Returns a dv_percent object with all fields set to null."""
    return {
        "calories": None,
        "total_fat_g": None,
        "saturated_fat_g": None,
        "monounsaturated_fat_g": None,
        "polyunsaturated_fat_g": None,
        "trans_fat_g": None,
        "cholesterol_mg": None,
        "sodium_mg": None,
        "total_carbs_g": None,
        "fiber_g": None,
        "total_sugar_g": None,
        "added_sugar_g": None,
        "protein_g": None,
        "vitamin_a_mcg": None,
        "vitamin_b6_mg": None,
        "vitamin_b12_mcg": None,
        "vitamin_c_mg": None,
        "vitamin_d_mcg": None,
        "vitamin_e_mg": None,
        "vitamin_k_mcg": None,
        "calcium_mg": None,
        "magnesium_mg": None,
        "iron_mg": None,
        "potassium_mg": None,
        "zinc_mg": None,
    }


def _is_all_null(block: dict) -> bool:
    return all(v is None for v in block.values())


# ── per_100g / per_serving calculation ────────────────────────────────────────

def _compute_per_100g(per_serving: dict, serving_size_str: str) -> dict:
    """
    Compute per_100g from per_serving.
    Returns all-null dict if serving size is non-numeric (e.g. "1 biscuit").
    """
    per_100g = _empty_nutrient_block()

    serving_g = _parse_serving_size_grams(serving_size_str)
    if serving_g is None or serving_g <= 0:
        logger.warning("[NutritionParser] Non-numeric serving size '%s' — per_100g set to null", serving_size_str)
        return per_100g

    multiplier = 100.0 / serving_g
    for field in per_100g:
        val = per_serving.get(field)
        if val is not None:
            per_100g[field] = round(val * multiplier, 1)

    return per_100g


def _compute_per_serving(per_100g: dict, serving_size_str: str) -> dict:
    """
    Compute per_serving from per_100g.
    Used when the label only shows per-100g/per-100ml values (e.g. juice labels).
    Returns all-null dict if serving size is non-numeric.
    """
    per_serving = _empty_nutrient_block()

    serving_g = _parse_serving_size_grams(serving_size_str)
    if serving_g is None or serving_g <= 0:
        logger.warning("[NutritionParser] Non-numeric serving size '%s' — per_serving set to null", serving_size_str)
        return per_serving

    multiplier = serving_g / 100.0
    for field in per_serving:
        val = per_100g.get(field)
        if val is not None:
            per_serving[field] = round(val * multiplier, 1)

    return per_serving


# ── Flag application ───────────────────────────────────────────────────────────

def _apply_flags(per_100g: dict) -> dict:
    """
    Apply standard nutrient threshold flags to per_100g values.

    If per_100g is all-null (could not be computed), all flags are set to None.
    If a specific nutrient value is null, that flag is set to None (unknown, not false).
    """
    if _is_all_null(per_100g):
        return {flag: None for flag in _FLAG_THRESHOLDS}

    flags = {}
    for flag, (field, operator, threshold) in _FLAG_THRESHOLDS.items():
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


# ── GPT-4 extraction ───────────────────────────────────────────────────────────

def _extract_with_gpt(ocr_text: str) -> dict:
    """
    Call GPT-4 to extract per_serving and per_100g from OCR text.
    Returns the parsed dict with serving_size, servings_per_pack, per_serving, per_100g.
    Raises NutritionParserError on failure.
    """
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    prompt = NUTRITION_PARSER_PROMPT.replace("{ocr_text}", ocr_text)

    logger.info("[NutritionParser] GPT-4 extraction started : %s", datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    start = time.time()

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        response_format={"type": "json_object"},
    )

    duration = time.time() - start
    logger.info("[NutritionParser] GPT-4 extraction finished: %s (%.2fs)", datetime.now().strftime('%Y-%m-%d %H:%M:%S'), duration)

    # Capture token usage
    usage = response.usage
    token_usage = {
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
        "total_tokens": usage.total_tokens if usage else 0,
    }
    logger.debug("[NutritionParser] Tokens: %s", token_usage['total_tokens'])

    content = response.choices[0].message.content
    if not content:
        raise NutritionParserError("GPT-4 returned empty content.")

    try:
        result = json.loads(_clean_response(content))
        result["_eval"] = {"token_usage": token_usage, "llm_calls": 1}
        return result
    except json.JSONDecodeError as e:
        raise NutritionParserError(f"GPT-4 returned invalid JSON: {e}")


# ── Main entry point ───────────────────────────────────────────────────────────

def parse_nutrition(ocr_text: str, label_type: str) -> dict:
    """
    Parse nutrition facts from raw OCR text.

    Steps:
      1. GPT-4 extracts per_serving and/or per_100g from OCR text.
      2. If per_100g is missing but per_serving is present, compute per_100g.
      3. Apply standard threshold flags to per_100g values.

    Args:
        ocr_text:   Raw text extracted by OCR.
        label_type: Classification result — "nutrition_label" | "both".

    Returns:
        Dict matching the nutrition section of the pipeline JSON schema.

    Raises:
        ValueError: If label_type does not include a nutrition label.
        NutritionParserError: If GPT-4 fails or returns invalid output.
    """
    if label_type not in SUPPORTED_LABEL_TYPES:
        raise ValueError(
            f"NutritionParser only supports nutrition labels. Got: '{label_type}'."
        )

    # Step 1 — GPT-4 extraction
    extracted = _extract_with_gpt(ocr_text)

    probable_product_name   = extracted.get("probable_product_name")
    serving_size            = extracted.get("serving_size")
    servings_per_pack       = extracted.get("servings_per_pack")
    default_serving_label   = extracted.get("default_serving_label")
    full_pack_serving_label = extracted.get("full_pack_serving_label")
    per_serving             = extracted.get("per_serving") or _empty_nutrient_block()
    per_100g                = extracted.get("per_100g")    or _empty_nutrient_block()
    dv_percent              = extracted.get("dv_percent")  or _empty_dv_percent()

    # Step 2a — Compute per_100g from per_serving if only per_serving was extracted
    if _is_all_null(per_100g) and not _is_all_null(per_serving):
        logger.info("[NutritionParser] per_100g not extracted — computing from per_serving")
        per_100g = _compute_per_100g(per_serving, serving_size or "")

    # Step 2b — Compute per_serving from per_100g if only per_100g was extracted
    # (common for juice/liquid labels that show values per 100ml only)
    if _is_all_null(per_serving) and not _is_all_null(per_100g):
        logger.info("[NutritionParser] per_serving not extracted — computing from per_100g")
        per_serving = _compute_per_serving(per_100g, serving_size or "")

    # Step 3 — Apply standard flags
    flags = _apply_flags(per_100g)

    # Extract eval metrics from GPT extraction
    eval_metrics = extracted.pop("_eval", {"token_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "llm_calls": 0})

    return {
        "probable_product_name":   probable_product_name,
        "serving_size":            serving_size,
        "servings_per_pack":       servings_per_pack,
        "default_serving_label":   default_serving_label,
        "full_pack_serving_label": full_pack_serving_label,
        "per_serving":             per_serving,
        "per_100g":                per_100g,
        "dv_percent":              dv_percent,
        "flags":                   flags,
        "source":                  "packaging",
        "_eval":                   eval_metrics,
    }
