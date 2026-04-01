"""
Nutrition Agent — Wraps the nutrition parsing pipeline.

Runs when label_type is nutrition_label or both.
Orchestrates:
  1. parse_nutrition() — GPT-4 agentic parsing of nutrient values

Analysis is delegated to the analysis_agent.
"""

import logging
import time
from datetime import datetime

from services.nutrition_parser_service import parse_nutrition, NutritionParserError
from services.validation import validate_nutrition

logger = logging.getLogger(__name__)


def run_nutrition_agent(ocr_text: str, persona: str, label_type: str) -> dict:
    """
    Execute the nutrition parsing pipeline (parsing only).

    Args:
        ocr_text: Raw OCR-extracted text from the label.
        persona: User persona (kids | clean_eating).
        label_type: Classification result (nutrition_label | both).

    Returns:
        Dict with key "nutrition" containing:
          - per_serving (dict with nutrient values)
          - per_100g (dict with nutrient values)
          - serving_size (str)
          - standard_flags (dict from parser)

    Raises:
        NutritionParserError: If nutrition parsing fails.
    """
    start_time = time.time()
    start_dt = datetime.now().isoformat()
    ocr_text_preview = ocr_text[:100].replace("\n", " ") if ocr_text else ""

    logger.info(
        f"[NutritionAgent] START | Time: {start_dt} | Persona: {persona} | LabelType: {label_type} | "
        f"TextLength: {len(ocr_text) if ocr_text else 0}"
    )
    logger.debug(f"[NutritionAgent] OCR Text Preview: {ocr_text_preview}...")

    try:
        # Step 1: Parse nutrition (GPT-4 agentic extraction + per_100g compute)
        logger.debug("[NutritionAgent] Step 1: Parsing nutrition facts with GPT-4...")
        nutrition = parse_nutrition(
            ocr_text=ocr_text,
            label_type=label_type,
        )

        # Extract eval metrics
        nutrition_eval = nutrition.pop("_eval", {"token_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "llm_calls": 0})

        # Step 1.5: Validate parsed nutrition — retry once if validation fails
        validation_result = validate_nutrition(nutrition)
        if not validation_result["valid"]:
            logger.warning(
                "[NutritionAgent] Nutrition validation FAILED (%d issues) — retrying parser with feedback",
                len(validation_result["issues"]),
            )
            feedback = validation_result["feedback_for_parser"]
            retry_text = f"{ocr_text}\n\n{feedback}" if feedback else ocr_text

            nutrition = parse_nutrition(
                ocr_text=retry_text,
                label_type=label_type,
            )
            retry_eval = nutrition.pop("_eval", {"token_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "llm_calls": 0})

            # Aggregate retry tokens
            for k in nutrition_eval["token_usage"]:
                nutrition_eval["token_usage"][k] += retry_eval["token_usage"].get(k, 0)
            nutrition_eval["llm_calls"] += retry_eval["llm_calls"]

            # Re-validate after retry
            retry_validation = validate_nutrition(nutrition)
            if retry_validation["valid"]:
                logger.info("[NutritionAgent] Retry parsing PASSED validation")
            else:
                logger.warning(
                    "[NutritionAgent] Retry parsing still FAILED validation — proceeding with best-effort"
                )
            nutrition["_nutrition_validation"] = retry_validation
        else:
            nutrition["_nutrition_validation"] = validation_result

        # Extract key parsed values for logging
        calories = nutrition.get("per_serving", {}).get("calories", "N/A")
        serving_size = nutrition.get("serving_size", "N/A")
        flags_count = sum(1 for v in nutrition.get("flags", {}).values() if v is True)

        logger.debug(
            f"[NutritionAgent] Nutrition parsing complete | Calories: {calories} | "
            f"ServingSize: {serving_size} | Flags: {flags_count}"
        )

        elapsed_time = time.time() - start_time
        end_dt = datetime.now().isoformat()

        logger.info(
            f"[NutritionAgent] END | Time: {end_dt} | Duration: {elapsed_time:.2f}s | "
            f"Status: SUCCESS | Calories: {calories} | ServingSize: {serving_size} | "
            f"FlagCount: {flags_count} | "
            f"LLMCalls: {nutrition_eval['llm_calls']} | Tokens: {nutrition_eval['token_usage']['total_tokens']}"
        )

        return {
            "nutrition": nutrition,
            "_agent_eval": {
                "agent": "NutritionAgent",
                "token_usage": nutrition_eval["token_usage"],
                "llm_calls": nutrition_eval["llm_calls"],
                "duration_seconds": round(elapsed_time, 2),
            },
        }

    except Exception as e:
        elapsed_time = time.time() - start_time
        end_dt = datetime.now().isoformat()
        logger.error(
            f"[NutritionAgent] END | Time: {end_dt} | Duration: {elapsed_time:.2f}s | "
            f"Status: FAILED | Error: {str(e)}"
        )
        raise
