"""
SME Service — Human Review Queue Management
Stores pending ingredients for SME (Subject Matter Expert) review and validation.
Handles CRUD operations on ingredient_review table.
"""

import os
from datetime import datetime
from supabase import create_client, Client


_client: Client = None


class SMEError(Exception):
    """Raised when SME service operation fails."""
    code = "SME_ERROR"


# ── Supabase client ───────────────────────────────────────────────────────────

def _get_client() -> Client:
    """Lazy-load Supabase client."""
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if not url or not key:
            raise SMEError("SUPABASE_URL or SUPABASE_KEY not set in .env")
        _client = create_client(url, key)
    return _client


# ── Save for review ───────────────────────────────────────────────────────────

def save_for_review(ingredient: dict) -> dict:
    """
    Save an ingredient with human_review status to the ingredient_review queue.

    Args:
        ingredient: dict with keys:
          - raw_text (str): OCR name (display only)
          - functional_role (str, optional): top-level ingredient field
          - db_data (dict): GPT-4 enriched metadata

    Returns:
        The inserted row from ingredient_review table (with id, submitted_at, etc.)

    Raises:
        SMEError if insertion fails or duplicate detection fails.
    """
    client = _get_client()
    raw_name = ingredient.get("raw_text", "").strip()
    if not raw_name:
        raise SMEError("Cannot save ingredient with empty raw_text")

    db_data = ingredient.get("db_data", {})
    functional_role = ingredient.get("functional_role")

    # Extract common_names from db_data if available
    common_names = db_data.get("common_names", [])
    if isinstance(common_names, list) and common_names:
        name = ", ".join(common_names)
    else:
        name = None

    # Deduplication 1: check if raw_name already has a pending or approved row
    try:
        existing = client.table("ingredient_review") \
            .select("id, status") \
            .eq("raw_name", raw_name) \
            .in_("status", ["pending", "approved"]) \
            .execute()
        if existing.data:
            row = existing.data[0]
            print(f"[SME] '{raw_name}' already in review queue (status={row['status']}), skipping")
            return row
    except Exception as e:
        raise SMEError(f"Deduplication check failed: {e}")

    # Deduplication 2: check if ingredient already exists in ingredonly (by name)
    try:
        common_names_str = name or raw_name
        existing_db = client.table("ingredonly") \
            .select("id, name") \
            .ilike("name", f"%{common_names_str.split(',')[0].strip()}%") \
            .limit(1) \
            .execute()
        if existing_db.data:
            print(f"[SME] '{raw_name}' already exists in ingredonly as '{existing_db.data[0]['name']}', skipping")
            return {"id": existing_db.data[0]["id"], "status": "already_in_db"}
    except Exception as e:
        # Non-blocking — log and continue with insert
        print(f"[SME] ingredonly dedup check failed (non-blocking): {e}")

    # Insert into ingredient_review
    try:
        result = client.table("ingredient_review").insert({
            "raw_name": raw_name,
            "name": name,
            "functional_role": functional_role,
            "json_data": db_data,
            "status": "pending",
            "source": "gpt4"
        }).execute()

        if result.data:
            print(f"[SME] Saved '{raw_name}' to review queue")
            return result.data[0]
        else:
            raise SMEError(f"Insert returned no data for '{raw_name}'")
    except Exception as e:
        raise SMEError(f"Failed to insert ingredient for review: {e}")


# ── Queue retrieval ───────────────────────────────────────────────────────────

def get_queue(status: str = "pending") -> list:
    """
    Fetch all ingredients in ingredient_review with given status.

    Args:
        status: 'pending' | 'approved' | 'rejected'

    Returns:
        List of review items with all fields.

    Raises:
        SMEError if query fails.
    """
    client = _get_client()
    try:
        result = client.table("ingredient_review") \
            .select("*") \
            .eq("status", status) \
            .order("submitted_at", desc=True) \
            .execute()
        return result.data or []
    except Exception as e:
        raise SMEError(f"Failed to fetch queue (status={status}): {e}")


