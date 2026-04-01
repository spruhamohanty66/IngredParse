"""
IngredParse — FastAPI entry point
Orchestrates the full pipeline:
  image → OCR → classify → parse → DB enrich → GPT-4 fallback → analysis → verdict
"""

import os
import sys
import uuid
import json
import time
import tempfile
import logging

# Add project root to path so we can import from the evals package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Body
from fastapi.responses import StreamingResponse
from typing import List, Generator
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from openai import OpenAI

from services.ocr_service import extract_text, ImageQualityError
from services.classifier_service import classify_label
from services.parser_service import ParserError
from services.nutrition_parser_service import NutritionParserError
from services.analysis_service import AnalysisError
from services.text_separator_service import separate_text, TextSeparatorError
from services.sme_service import (
    get_queue, get_review_item, update_review_item,
    approve_item, reject_item,
    search_ingredonly, get_all_ingredonly, get_ingredonly_item, update_ingredonly_item,
    SMEError
)
from agents.ingredient_agent import run_ingredient_agent
from agents.nutrition_agent import run_nutrition_agent
from agents.analysis_agent import run_analysis_agent
from prompts.prompts import COMBINED_VERDICT_PROMPT
from services.validation import validate_output
from evals.decision_signal_service import record_decision_signal, record_scan_log

load_dotenv()

# ── Configure Logging ──────────────────────────────────────────────────────────
def setup_logging():
    """Configure logging for all modules"""

    # Create formatters
    detailed_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # Console handler (for all logs) — force UTF-8 to avoid cp1252 encoding errors on Windows
    import sys, io
    console_handler = logging.StreamHandler(
        stream=io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    )
    console_handler.setLevel(logging.DEBUG)
    console_handler.setFormatter(detailed_formatter)

    # File handler (for all logs)
    file_handler = logging.FileHandler('backend.log', mode='a', encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(detailed_formatter)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)

    # Configure module loggers
    for module_name in [
        'agents.ingredient_agent',
        'agents.nutrition_agent',
        'agents.analysis_agent',
        '__main__'
    ]:
        module_logger = logging.getLogger(module_name)
        module_logger.setLevel(logging.DEBUG)
        module_logger.propagate = True

setup_logging()
logger = logging.getLogger(__name__)

logger.info("=" * 80)
logger.info("IngredParse Backend Started - Logging Active")
logger.info("=" * 80)

app = FastAPI(title="IngredParse API", version="1.0.0")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

