"""
Ingredient Fallback Service — GPT-4 Enrichment
For ingredients marked "unmapped" after DB matching, uses GPT-4's trained knowledge
to extract ingredient metadata (functional role, allergy info, FSSAI limits, etc.).

match_status → "human_review"  (all GPT-4 data requires expert validation)
source       → "gpt4"
"""

import os
import json
from openai import OpenAI
import logging
from prompts.prompts import INGREDIENT_FALLBACK_PROMPT

logger = logging.getLogger(__name__)


_openai_client: OpenAI = None


class FallbackError(Exception):
    """Raised when GPT-4 fallback enrichment fails."""
    code = "FALLBACK_ERROR"


# ── OpenAI client ──────────────────────────────────────────────────────────────

def _get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise FallbackError("OPENAI_API_KEY not set in .env")
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client


# ── GPT-4 extraction ───────────────────────────────────────────────────────────

def _extract_with_gpt(ingredient_name: str) -> dict:
    """
    Call GPT-4 to extract ingredient metadata for the given name.
    Returns the parsed db_data dict.
    Raises FallbackError if GPT-4 returns invalid JSON or empty content.
    """
    client = _get_openai_client()
    prompt = INGREDIENT_FALLBACK_PROMPT.replace("{ingredient_name}", ingredient_name)

    response = client.chat.completions.create(
        model="gpt-4o",
        temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}]
    )

    # Capture token usage
    usage = response.usage
    token_usage = {
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
        "total_tokens": usage.total_tokens if usage else 0,
    }

    content = response.choices[0].message.content
    if not content:
        raise FallbackError(f"GPT-4 returned empty content for '{ingredient_name}'")

    try:
        result = json.loads(content)
        result["_token_usage"] = token_usage
        return result
    except json.JSONDecodeError as e:
        raise FallbackError(f"GPT-4 returned invalid JSON for '{ingredient_name}': {e}")


# ── Single ingredient enrichment ───────────────────────────────────────────────

def _enrich_single(ingredient: dict) -> None:
    """
    Enrich one ingredient dict in place using GPT-4.
    Only call this when match_status is "unmapped".

    Sets:
      - db_data        → extracted metadata
      - match_status   → "human_review" (if identifiable) | "unmapped" (if not)
      - source         → "gpt4"
      - human_review_flag inside db_data → always true
    """
    name = ingredient.get("raw_text", "").strip()
    if not name:
        return

    logger.info("[Fallback] GPT-4 lookup: '%s'", name)

    try:
        data = _extract_with_gpt(name)
    except FallbackError as e:
        logger.warning("[Fallback] ERROR for '%s': %s", name, e)
        return

    # Extract token usage before processing
    token_usage = data.pop("_token_usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})

    identifiable = data.pop("identifiable", True)

    if not identifiable:
        logger.info("[Fallback] '%s' -> not identifiable, keeping unmapped", name)
        ingredient["source"] = "gpt4"
        return

    # functional_role is a top-level ingredient field — only fill if currently null
    gpt_functional_role = data.pop("functional_role", None)
    if not ingredient.get("functional_role") and gpt_functional_role:
        ingredient["functional_role"] = gpt_functional_role

    # functional_role_db comes from DB only — set as null placeholder
    # watchlist_category is set during analysis (persona-based) — set as null placeholder
    data["functional_role_db"] = None
    data["watchlist_category"] = None

    ingredient["db_data"] = data
    ingredient["match_status"] = "human_review"
    ingredient["source"] = "gpt4"
    ingredient["_fallback_token_usage"] = token_usage
    logger.info("[Fallback] '%s' -> human_review  (functional_role: %s)", name, ingredient.get('functional_role'))


# ── Main entry point ───────────────────────────────────────────────────────────

def enrich_unmapped_ingredients(parsed_output: dict) -> dict:
    """
    For each ingredient (and sub-ingredient) with match_status = "unmapped",
    call GPT-4 to extract metadata and update the ingredient in place.

    Mirrors the interface of db_service.enrich_parsed_output().
    Input/output: the full pipeline JSON dict.
    """
    ingredients = parsed_output.get("parsed_output", {}).get("ingredients", [])
    if not ingredients:
        parsed_output["_fallback_eval"] = {"token_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "llm_calls": 0}
        return parsed_output

    total_tokens = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    llm_calls = 0

    for ingredient in ingredients:
        if ingredient.get("match_status") == "unmapped":
            _enrich_single(ingredient)
            tu = ingredient.pop("_fallback_token_usage", None)
            if tu:
                llm_calls += 1
                for k in total_tokens:
                    total_tokens[k] += tu[k]

        for sub in ingredient.get("sub_ingredients", []):
            if sub.get("match_status") == "unmapped":
                _enrich_single(sub)
                tu = sub.pop("_fallback_token_usage", None)
                if tu:
                    llm_calls += 1
                    for k in total_tokens:
                        total_tokens[k] += tu[k]

    logger.info("[Fallback] Total LLM Calls: %d | Tokens: %s", llm_calls, total_tokens['total_tokens'])
    parsed_output["_fallback_eval"] = {"token_usage": total_tokens, "llm_calls": llm_calls}
    return parsed_output
