"""
Decision Signal Service + Scan Log
Stores full pipeline output per scan and tracks user behavior on the results
screen to infer whether the analysis led to an informed user decision.

Scan Log:
  - Full pipeline output (OCR, classification, ingredients, analysis, verdict, evals)
  - Stored by backend after pipeline completes
  - Evals (including L1 harmless metrics) live inside pipeline_output JSON

North Star Metric: % of analyses that lead to informed user decisions

Classification Logic:
  - Informed Decision  : time >= 10s AND (>= 1 interaction OR >= 2 scans in session)
  - Partial Engagement : time >= 5s but doesn't meet Informed criteria
  - No Decision        : time < 5s AND 0 interactions

Tracked Interactions (interactive charts only):
  - ingredient_category_click  — IngredientBreakdown category toggle
  - macro_bar_click            — MacroNutrientsBar segment click
  - nutrient_chip_click        — NutrientQualityMap category chip
  - watchlist_expand           — WatchlistSection accordion expand
  - serving_toggle             — Per Serving / Full Pack toggle

Storage: Supabase `observability` table
"""

from __future__ import annotations

import json
import os
import logging
from datetime import datetime, timezone

from supabase import create_client, Client

logger = logging.getLogger(__name__)

# ── Thresholds ───────────────────────────────────────────────────────────────

INFORMED_TIME_THRESHOLD = 10   # seconds
PARTIAL_TIME_THRESHOLD = 5     # seconds
INFORMED_MIN_INTERACTIONS = 1
INFORMED_MIN_SCANS = 2

# ── Supabase client ──────────────────────────────────────────────────────────

_client: Client = None


def _get_client() -> Client:
    """Lazy-load Supabase client."""
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if not url or not key:
            raise DecisionSignalError("SUPABASE_URL or SUPABASE_KEY not set in .env")
        _client = create_client(url, key)
    return _client


class DecisionSignalError(Exception):
    """Raised when decision signal processing fails."""
    pass


# ── Classification ───────────────────────────────────────────────────────────

def classify_decision(
    time_on_screen_seconds: float,
    total_interactions: int,
    scans_in_session: int,
) -> str:
    """
    Classify a session into one of three decision statuses.

    Args:
        time_on_screen_seconds: Time user spent on results screen.
        total_interactions: Sum of all tracked interaction counts.
        scans_in_session: Number of products scanned in this session.

    Returns:
        "informed" | "partial" | "no_decision"
    """
    has_sufficient_time = time_on_screen_seconds >= INFORMED_TIME_THRESHOLD
    has_interactions = total_interactions >= INFORMED_MIN_INTERACTIONS
    has_multiple_scans = scans_in_session >= INFORMED_MIN_SCANS

    if has_sufficient_time and (has_interactions or has_multiple_scans):
        return "informed"

    if time_on_screen_seconds >= PARTIAL_TIME_THRESHOLD:
        return "partial"

    return "no_decision"


# ── Scan Log (Full Pipeline + L1 Harmless Metrics) ─────────────────────────