def get_review_item(item_id: int) -> dict:
    """
    Fetch a single review item by id.

    Args:
        item_id: ingredient_review.id

    Returns:
        Review item dict with all fields.

    Raises:
        SMEError if not found or query fails.
    """
    client = _get_client()
    try:
        result = client.table("ingredient_review") \
            .select("*") \
            .eq("id", item_id) \
            .single() \
            .execute()
        return result.data
    except Exception as e:
        raise SMEError(f"Failed to fetch item {item_id}: {e}")


# ── Update ───────────────────────────────────────────────────────────────────

def update_review_item(item_id: int, data: dict) -> dict:
    """
    Update a review item (save draft).
    Caller can pass any subset of: name, functional_role, json_data, sme_notes.

    Args:
        item_id: ingredient_review.id
        data: dict with fields to update

    Returns:
        Updated row.

    Raises:
        SMEError if update fails.
    """
    client = _get_client()
    # Only allow these fields to be updated
    allowed_keys = {"name", "functional_role", "json_data", "sme_notes"}
    update_data = {k: v for k, v in data.items() if k in allowed_keys}

    if not update_data:
        raise SMEError("No valid fields to update")

    try:
        result = client.table("ingredient_review") \
            .update(update_data) \
            .eq("id", item_id) \
            .execute()
        if result.data:
            print(f"[SME] Updated item {item_id}")
            return result.data[0]
        else:
            raise SMEError(f"Update returned no data for id {item_id}")
    except Exception as e:
        raise SMEError(f"Failed to update item {item_id}: {e}")


# ── Approve & upsert to ingredonly ─────────────────────────────────────────

def approve_item(item_id: int, reviewed_by: str) -> dict:
    """
    Approve a review item and upsert it to the ingredonly table.

    Steps:
    1. Fetch the review item
    2. Check for near-duplicate in ingredonly (prevent duplicate entries)
    3. Set human_review_flag = false in json_data
    4. Upsert into ingredonly (on name column)
    5. Set status = approved, reviewed_at = now, reviewed_by in ingredient_review

    Args:
        item_id: ingredient_review.id
        reviewed_by: SME name (str)

    Returns:
        Updated review item.

    Raises:
        SMEError if any step fails.
    """
    client = _get_client()

    # Step 1: Fetch the review item
    try:
        item = get_review_item(item_id)
    except SMEError:
        raise

    if not item.get("name"):
        raise SMEError(f"Cannot approve item {item_id}: name is empty. Set common names first.")

    name = item["name"]
    json_data = item.get("json_data", {})

    # Step 2: Check for near-duplicate in ingredonly before upserting
    # Split name into individual common names and check each
    try:
        name_parts = [n.strip().lower() for n in name.replace("|", ",").split(",") if n.strip()]
        for part in name_parts:
            dup_check = client.table("ingredonly") \
                .select("id, name") \
                .ilike("name", f"%{part}%") \
                .execute()
            if dup_check.data:
                existing_name = dup_check.data[0]["name"]
                # If it's the same row (exact name match), allow upsert (update)
                if existing_name.strip().lower() != name.strip().lower():
                    raise SMEError(
                        f"Cannot approve: similar ingredient already exists in DB as "
                        f"'{existing_name}'. Please merge or use the existing entry."
                    )
    except SMEError:
        raise
    except Exception as e:
        # Non-blocking log — proceed with upsert if check fails
        print(f"[SME] Duplicate check warning (non-blocking): {e}")

    # Step 3: Set human_review_flag = false
    json_data["human_review_flag"] = False

    # Step 4: Upsert into ingredonly
    try:
        upsert_result = client.table("ingredonly").upsert({
            "name": name,
            "json_data": json_data
        }, on_conflict="name").execute()
        print(f"[SME] Upserted '{name}' to ingredonly")
    except Exception as e:
        raise SMEError(f"Failed to upsert to ingredonly: {e}")

    # Step 5: Update ingredient_review status
    try:
        result = client.table("ingredient_review").update({
            "status": "approved",
            "reviewed_at": datetime.utcnow().isoformat(),
            "reviewed_by": reviewed_by
        }).eq("id", item_id).execute()

        if result.data:
            print(f"[SME] Approved item {item_id}, upserted to ingredonly")
            return result.data[0]
        else:
            raise SMEError(f"Approval update returned no data for id {item_id}")
    except Exception as e:
        raise SMEError(f"Failed to mark item approved: {e}")