VALID_PERSONAS = {"kids", "clean_eating"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


# ── Eval Helpers ─────────────────────────────────────────────────────────────

def _empty_token_usage() -> dict:
    return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def _add_tokens(a: dict, b: dict) -> dict:
    return {k: a.get(k, 0) + b.get(k, 0) for k in ("prompt_tokens", "completion_tokens", "total_tokens")}


def _collect_eval(source: dict | None, key: str = "_agent_eval") -> dict:
    """Pop eval metrics from a dict, returning defaults if absent."""
    if not source:
        return {"token_usage": _empty_token_usage(), "llm_calls": 0, "duration_seconds": 0}
    return source.pop(key, {"token_usage": _empty_token_usage(), "llm_calls": 0, "duration_seconds": 0})


def _log_eval_summary(evals: dict) -> None:
    """Log the aggregated eval summary including validation results."""
    total_tokens = evals["total"]["token_usage"]["total_tokens"]
    total_calls = evals["total"]["llm_calls"]

    parts = [f"Total Tokens: {total_tokens} | Total LLM Calls: {total_calls}"]
    for agent_name in ("OCR", "IngredientAgent", "NutritionAgent", "AnalysisAgent"):
        agent_eval = evals.get(agent_name)
        if agent_eval:
            parts.append(f"{agent_name}: {agent_eval['token_usage']['total_tokens']} tokens, {agent_eval['llm_calls']} calls")

    summary = " | ".join(parts)
    logger.info(f"[EVALS] {summary}")

    # Log validation results
    ing_val = evals.get("IngredientValidation")
    if ing_val:
        status = "PASSED" if ing_val["valid"] else f"FAILED ({len(ing_val['issues'])} issues)"
        logger.info(f"[VALIDATION] Ingredient: {status} | Count: {ing_val.get('ingredient_count', 'N/A')}")
        if not ing_val["valid"]:
            for issue in ing_val["issues"]:
                logger.warning(f"  - {issue}")

    nutr_val = evals.get("NutritionValidation")
    if nutr_val:
        status = "PASSED" if nutr_val["valid"] else f"FAILED ({len(nutr_val['issues'])} issues)"
        logger.info(f"[VALIDATION] Nutrition: {status}")
        if not nutr_val["valid"]:
            for issue in nutr_val["issues"]:
                logger.warning(f"  - {issue}")

    output_val = evals.get("output_validation")
    if output_val:
        logger.info(
            f"[VALIDATION] Output: {output_val['total_fields_checked']} fields checked | "
            f"Pass rate: {output_val['pass_rate_pct']}% | "
            f"Rewritten: {output_val['fields_rewritten']} | "
            f"AI fallback: {output_val['fields_ai_fallback']} | "
            f"Missing context: {output_val['fields_with_missing_context']}"
        )
        if output_val["violations"]:
            for v in output_val["violations"]:
                logger.info(f"  [{v['category']}][{v['method']}] {v['field']}: '{v['original']}' -> '{v['replaced_with']}'")



# ── Helpers ───────────────────────────────────────────────────────────────────

def _save_upload(file: UploadFile) -> Path:
    """Save an uploaded file to a temp location. Returns the file path."""
    suffix = Path(file.filename).suffix.lower() if file.filename else ".jpg"
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Allowed: {ALLOWED_EXTENSIONS}"
        )
    tmp_dir = Path(tempfile.gettempdir()) / "ingredparse"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = tmp_dir / f"{uuid.uuid4()}{suffix}"
    tmp_path.write_bytes(file.file.read())
    return tmp_path


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/upload")
async def upload_image(image: UploadFile = File(...)):
    """
    Step 1 — OCR only.
    Accepts an image, extracts text, and returns the OCR result.
    Use this to let the frontend show extracted text before triggering analysis.

    Returns:
        {
          "ocr": { "text": "...", "confidence": 0.91, "engine": "easyocr", "duration_seconds": 8.2 },
          "classification": { "label_type": "ingredient_label" }
        }
    """
    tmp_path = _save_upload(image)
    try:
        ocr_result = extract_text(str(tmp_path))
    except ImageQualityError as e:
        raise HTTPException(status_code=422, detail=e.to_dict())
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        tmp_path.unlink(missing_ok=True)

    try:
        label_type = classify_label(ocr_result["text"])
    except ValueError as e:
        raise HTTPException(status_code=422, detail={"error": {"code": "UNRECOGNIZED_LABEL", "message": str(e)}})

    return {
        "ocr": ocr_result,
        "classification": {"label_type": label_type},
    }


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