def record_scan_log(scan_id: str, pipeline_result: dict, intermediate: dict | None = None) -> None:
    """
    Store the full end-to-end scan data to the observability table.
    Called from the backend pipeline after the response is fully built.

    This creates the initial row for the scan. The decision signal from the
    frontend later upserts user behavior data onto this same row.

    Stored per scan:
      - scan_id, label_type, persona
      - OCR text, confidence, engine
      - Full pipeline output JSON (ingredients, analysis, nutrition, verdict, evals)
      - analysis_json: analysis section only (for direct eval queries)
      - intermediate_json: parsed data after OCR+parsing+DB matching, before analysis
      - Duration

    Validation stats and L1 harmless counts are inside pipeline_output.evals.output_validation.

    Args:
        scan_id: Unique scan identifier (from _shape_response).
        pipeline_result: The full shaped response dict (from _shape_response + evals).
        intermediate: Parsed ingredient/nutrition data captured before analysis ran.
    """
    ocr_data = pipeline_result.get("ocr", {})
    classification = pipeline_result.get("classification", {})
    label_type = classification.get("label_type")
    persona = (pipeline_result.get("analysis", {}).get("verdict") or {}).get("persona")

    # Store only application output — strip evals and duration (computed separately)
    output_only = {k: v for k, v in pipeline_result.items() if k not in ("evals", "duration_seconds")}

    # Extract analysis section separately for direct eval queries
    analysis_data = pipeline_result.get("analysis", {})

    record = {
        "scan_id": scan_id,
        "label_type": label_type,
        "persona": persona,
        "ocr_text": ocr_data.get("text"),
        "ocr_confidence": ocr_data.get("confidence"),
        "ocr_engine": ocr_data.get("engine"),
        "pipeline_output": json.dumps(output_only),
        "analysis_json": json.dumps(analysis_data),
        "ocr_extracted_input": ocr_data.get("text"),
        "intermediate_json": json.dumps(intermediate) if intermediate else None,
        "duration_seconds": pipeline_result.get("duration_seconds"),
    }

    try:
        client = _get_client()
        client.table("observability").insert(record).execute()
        logger.info(
            "[ScanLog] Stored: scan=%s | type=%s persona=%s | duration=%.1fs",
            scan_id, label_type, persona,
            pipeline_result.get("duration_seconds", 0),
        )
    except Exception as e:
        logger.error("[ScanLog] Failed to store to Supabase: %s", e)
        # Non-blocking — don't fail the pipeline


# ── Public API ───────────────────────────────────────────────────────────────

def record_decision_signal(payload: dict) -> dict:
    """
    Process and store a decision signal from the frontend.

    Args:
        payload: {
            "scan_id": str,
            "session_id": str,
            "time_on_screen_seconds": float,
            "interactions": {
                "ingredient_category_click": int,
                "macro_bar_click": int,
                "nutrient_chip_click": int,
                "watchlist_expand": int,
                "serving_toggle": int,
            },
            "scans_in_session": int,
            "scan_sequence": int,
            "label_type": str | None,
            "persona": str | None,
        }

    Returns:
        {
            "scan_id": str,
            "session_id": str,
            "decision_status": "informed" | "partial" | "no_decision",
            "time_on_screen_seconds": float,
            "total_interactions": int,
            "scans_in_session": int,
        }
    """
    scan_id = payload.get("scan_id", "")
    session_id = payload.get("session_id", "")
    time_on_screen = payload.get("time_on_screen_seconds", 0)
    interactions = payload.get("interactions", {})
    scans_in_session = payload.get("scans_in_session", 1)
    scan_sequence = payload.get("scan_sequence", 1)
    label_type = payload.get("label_type")
    persona = payload.get("persona")

    total_interactions = sum(interactions.values())

    # Classify
    decision_status = classify_decision(
        time_on_screen_seconds=time_on_screen,
        total_interactions=total_interactions,
        scans_in_session=scans_in_session,
    )

    # Build record for Supabase
    record = {
        "scan_id": scan_id,
        "session_id": session_id,
        "decision_status": decision_status,
        "time_on_screen_seconds": round(time_on_screen, 1),
        "total_interactions": total_interactions,
        "interactions": interactions,
        "scans_in_session": scans_in_session,
        "scan_sequence": scan_sequence,
        "label_type": label_type,
        "persona": persona,
    }

    # Store to Supabase — upsert so we update the existing row created by
    # record_harmless_metrics (matched on scan_id unique index).
    # If no prior row exists (e.g. harmless logging was skipped), this inserts.
    try:
        client = _get_client()
        client.table("observability").upsert(
            record, on_conflict="scan_id"
        ).execute()
        logger.info(
            "[DecisionSignal] Recorded: scan=%s session=%s status=%s "
            "time=%.1fs interactions=%d scans=%d",
            scan_id, session_id, decision_status,
            time_on_screen, total_interactions, scans_in_session,
        )
    except Exception as e:
        logger.error("[DecisionSignal] Failed to store to Supabase: %s", e)
        # Non-blocking — don't fail the user flow

    result = {
        "scan_id": scan_id,
        "session_id": session_id,
        "decision_status": decision_status,
        "time_on_screen_seconds": round(time_on_screen, 1),
        "total_interactions": total_interactions,
        "scans_in_session": scans_in_session,
    }

    return result