# ── Reject ───────────────────────────────────────────────────────────────────

def reject_item(item_id: int, reviewed_by: str) -> dict:
    """
    Reject a review item (no upsert to ingredonly).

    Args:
        item_id: ingredient_review.id
        reviewed_by: SME name (str)

    Returns:
        Updated review item.

    Raises:
        SMEError if update fails.
    """
    client = _get_client()
    try:
        result = client.table("ingredient_review").update({
            "status": "rejected",
            "reviewed_at": datetime.utcnow().isoformat(),
            "reviewed_by": reviewed_by
        }).eq("id", item_id).execute()

        if result.data:
            print(f"[SME] Rejected item {item_id}")
            return result.data[0]
        else:
            raise SMEError(f"Rejection update returned no data for id {item_id}")
    except Exception as e:
        raise SMEError(f"Failed to mark item rejected: {e}")


# ── ingredonly DB Browser ────────────────────────────────────────────────────

def search_ingredonly(query: str) -> list:
    """
    Search ingredonly table by partial name match.
    Used to show possible matches when reviewing a pending ingredient.

    Args:
        query: search string (partial ingredient name)

    Returns:
        List of matching rows (id, name, json_data).
    """
    client = _get_client()
    if not query or not query.strip():
        return []

    try:
        result = client.table("ingredonly") \
            .select("id, name, json_data") \
            .ilike("name", f"%{query.strip()}%") \
            .limit(10) \
            .execute()
        return result.data or []
    except Exception as e:
        raise SMEError(f"Failed to search ingredonly: {e}")


def get_all_ingredonly(offset: int = 0, limit: int = 50) -> dict:
    """
    Fetch all ingredients from ingredonly table with pagination.

    Args:
        offset: starting row index
        limit: max rows to return (default 50)

    Returns:
        dict with 'data' (list of rows) and 'total' (count).
    """
    client = _get_client()
    try:
        # Fetch page
        result = client.table("ingredonly") \
            .select("id, name, json_data") \
            .order("name") \
            .range(offset, offset + limit - 1) \
            .execute()

        # Get total count
        count_result = client.table("ingredonly") \
            .select("id", count="exact") \
            .execute()

        return {
            "data": result.data or [],
            "total": count_result.count if count_result.count is not None else len(result.data or []),
        }
    except Exception as e:
        raise SMEError(f"Failed to fetch ingredonly list: {e}")


def get_ingredonly_item(item_id: int) -> dict:
    """
    Fetch a single ingredient from ingredonly by id.

    Args:
        item_id: ingredonly.id

    Returns:
        Row dict with id, name, json_data.

    Raises:
        SMEError if not found.
    """
    client = _get_client()
    try:
        result = client.table("ingredonly") \
            .select("id, name, json_data") \
            .eq("id", item_id) \
            .single() \
            .execute()
        return result.data
    except Exception as e:
        raise SMEError(f"Failed to fetch ingredonly item {item_id}: {e}")


def update_ingredonly_item(item_id: int, data: dict) -> dict:
    """
    Update an existing ingredient in ingredonly table.

    Args:
        item_id: ingredonly.id
        data: dict with 'name' and/or 'json_data' to update

    Returns:
        Updated row.

    Raises:
        SMEError if update fails.
    """
    client = _get_client()
    allowed_keys = {"name", "json_data"}
    update_data = {k: v for k, v in data.items() if k in allowed_keys}

    if not update_data:
        raise SMEError("No valid fields to update")

    try:
        result = client.table("ingredonly") \
            .update(update_data) \
            .eq("id", item_id) \
            .execute()
        if result.data:
            print(f"[SME] Updated ingredonly item {item_id}")
            return result.data[0]
        else:
            raise SMEError(f"Update returned no data for ingredonly id {item_id}")
    except Exception as e:
        raise SMEError(f"Failed to update ingredonly item {item_id}: {e}")