@app.post("/api/parse")
def parse(
    images: List[UploadFile] = File(...),
    persona: str = Form(...),
):
    """
    Full pipeline — streams SSE progress events, then the final result.

    SSE events:  { "step": "ocr" | "classify" | "parse_ingredients" | "parse_nutrition" | "parse_both" }
    Final event: { "step": "done", "result": { ... } }
    Error event: { "step": "error", "message": "..." }
    """
    if persona not in VALID_PERSONAS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid persona '{persona}'. Must be one of {VALID_PERSONAS}"
        )

    # Read all file bytes up-front before entering the generator
    uploads = [(img.filename, img.file.read()) for img in images]

    def event_stream() -> Generator[str, None, None]:
        try:
            pipeline_start = time.time()
            evals = {}

            # ── Step 1: OCR ───────────────────────────────────────────────
            yield _sse({"step": "ocr"})
            combined_texts: list[str] = []
            combined_confidence: list[float] = []

            ocr_tokens_agg = _empty_token_usage()
            ocr_llm_calls_agg = 0
            for filename, file_bytes in uploads:
                suffix = Path(filename).suffix.lower() if filename else ".jpg"
                if suffix not in ALLOWED_EXTENSIONS:
                    continue
                tmp_dir = Path(tempfile.gettempdir()) / "ingredparse"
                tmp_dir.mkdir(parents=True, exist_ok=True)
                tmp_path = tmp_dir / f"{uuid.uuid4()}{suffix}"
                tmp_path.write_bytes(file_bytes)
                try:
                    ocr_result = extract_text(str(tmp_path))
                    combined_texts.append(ocr_result["text"])
                    if ocr_result.get("confidence") is not None:
                        combined_confidence.append(ocr_result["confidence"])
                    # Collect OCR eval
                    ocr_tokens_agg = _add_tokens(ocr_tokens_agg, ocr_result.get("token_usage", _empty_token_usage()))
                    ocr_llm_calls_agg += ocr_result.get("llm_calls", 0)
                except ImageQualityError as e:
                    logger.warning(f"[Parse] Skipping low-quality image {filename}: {e}")
                finally:
                    tmp_path.unlink(missing_ok=True)

            if not combined_texts:
                yield _sse({"step": "error", "message": "No readable text found in the uploaded image(s). Please retake a clearer photo."})
                return

            merged_text = "\n".join(combined_texts)
            avg_confidence = sum(combined_confidence) / len(combined_confidence) if combined_confidence else None
            evals["OCR"] = {"token_usage": ocr_tokens_agg, "llm_calls": ocr_llm_calls_agg}
            ocr_result = {"text": merged_text, "confidence": avg_confidence, "engine": "easyocr", "duration_seconds": 0}

            # ── Step 2: Classify ──────────────────────────────────────────
            yield _sse({"step": "classify"})
            try:
                label_type = classify_label(ocr_result["text"])
            except ValueError as e:
                yield _sse({"step": "error", "message": str(e)})
                return

            pipeline = {
                "ocr": ocr_result,
                "classification": {"label_type": label_type},
            }

            # ── Step 3: Parallel agents (ingredient/nutrition or both) ────
            if label_type == "both":
                # Both labels present — separate text and run agents in parallel
                yield _sse({"step": "parse_both"})
                try:
                    # Separate ingredients and nutrition sections
                    separated = separate_text(ocr_result["text"])
                    ing_text = separated["ingredient_text"]
                    nutr_text = separated["nutrition_text"]

                    logger.info(
                        f"[Pipeline] Text separated | "
                        f"IngredientTextLen: {len(ing_text)} | NutritionTextLen: {len(nutr_text)} | "
                        f"HasIngredients: {separated['has_ingredients']} | HasNutrition: {separated['has_nutrition']}"
                    )
                    logger.debug(f"[Pipeline] Ingredient text preview: {ing_text[:120]}...")
                    logger.debug(f"[Pipeline] Nutrition text preview: {nutr_text[:120]}...")

                    with ThreadPoolExecutor(max_workers=2) as executor:
                        ing_future = executor.submit(
                            run_ingredient_agent,
                            ing_text,
                            persona,
                            ocr_result.get("confidence"),
                            label_type,
                        )
                        nutr_future = executor.submit(
                            run_nutrition_agent,
                            nutr_text,
                            persona,
                            label_type,
                        )
                        logger.info("[Pipeline] Both agents submitted to executor")

                        # Wait for both — collect individually to isolate failures
                        ing_result = None
                        nutr_result = None

                        try:
                            ing_result = ing_future.result()
                            logger.info("[Pipeline] Ingredient agent completed successfully")
                        except Exception as e:
                            logger.error(f"[Pipeline] Ingredient agent FAILED: {type(e).__name__}: {e}")
                            raise

                        try:
                            nutr_result = nutr_future.result()
                            logger.info("[Pipeline] Nutrition agent completed successfully")
                        except Exception as e:
                            logger.error(f"[Pipeline] Nutrition agent FAILED: {type(e).__name__}: {e}")
                            raise

                    # Collect agent evals before merging
                    evals["IngredientAgent"] = _collect_eval(ing_result)
                    evals["NutritionAgent"] = _collect_eval(nutr_result)

                    # Collect validation logs
                    if ing_result and "_ingredient_validation" in ing_result:
                        evals["IngredientValidation"] = ing_result.pop("_ingredient_validation")
                    if nutr_result and "_nutrition_validation" in nutr_result.get("nutrition", {}):
                        evals["NutritionValidation"] = nutr_result["nutrition"].pop("_nutrition_validation")

                    # Capture intermediate state (post-parse, pre-analysis) for observability
                    pipeline["_intermediate"] = {
                        "ingredients": (ing_result or {}).get("parsed_output", {}).get("ingredients", []),
                        "nutrition": (nutr_result or {}).get("nutrition"),
                    }

                    # Run unified analysis on both parsed data
                    logger.info("[Pipeline] Starting analysis agent (combined mode)...")
                    analysis_result = run_analysis_agent(
                        ing_result,
                        nutr_result.get("nutrition"),
                        persona,
                        label_type,
                    )
                    evals["AnalysisAgent"] = _collect_eval(analysis_result)

                    pipeline.update(ing_result)
                    pipeline.update(nutr_result)
                    _merge_analysis_into_pipeline(pipeline, analysis_result)
                except (ParserError, AnalysisError) as e:
                    logger.error(f"[Pipeline] Both-mode error (Parser/Analysis): {e}")
                    yield _sse({"step": "error", "message": str(e)})
                    return
                except NutritionParserError as e:
                    logger.error(f"[Pipeline] Both-mode error (NutritionParser): {e}")
                    yield _sse({"step": "error", "message": str(e)})
                    return
                except TextSeparatorError as e:
                    logger.error(f"[Pipeline] Both-mode error (TextSeparator): {e}")
                    yield _sse({"step": "error", "message": str(e)})
                    return
                except Exception as e:
                    logger.error(f"[Pipeline] Both-mode UNEXPECTED error: {type(e).__name__}: {e}")
                    yield _sse({"step": "error", "message": f"Analysis failed: {str(e)}"})
                    return

            elif label_type == "ingredient_label":
                # Ingredient-only — run ingredient agent then analysis
                yield _sse({"step": "parse_ingredients"})
                try:
                    ing_result = run_ingredient_agent(
                        ocr_result["text"],
                        persona,
                        ocr_result.get("confidence"),
                        label_type,
                    )
                    evals["IngredientAgent"] = _collect_eval(ing_result)

                    # Collect validation log
                    if ing_result and "_ingredient_validation" in ing_result:
                        evals["IngredientValidation"] = ing_result.pop("_ingredient_validation")

                    # Capture intermediate state (post-parse, pre-analysis) for observability
                    pipeline["_intermediate"] = {
                        "ingredients": (ing_result or {}).get("parsed_output", {}).get("ingredients", []),
                        "nutrition": None,
                    }

                    # Run analysis on ingredient data only
                    analysis_result = run_analysis_agent(
                        ing_result,
                        None,
                        persona,
                        label_type,
                    )
                    evals["AnalysisAgent"] = _collect_eval(analysis_result)

                    pipeline.update(ing_result)
                    _merge_analysis_into_pipeline(pipeline, analysis_result)
                except (ParserError, AnalysisError) as e:
                    yield _sse({"step": "error", "message": str(e)})
                    return

            elif label_type == "nutrition_label":
                # Nutrition-only — run nutrition agent then analysis
                yield _sse({"step": "parse_nutrition"})
                try:
                    nutr_result = run_nutrition_agent(
                        ocr_result["text"],
                        persona,
                        label_type,
                    )
                    evals["NutritionAgent"] = _collect_eval(nutr_result)

                    # Collect validation log
                    if nutr_result and "_nutrition_validation" in nutr_result.get("nutrition", {}):
                        evals["NutritionValidation"] = nutr_result["nutrition"].pop("_nutrition_validation")

                    # Capture intermediate state (post-parse, pre-analysis) for observability
                    pipeline["_intermediate"] = {
                        "ingredients": None,
                        "nutrition": (nutr_result or {}).get("nutrition"),
                    }

                    # Run analysis on nutrition data only
                    analysis_result = run_analysis_agent(
                        None,
                        nutr_result.get("nutrition"),
                        persona,
                        label_type,
                    )
                    evals["AnalysisAgent"] = _collect_eval(analysis_result)

                    pipeline.update(nutr_result)
                    _merge_analysis_into_pipeline(pipeline, analysis_result)
                except NutritionParserError as e:
                    yield _sse({"step": "error", "message": str(e)})
                    return

            # ── Done ──────────────────────────────────────────────────────
            pipeline_duration = round(time.time() - pipeline_start, 1)

            # Aggregate eval totals
            total_tokens = _empty_token_usage()
            total_llm_calls = 0
            for agent_eval in evals.values():
                total_tokens = _add_tokens(total_tokens, agent_eval.get("token_usage", _empty_token_usage()))
                total_llm_calls += agent_eval.get("llm_calls", 0)
            evals["total"] = {"token_usage": total_tokens, "llm_calls": total_llm_calls}

            result = _shape_response(pipeline, persona)

            # Output Layer Validation — guardrail compliance check
            validation_log = validate_output(result)
            evals["output_validation"] = validation_log

            # Log full eval summary (agents + all validations)
            _log_eval_summary(evals)

            result["duration_seconds"] = pipeline_duration
            result["evals"] = evals

            # Store full scan log to Supabase observability table
            # (after duration + evals are set so pipeline_output is complete)
            record_scan_log(
                scan_id=result.get("scan_id", ""),
                pipeline_result=result,
                intermediate=pipeline.get("_intermediate"),
            )

            yield _sse({"step": "done", "result": result})

        except Exception as e:
            yield _sse({"step": "error", "message": f"Unexpected error: {str(e)}"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _merge_analysis_into_pipeline(pipeline: dict, analysis_result: dict) -> None:
    """
    Merge analysis agent results into the pipeline.
    Moves nutrition_persona_flags into the nutrition dict for consistency.

    Args:
        pipeline: The main pipeline dict (modified in-place)
        analysis_result: Output of run_analysis_agent
    """
    # Merge nutrition persona flags into the nutrition dict
    if "nutrition_persona_flags" in analysis_result:
        if "nutrition" not in pipeline:
            pipeline["nutrition"] = {}
        pipeline["nutrition"]["persona_flags"] = analysis_result.pop("nutrition_persona_flags")

    # Merge all remaining analysis results into pipeline
    pipeline.update(analysis_result)


def _merge_product_info(product_info: dict, nutrition: dict | None) -> dict:
    """
    For nutrition-only scans the ingredient parser never runs, so product_info
    is empty. If the nutrition parser extracted a probable_product_name, use it.
    Ingredient-only or combined scans: product_info from the parser takes priority.
    """
    result = dict(product_info)
    if not result.get("probable_product_name") and nutrition:
        result["probable_product_name"] = nutrition.get("probable_product_name")
    return result


# Verdict severity — higher number = worse / stricter
_VERDICT_SEVERITY = {
    "not_recommended":       2,
    "moderately_recommended": 1,
    "highly_recommended":    0,
}


def _normalise_nutrition_verdict(verdict: dict) -> dict:
    """
    Normalise a nutrition verdict so its highlights use the same shape as
    ingredient verdicts: {"ingredient": "...", "reason": "..."}.

    Nutrition analysis produces {"nutrient": flag, "reason": msg}.
    Frontend AnalysisResult type always expects {"ingredient": ..., "reason": ...}.
    """
    if not verdict:
        return verdict
    normalised_highlights = [
        {
            "ingredient": h.get("nutrient", h.get("ingredient", "")),
            "reason":     h.get("reason", ""),
        }
        for h in verdict.get("highlights", [])
    ]
    return {**verdict, "highlights": normalised_highlights}


def _resolve_verdict(pipeline: dict, persona: str) -> dict:
    """
    Determine the final analysis.verdict for the response.

    - ingredient_label only : use ingredient verdict (from run_analysis_agent)
    - nutrition_label only  : use nutrition verdict (from run_analysis_agent, normalised)
    - both                  : use combined verdict (already synthesized by run_analysis_agent)
    """
    label_type = (pipeline.get("classification") or {}).get("label_type", "")
    verdict = pipeline.get("verdict") or {}

    # Check if this is a combined verdict (generated by analysis_agent)
    analysis_type = pipeline.get("analysis_type", "")
    if analysis_type == "combined" and verdict.get("ingredient_verdict") and verdict.get("nutrition_verdict"):
        # Verdict was already combined by analysis_agent — use it as-is
        return verdict

    # Single-label verdicts
    if label_type == "nutrition_label":
        nutrition_verdict = _normalise_nutrition_verdict(
            pipeline.get("nutrition_verdict") or {}
        )
        return nutrition_verdict

    if label_type == "ingredient_label":
        return verdict

    # Fallback for combined when analysis_agent wasn't called (shouldn't happen)
    ingredient_verdict = verdict
    nutrition_verdict  = _normalise_nutrition_verdict(
        (pipeline.get("nutrition") or {}).get("verdict") or {}
    )

    # Synthesize combined verdict via GPT-4 (legacy fallback)
    ing_sev  = _VERDICT_SEVERITY.get(ingredient_verdict.get("label", ""), 0)
    nutr_sev = _VERDICT_SEVERITY.get(nutrition_verdict.get("label", ""), 0)
    stricter_label = nutrition_verdict.get("label") if nutr_sev > ing_sev else ingredient_verdict.get("label")

    # Build combined verdict prompt context
    signals = pipeline.get("signals", {})
    sugar_count = signals.get("sugar", {}).get("count", 0)
    sodium_count = signals.get("sodium", {}).get("count", 0)
    processed_fat_count = signals.get("processed_fat", {}).get("count", 0)

    nutrition_flags_text = ""
    if pipeline.get("nutrition", {}).get("persona_flags"):
        flags = pipeline["nutrition"]["persona_flags"]
        flag_items = [f for f in [
            "high_sugar" if flags.get("high_sugar") else None,
            "high_sodium" if flags.get("high_sodium") else None,
            "high_sat_fat" if flags.get("high_sat_fat") else None,
            "high_trans_fat" if flags.get("high_trans_fat") else None,
            "low_fiber" if flags.get("low_fiber") else None,
            "low_protein" if flags.get("low_protein") else None,
        ] if f]
        nutrition_flags_text = ", ".join(flag_items) if flag_items else "None"

    ingredient_highlights_str = json.dumps(ingredient_verdict.get("highlights", []))
    nutrition_highlights_str = json.dumps(nutrition_verdict.get("highlights", []))

    prompt = COMBINED_VERDICT_PROMPT.format(
        persona=persona,
        ingredient_label=ingredient_verdict.get("label", "moderately_recommended"),
        ingredient_summary=ingredient_verdict.get("summary", ""),
        ingredient_highlights=ingredient_highlights_str,
        nutrition_label=nutrition_verdict.get("label", "moderately_recommended"),
        nutrition_summary=nutrition_verdict.get("summary", ""),
        nutrition_highlights=nutrition_highlights_str,
        nutrition_flags=nutrition_flags_text,
        sugar_count=sugar_count,
        sodium_count=sodium_count,
        processed_fat_count=processed_fat_count,
    )

    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        combined_result = json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.warning(f"Combined verdict synthesis failed: {e}. Using stricter verdict fallback.")
        combined_result = {
            "summary": ingredient_verdict.get("summary", "") or nutrition_verdict.get("summary", ""),
            "highlights": ingredient_verdict.get("highlights", []) or nutrition_verdict.get("highlights", []),
        }

    return {
        "persona": persona,
        "safe": stricter_label in ["moderately_recommended", "highly_recommended"],
        "label": stricter_label,
        "summary": combined_result.get("summary", ""),
        "highlights": combined_result.get("highlights", []),
    }


def _shape_response(pipeline: dict, persona: str) -> dict:
    """
    Reshape the internal pipeline dict into the final API response format.

    Internal format uses nested parsed_output structure.
    Final format has top-level ingredients, nested analysis, and metadata.
    """
    parsed = pipeline.get("parsed_output", {})
    internal_meta = parsed.get("metadata", {})
    label_type = (pipeline.get("classification") or {}).get("label_type")

    return {
        "scan_id": str(uuid.uuid4()),
        "ocr": pipeline.get("ocr", {}),
        "classification": pipeline.get("classification", {}),
        "nutrition": pipeline.get("nutrition"),
        "ingredients": parsed.get("ingredients", []),
        "analysis": {
            "allergens":              pipeline.get("allergens", {}),
            "signals":                pipeline.get("signals", {}),
            "category_distribution":  pipeline.get("category_distribution", {}),
            "macro_dominance":        pipeline.get("macro_dominance", {}),
            "additive_density":       pipeline.get("additive_density", None),
            "ingredient_complexity":  pipeline.get("ingredient_complexity", {}),
            "watchlist":              pipeline.get("watchlist", []),
            "positive_signals":       pipeline.get("positive_signals", []),
            "verdict":                _resolve_verdict(pipeline, persona),
        },
        "metadata": {
            "product_info":          _merge_product_info(
                                         parsed.get("product_info", {}),
                                         pipeline.get("nutrition"),
                                     ),
            "notes":                 parsed.get("notes", []),
            "input_type":            label_type,
            "input_category":        internal_meta.get("input_category"),
            "ocr_confidence":        internal_meta.get("ocr_confidence"),
            "processing_timestamp":  internal_meta.get("processing_timestamp"),
        },
    }


# ── SME Review Endpoints ───────────────────────────────────────────────────────

@app.get("/api/sme/queue")
def sme_get_queue(status: str = "pending"):
    """
    Fetch all ingredients in ingredient_review table with given status.

    Query params:
        status: 'pending' | 'approved' | 'rejected' (default: 'pending')

    Returns:
        List of review items.
    """
    if status not in {"pending", "approved", "rejected"}:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{status}'. Must be one of: pending, approved, rejected"
        )
    try:
        return {"data": get_queue(status)}
    except SMEError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sme/queue/{item_id}")
def sme_get_item(item_id: int):
    """
    Fetch a single review item by id.

    Returns:
        Review item with all fields.
    """
    try:
        return get_review_item(item_id)
    except SMEError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/sme/queue/{item_id}")
def sme_update_item(item_id: int, data: dict = Body(...)):
    """
    Update a review item (save draft).

    Allowed fields: name, functional_role, json_data, sme_notes

    Request body: JSON object with fields to update

    Returns:
        Updated review item.
    """
    try:
        return update_review_item(item_id, data)
    except SMEError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sme/queue/{item_id}/approve")
def sme_approve_item(item_id: int, body: dict = Body(...)):
    """
    Approve a review item and upsert it to ingredonly table.

    Request body:
        { "reviewed_by": "SME Name" }

    Returns:
        Updated review item with status = approved.
    """
    reviewed_by = body.get("reviewed_by", "").strip() if isinstance(body, dict) else ""
    if not reviewed_by:
        raise HTTPException(
            status_code=400,
            detail="reviewed_by is required and must not be empty"
        )
    try:
        return approve_item(item_id, reviewed_by)
    except SMEError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sme/queue/{item_id}/reject")
def sme_reject_item(item_id: int, body: dict = Body(...)):
    """
    Reject a review item (no upsert to ingredonly).

    Request body:
        { "reviewed_by": "SME Name" }

    Returns:
        Updated review item with status = rejected.
    """
    reviewed_by = body.get("reviewed_by", "").strip() if isinstance(body, dict) else ""
    if not reviewed_by:
        raise HTTPException(
            status_code=400,
            detail="reviewed_by is required and must not be empty"
        )
    try:
        return reject_item(item_id, reviewed_by)
    except SMEError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── SME — ingredonly DB Browser Endpoints ─────────────────────────────────────

@app.get("/api/sme/db-ingredients/search")
def sme_search_ingredonly(q: str = ""):
    """
    Search ingredonly table by partial name match.
    Used to show possible matches during review.

    Query params:
        q: search string

    Returns:
        List of matching ingredients.
    """
    try:
        return {"data": search_ingredonly(q)}
    except SMEError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sme/db-ingredients")
def sme_list_ingredonly(offset: int = 0, limit: int = 50):
    """
    List all ingredients in ingredonly table with pagination.

    Query params:
        offset: starting row (default 0)
        limit: max rows (default 50)

    Returns:
        { data: [...], total: N }
    """
    try:
        return get_all_ingredonly(offset, limit)
    except SMEError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sme/db-ingredients/{item_id}")
def sme_get_ingredonly(item_id: int):
    """Fetch a single ingredient from ingredonly by id."""
    try:
        return get_ingredonly_item(item_id)
    except SMEError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/sme/db-ingredients/{item_id}")
def sme_update_ingredonly(item_id: int, data: dict = Body(...)):
    """
    Update an existing ingredient in ingredonly table.

    Allowed fields: name, json_data

    Returns:
        Updated ingredient row.
    """
    try:
        return update_ingredonly_item(item_id, data)
    except SMEError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Decision Signal (North Star Eval) ─────────────────────────────────────────

@app.post("/api/evals/decision-signal")
def post_decision_signal(payload: dict = Body(...)):
    """
    Record user behavior signals from the results screen.
    Classifies session as: informed / partial / no_decision.
    Stores to Supabase `observability` table.

    Body:
        {
            "scan_id": str,
            "session_id": str,
            "time_on_screen_seconds": float,
            "interactions": { ... },
            "scans_in_session": int,
            "scan_sequence": int,
            "label_type": str | null,
            "persona": str | null
        }

    Returns:
        Classification result with decision_status.
    """
    try:
        return record_decision_signal(payload)
    except Exception as e:
        logger.error(f"[DecisionSignal] Endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
