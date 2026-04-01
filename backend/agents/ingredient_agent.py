"""
Ingredient Agent — Wraps the ingredient parsing pipeline.

Runs when label_type is ingredient_label or both.
Orchestrates:
  1. parse_ingredients() — GPT-4 agentic parsing with DB lookup
  2. enrich_unmapped_ingredients() — GPT-4 fallback for unmapped
  3. save_for_review() — queue human_review ingredients for SME validation

Analysis is delegated to the analysis_agent.
"""

import logging
import time
from datetime import datetime

from services.parser_service import parse_ingredients, ParserError
from services.ingredient_fallback_service import enrich_unmapped_ingredients
from services.sme_service import save_for_review, SMEError
from services.validation import validate_ingredients

logger = logging.getLogger(__name__)


def _collect_human_review_ingredients(pipeline: dict) -> list:
    """
    Collect all ingredients (and sub-ingredients) with match_status == "human_review".

    Returns:
        List of ingredient dicts ready to save to review queue.
    """
    items = []
    ingredients = pipeline.get("parsed_output", {}).get("ingredients", [])
    for ingredient in ingredients:
        if ingredient.get("match_status") == "human_review":
            items.append(ingredient)
        for sub in ingredient.get("sub_ingredients", []):
            if sub.get("match_status") == "human_review":
                items.append(sub)
    return items


def _queue_for_sme_review(ingredients: list) -> None:
    """
    Save ingredients marked for human_review to the SME queue.
    Logs but does not raise on individual failures (non-blocking).

    Args:
        ingredients: List of ingredient dicts from pipeline.
    """
    for ingredient in ingredients:
        try:
            save_for_review(ingredient)
        except SMEError as e:
            logger.warning("[IngredientAgent] Failed to queue '%s': %s", ingredient.get('raw_text'), e)


def run_ingredient_agent(ocr_text: str, persona: str, ocr_confidence: float | None, label_type: str = "ingredient_label") -> dict:
    """
    Execute the ingredient parsing pipeline (parsing and enrichment only).

    Args:
        ocr_text: Raw OCR-extracted text from the label.
        persona: User persona (kids | clean_eating).
        ocr_confidence: Confidence score from OCR (optional).
        label_type: Label type detected by classifier (ingredient_label | nutrition_label | both).

    Returns:
        Dict with:
          - parsed_output: Structured ingredient data

    Raises:
        ParserError: If ingredient parsing fails.
    """
    start_time = time.time()
    start_dt = datetime.now().isoformat()
    ocr_text_preview = ocr_text[:100].replace("\n", " ") if ocr_text else ""

    logger.info(
        f"[IngredientAgent] START | Time: {start_dt} | Persona: {persona} | LabelType: {label_type} | "
        f"OCRConfidence: {f'{ocr_confidence:.2f}' if ocr_confidence is not None else 'N/A'} | "
        f"TextLength: {len(ocr_text) if ocr_text else 0}"
    )
    logger.debug(f"[IngredientAgent] OCR Text Preview: {ocr_text_preview}...")

    try:
        # Step 1: Parse ingredients (GPT-4 agentic with DB lookup)
        logger.debug("[IngredientAgent] Step 1: Parsing ingredients with GPT-4...")
        pipeline = parse_ingredients(
            ocr_text=ocr_text,
            label_type=label_type,
            ocr_confidence=ocr_confidence,
        )
        parser_eval = pipeline.pop("_eval", {"token_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "llm_calls": 0})
        parsed_count = len(pipeline.get("parsed_output", {}).get("ingredients", []))
        logger.debug(f"[IngredientAgent] Parsing complete | Ingredients parsed: {parsed_count}")

        # Step 1.5: Validate parsed ingredients — retry once if validation fails
        validation_result = validate_ingredients(pipeline.get("parsed_output", {}))
        if not validation_result["valid"]:
            logger.warning(
                "[IngredientAgent] Ingredient validation FAILED (%d issues) — retrying parser with feedback",
                len(validation_result["issues"]),
            )
            feedback = validation_result["feedback_for_parser"]
            retry_text = f"{ocr_text}\n\n{feedback}" if feedback else ocr_text

            pipeline = parse_ingredients(
                ocr_text=retry_text,
                label_type=label_type,
                ocr_confidence=ocr_confidence,
            )
            retry_eval = pipeline.pop("_eval", {"token_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "llm_calls": 0})

            # Aggregate retry tokens into parser eval
            for k in parser_eval["token_usage"]:
                parser_eval["token_usage"][k] += retry_eval["token_usage"].get(k, 0)
            parser_eval["llm_calls"] += retry_eval["llm_calls"]

            parsed_count = len(pipeline.get("parsed_output", {}).get("ingredients", []))

            # Re-validate after retry
            retry_validation = validate_ingredients(pipeline.get("parsed_output", {}))
            if retry_validation["valid"]:
                logger.info("[IngredientAgent] Retry parsing PASSED validation")
            else:
                logger.warning(
                    "[IngredientAgent] Retry parsing still FAILED validation — proceeding with best-effort"
                )

            # Store validation result for evals
            pipeline["_ingredient_validation"] = retry_validation
        else:
            pipeline["_ingredient_validation"] = validation_result

        # Step 2: Enrich unmapped ingredients via GPT-4 fallback
        logger.debug("[IngredientAgent] Step 2: Enriching unmapped ingredients...")
        pipeline = enrich_unmapped_ingredients(pipeline)
        fallback_eval = pipeline.pop("_fallback_eval", {"token_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "llm_calls": 0})
        logger.debug("[IngredientAgent] Enrichment complete")

        # Step 3: Queue human_review ingredients for SME validation (non-blocking)
        logger.debug("[IngredientAgent] Step 3: Collecting and queuing human review items...")
        human_review_items = _collect_human_review_ingredients(pipeline)
        if human_review_items:
            logger.info(f"[IngredientAgent] Found {len(human_review_items)} items for SME review")
            _queue_for_sme_review(human_review_items)
        else:
            logger.debug("[IngredientAgent] No items require SME review")

        elapsed_time = time.time() - start_time
        end_dt = datetime.now().isoformat()

        # Aggregate eval metrics
        agent_tokens = {
            "prompt_tokens": parser_eval["token_usage"]["prompt_tokens"] + fallback_eval["token_usage"]["prompt_tokens"],
            "completion_tokens": parser_eval["token_usage"]["completion_tokens"] + fallback_eval["token_usage"]["completion_tokens"],
            "total_tokens": parser_eval["token_usage"]["total_tokens"] + fallback_eval["token_usage"]["total_tokens"],
        }
        agent_llm_calls = parser_eval["llm_calls"] + fallback_eval["llm_calls"]

        logger.info(
            f"[IngredientAgent] END | Time: {end_dt} | Duration: {elapsed_time:.2f}s | "
            f"Status: SUCCESS | IngredientCount: {parsed_count} | "
            f"SMEQueueCount: {len(human_review_items)} | "
            f"LLMCalls: {agent_llm_calls} | Tokens: {agent_tokens['total_tokens']}"
        )

        pipeline["_agent_eval"] = {
            "agent": "IngredientAgent",
            "token_usage": agent_tokens,
            "llm_calls": agent_llm_calls,
            "duration_seconds": round(elapsed_time, 2),
        }
        return pipeline

    except Exception as e:
        elapsed_time = time.time() - start_time
        end_dt = datetime.now().isoformat()
        logger.error(
            f"[IngredientAgent] END | Time: {end_dt} | Duration: {elapsed_time:.2f}s | "
            f"Status: FAILED | Error: {str(e)}"
        )
        raise
