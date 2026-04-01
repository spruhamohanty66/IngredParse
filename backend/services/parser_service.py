"""
Parser Service — Ingredient Parser (Agentic)
Parses raw OCR text into structured ingredient JSON using GPT-4 with tool calls.
GPT-4 calls the lookup_ingredient tool for each ingredient, which queries Supabase
and returns db_data directly — no separate enrichment step needed.

Only runs if label type is ingredient_label or both.
"""

import os
import json
import time
from datetime import datetime, timezone
from openai import OpenAI
import logging
from prompts.prompts import INGREDIENT_PARSER_PROMPT
from services.db_service import _fetch_all, tool_lookup, DBError

logger = logging.getLogger(__name__)

SUPPORTED_LABEL_TYPES = {"ingredient_label", "both"}

# ── Tool definition passed to GPT-4 ───────────────────────────────────────────

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "lookup_ingredient",
            "description": (
                "Look up an ingredient in the Supabase ingredient database. "
                "Returns match_status ('exact', 'fuzzy', or 'unmapped') and db_data "
                "containing allergen info, macro profile, functional role, and safety metadata. "
                "Call this for every ingredient and sub-ingredient you extract."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "ingredient_name": {
                        "type": "string",
                        "description": "The ingredient name exactly as extracted from the food label"
                    }
                },
                "required": ["ingredient_name"]
            }
        }
    }
]


class ParserError(Exception):
    """Raised when GPT-4 fails to return valid JSON."""
    code = "PARSE_FAILED"


def _clean_response(raw: str) -> str:
    """Strip whitespace and markdown code blocks from GPT-4 response."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    return raw


def _handle_tool_call(tool_call, all_rows: list) -> str:
    """Execute a single lookup_ingredient tool call and return the JSON result string."""
    try:
        args = json.loads(tool_call.function.arguments)
    except json.JSONDecodeError:
        return json.dumps({"match_status": "unmapped", "db_data": {}})

    ingredient_name = args.get("ingredient_name", "").strip()
    if not ingredient_name:
        return json.dumps({"match_status": "unmapped", "db_data": {}})

    result = tool_lookup(ingredient_name, all_rows)
    return json.dumps(result)


def parse_ingredients(ocr_text: str, label_type: str, ocr_confidence: float = None) -> dict:
    """
    Parse raw OCR text into structured ingredient JSON.
    GPT-4 calls lookup_ingredient tool for each ingredient during parsing.

    Args:
        ocr_text: Raw text extracted from OCR.
        label_type: Classification result — "ingredient_label" | "nutrition_label" | "both".
        ocr_confidence: Confidence score from OCR (optional).

    Returns:
        Structured parsed_output dict with db_data already populated per ingredient.

    Raises:
        ValueError: If label_type does not contain an ingredient label.
        ParserError: If GPT-4 returns no content or invalid JSON.
    """
    if label_type not in SUPPORTED_LABEL_TYPES:
        raise ValueError(
            f"Parser only supports ingredient labels. Got: '{label_type}'. "
            "Nutrition-only labels are not parsed by this service."
        )

    # Pre-fetch all DB rows once — tool calls reuse this in the loop below
    try:
        all_rows = _fetch_all()
        logger.info("[PARSER] DB rows loaded: %d", len(all_rows))
    except DBError as e:
        logger.warning("[PARSER] DB fetch failed: %s — all ingredients will be unmapped", e)
        all_rows = []

    prompt = INGREDIENT_PARSER_PROMPT.replace("{ocr_text}", ocr_text)

    logger.info("[PARSER] Started  : %s", datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    start_time = time.time()

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    messages = [{"role": "user", "content": prompt}]

    # ── Agentic loop ──────────────────────────────────────────────────────────
    # GPT-4 may call lookup_ingredient multiple times (once per ingredient/sub-ingredient).
    # We keep sending tool results back until GPT-4 returns its final JSON response.
    content = None
    total_tokens = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    llm_calls = 0
    max_iterations = 10  # safety cap (each turn can batch multiple tool calls)
    for iteration in range(max_iterations):
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=TOOL_DEFINITIONS,
            tool_choice="auto",
            temperature=0
        )

        # Accumulate token usage per iteration
        llm_calls += 1
        usage = response.usage
        if usage:
            total_tokens["prompt_tokens"] += usage.prompt_tokens
            total_tokens["completion_tokens"] += usage.completion_tokens
            total_tokens["total_tokens"] += usage.total_tokens

        choice = response.choices[0]

        if choice.finish_reason == "tool_calls":
            # Append assistant message with tool_calls
            messages.append(choice.message)

            # Execute each tool call and append results
            for tool_call in choice.message.tool_calls:
                result_str = _handle_tool_call(tool_call, all_rows)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result_str
                })
            logger.info("[PARSER] Tool calls handled: %d (iteration %d)", len(choice.message.tool_calls), iteration + 1)

        else:
            # finish_reason == "stop" — final JSON response
            content = choice.message.content
            break

    end_time = time.time()
    logger.info("[PARSER] Ended    : %s", datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    logger.info("[PARSER] Duration : %.2fs", end_time - start_time)
    logger.info("[PARSER] LLM Calls: %d | Tokens: %s", llm_calls, total_tokens['total_tokens'])

    if not content:
        raise ParserError("GPT-4 returned empty content.")

    raw_response = _clean_response(content)
    logger.debug("[PARSER] Raw GPT-4 response (first 300 chars):\n%s", raw_response[:300])

    try:
        result = json.loads(raw_response)
    except json.JSONDecodeError as e:
        raise ParserError(f"GPT-4 returned invalid JSON: {e}")

    # Fill in metadata
    parsed = result.get("parsed_output", {})
    metadata = parsed.get("metadata", {})
    metadata["ocr_confidence"] = ocr_confidence
    metadata["processing_timestamp"] = datetime.now(timezone.utc).isoformat()

    # Attach eval metrics
    result["_eval"] = {"token_usage": total_tokens, "llm_calls": llm_calls}

    return result
