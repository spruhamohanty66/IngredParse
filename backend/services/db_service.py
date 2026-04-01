"""
DB Service — Supabase
Matches parsed ingredients against the ingredonly table.
Enriches each ingredient's db_data field with matched json_data.
"""

import os
import logging
from supabase import create_client, Client
from rapidfuzz import process, fuzz

logger = logging.getLogger(__name__)

FUZZY_THRESHOLD = 80
_client: Client = None


class DBError(Exception):
    """Raised when Supabase connection or query fails."""
    code = "DB_ERROR"


# ── Supabase client ───────────────────────────────────────────────────────────

def _get_client() -> Client:
    """Lazy-load Supabase client."""
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if not url or not key:
            raise DBError("SUPABASE_URL or SUPABASE_KEY not set in .env")
        _client = create_client(url, key)
    return _client


# ── Matching logic ────────────────────────────────────────────────────────────

def _normalize(name: str) -> str:
    return name.lower().strip()


def _exact_match(name: str) -> dict | None:
    """Search Supabase for an exact (case-insensitive) match on the name column."""
    try:
        client = _get_client()
        normalized = _normalize(name)
        response = client.table("ingredonly") \
            .select("id, name, json_data") \
            .ilike("name", f"%{normalized}%") \
            .limit(1) \
            .execute()
        if response.data:
            return response.data[0]
        return None
    except Exception as e:
        raise DBError(f"Exact match query failed: {e}")


def _fetch_all() -> list:
    """Fetch all ingredient names from DB for fuzzy matching."""
    try:
        client = _get_client()
        response = client.table("ingredonly").select("id, name, json_data").execute()
        return response.data or []
    except Exception as e:
        raise DBError(f"Failed to fetch ingredient list: {e}")


def _fuzzy_match(name: str, all_rows: list) -> dict | None:
    """Find the closest match using rapidfuzz against all DB names."""
    normalized = _normalize(name)
    choices = {row["id"]: _normalize(row["name"]) for row in all_rows}

    result = process.extractOne(
        normalized,
        choices,
        scorer=fuzz.partial_ratio,
        score_cutoff=FUZZY_THRESHOLD
    )

    if result:
        matched_id = result[2]
        return next((row for row in all_rows if row["id"] == matched_id), None)
    return None


def lookup_ingredient(name: str, all_rows: list) -> tuple[dict | None, str]:
    """
    Look up a single ingredient. Returns (matched_row, match_status).

    match_status: "exact" | "fuzzy" | "unmapped"
    """
    # Step 1 — exact match
    match = _exact_match(name)
    if match:
        return match, "exact"

    # Step 2 — fuzzy match
    match = _fuzzy_match(name, all_rows)
    if match:
        return match, "fuzzy"

    return None, "unmapped"


# ── Tool call handler ─────────────────────────────────────────────────────────

def tool_lookup(ingredient_name: str, all_rows: list) -> dict:
    """
    Tool call handler for the parser's agentic loop.
    Called once per ingredient by GPT-4 during parsing.

    Returns:
        {
            "match_status": "exact" | "fuzzy" | "unmapped",
            "db_data": { ...json_data fields... } | {}
        }
    """
    match, status = lookup_ingredient(ingredient_name, all_rows)
    logger.info("[DB Tool] %-40s → %s", ingredient_name, status)
    return {
        "match_status": status,
        "db_data": match["json_data"] if match else {}
    }


# ── Enrichment (legacy — kept for tests) ──────────────────────────────────────

def enrich_parsed_output(parsed_output: dict) -> dict:
    """
    Enrich all ingredients in parsed_output with db_data from Supabase.
    Modifies parsed_output in place and returns it.

    Adds match_status field to each ingredient:
      "exact"    — matched by ilike search
      "fuzzy"    — matched by rapidfuzz
      "unmapped" — no match found
    """
    ingredients = parsed_output.get("parsed_output", {}).get("ingredients", [])
    if not ingredients:
        return parsed_output

    # Fetch all rows once for fuzzy matching (avoids N+1 queries)
    all_rows = _fetch_all()

    for ingredient in ingredients:
        name = ingredient.get("raw_text", "")
        if not name:
            ingredient["match_status"] = "unmapped"
            continue

        match, status = lookup_ingredient(name, all_rows)
        ingredient["match_status"] = status
        ingredient["source"] = "db" if match else ingredient.get("source", "packaging")
        ingredient["db_data"] = match["json_data"] if match else {}

        logger.info("[DB] %-40s → %s", name, status)

        # Also enrich sub-ingredients
        for sub in ingredient.get("sub_ingredients", []):
            sub_name = sub.get("raw_text", "")
            if not sub_name:
                sub["match_status"] = "unmapped"
                continue
            sub_match, sub_status = lookup_ingredient(sub_name, all_rows)
            sub["match_status"] = sub_status
            sub["source"] = "db" if sub_match else sub.get("source", "packaging")
            sub["db_data"] = sub_match["json_data"] if sub_match else {}
            logger.info("[DB]   %-38s → %s", sub_name, sub_status)

    return parsed_output
