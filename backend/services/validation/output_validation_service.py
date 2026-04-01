"""
Output Layer Validation Service
Validates that all user-facing text in the pipeline output complies with product guardrails.

Checks:
  1. Absolute judgments  — "don't eat", "never consume", "avoid completely"
  2. Medical claims      — "causes diabetes", "leads to heart disease"
  3. Fear-based language — "dangerous", "toxic", "unsafe", "poison"
  4. Missing context     — claims without serving/nutrient backing

Design decisions:
  - Don't overuse AI — Layer 1 is regex replacement, Layer 2 is AI rewrite (fallback)
  - Prefer replace over regenerate — fix violations in-place first
  - AI fallback only when regex replacement produces incoherent text (3+ violations)
  - Logs: % failing, % rewritten, % needing AI fallback
"""

from __future__ import annotations

import os
import re
import json
import logging
from typing import Any

from openai import OpenAI

logger = logging.getLogger(__name__)

# Max violations in a single field before triggering AI rewrite fallback
_AI_FALLBACK_THRESHOLD = 3

# ── Violation Patterns ───────────────────────────────────────────────────────
# Each entry: (compiled regex, replacement string, violation category)
# Replacements are applied via re.sub (case-insensitive).

_ABSOLUTE_JUDGMENT_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bdo\s+not\s+eat\b", re.I),             "not recommended for frequent consumption"),
    (re.compile(r"\bdon['']t\s+eat\b", re.I),              "not recommended for frequent consumption"),
    (re.compile(r"\bnever\s+consume\b", re.I),             "not recommended for frequent consumption"),
    (re.compile(r"\bavoid\s+completely\b", re.I),           "best limited in regular diet"),
    (re.compile(r"\bavoid\s+at\s+all\s+costs?\b", re.I),   "best limited in regular diet"),
    (re.compile(r"\bmust\s+not\s+eat\b", re.I),            "not recommended for frequent consumption"),
    (re.compile(r"\bmust\s+avoid\b", re.I),                 "best limited in regular diet"),
    (re.compile(r"\bshould\s+never\b", re.I),               "best consumed occasionally"),
    (re.compile(r"\bstay\s+away\s+from\b", re.I),           "best limited in regular diet"),
    (re.compile(r"\bdo\s+not\s+consume\b", re.I),           "not recommended for frequent consumption"),
    (re.compile(r"\bstop\s+eating\b", re.I),                "consider reducing intake"),
    (re.compile(r"\beliminate\s+from\s+diet\b", re.I),      "consider reducing intake"),
]

_MEDICAL_CLAIM_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bcauses?\s+diabetes\b", re.I),           "high intake is associated with health risks"),
    (re.compile(r"\bleads?\s+to\s+heart\s+disease\b", re.I),"high intake is associated with cardiovascular concerns"),
    (re.compile(r"\bcauses?\s+cancer\b", re.I),             "flagged by health agencies for review"),
    (re.compile(r"\bcauses?\s+obesity\b", re.I),            "high calorie density — monitor intake"),
    (re.compile(r"\bprevents?\s+disease\b", re.I),          "associated with positive health outcomes"),
    (re.compile(r"\bcures?\b", re.I),                       "may support"),
    (re.compile(r"\btreatment\b", re.I),                    "associated with health benefits"),
    (re.compile(r"\bsymptom\s+relief\b", re.I),             "may support well-being"),
    (re.compile(r"\bmedically\s+proven\b", re.I),           "based on nutritional guidelines"),
    (re.compile(r"\bclinically\s+proven\b", re.I),          "based on nutritional guidelines"),
    (re.compile(r"\bwill\s+make\s+you\s+sick\b", re.I),     "may not align with dietary goals"),
    (re.compile(r"\bwill\s+harm\b", re.I),                  "may not align with dietary goals"),
    (re.compile(r"\bgood\s+for\s+your?\s+health\b", re.I),  "supports a balanced diet"),
    (re.compile(r"\bbad\s+for\s+your?\s+health\b", re.I),   "may not align with dietary goals"),
]

_FEAR_BASED_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bdangerous\b", re.I),    "high"),
    (re.compile(r"\btoxic\b", re.I),        "exceeds recommended limits"),
    (re.compile(r"\bpoison(?:ous)?\b", re.I), "exceeds recommended limits"),
    (re.compile(r"\bunsafe\b", re.I),       "exceeds recommended limits"),
    (re.compile(r"\blethal\b", re.I),       "exceeds recommended limits"),
    (re.compile(r"\bdeadly\b", re.I),       "exceeds recommended limits"),
    (re.compile(r"\bharmful\b", re.I),       "may not be ideal"),
    (re.compile(r"\balarming\b", re.I),      "notable"),
    (re.compile(r"\bshocking\b", re.I),      "notable"),
    (re.compile(r"\bterrifying\b", re.I),    "notable"),
    (re.compile(r"\bfrightening\b", re.I),   "notable"),
    (re.compile(r"\bscary\b", re.I),         "notable"),
    (re.compile(r"\bemergency\b", re.I),     "important to note"),
    (re.compile(r"\bcritical\s+risk\b", re.I), "important to note"),
]

# All rule sets grouped by category for logging
_ALL_RULES = {
    "absolute_judgment": _ABSOLUTE_JUDGMENT_RULES,
    "medical_claim":     _MEDICAL_CLAIM_RULES,
    "fear_based":        _FEAR_BASED_RULES,
}


# ── Context Validation ───────────────────────────────────────────────────────

_CONTEXT_KEYWORDS = re.compile(
    r"\bper\s+serving\b|\bper\s+100\s*g\b|\bfull\s+pack\b|\bdaily\s+limit\b|\bdaily\s+intake\b",
    re.I,
)

_CLAIM_PATTERNS = re.compile(
    r"\bhigh\b|\bexceeds?\b|\blow\b|\babsent\b|\bexcess\b",
    re.I,
)


# ── AI Fallback Rewrite ──────────────────────────────────────────────────────

def _ai_rewrite(original_text: str, field_type: str, max_words: int = 20) -> str | None:
    """
    Use GPT-4 to rewrite a text field that has too many violations for regex
    replacement to produce coherent output.

    Returns rewritten text, or None if AI call fails.
    """
    from prompts.prompts import OUTPUT_VALIDATION_REWRITE_PROMPT

    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        prompt = OUTPUT_VALIDATION_REWRITE_PROMPT.format(
            original_text=original_text,
            field_type=field_type,
            max_words=max_words,
        )
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=100,
        )
        rewritten = response.choices[0].message.content.strip().strip('"').strip("'")

        # Verify the rewrite itself doesn't have violations
        _, post_violations = _detect_violations(rewritten)
        if post_violations:
            logger.warning("[OutputValidation] AI rewrite still has violations, using regex cleanup on AI output")
            rewritten, _ = _regex_replace(rewritten)

        return rewritten
    except Exception as e:
        logger.error("[OutputValidation] AI rewrite failed: %s", e)
        return None


# ── Core Validation Logic ────────────────────────────────────────────────────

def _detect_violations(text: str) -> tuple[str, list[dict]]:
    """
    Detect violations in text WITHOUT modifying it.

    Returns:
        (original_text, list_of_violations)
    """
    if not text or not isinstance(text, str):
        return text, []

    violations: list[dict] = []
    for category, rules in _ALL_RULES.items():
        for pattern, replacement in rules:
            match = pattern.search(text)
            if match:
                violations.append({
                    "category": category,
                    "original": match.group(0),
                    "replaced_with": replacement,
                })

    return text, violations


def _regex_replace(text: str) -> tuple[str, list[dict]]:
    """
    Layer 1: Regex-based replacement of violations.

    Returns:
        (cleaned_text, list_of_violations)
    """
    if not text or not isinstance(text, str):
        return text, []

    violations: list[dict] = []
    cleaned = text

    for category, rules in _ALL_RULES.items():
        for pattern, replacement in rules:
            match = pattern.search(cleaned)
            if match:
                original_fragment = match.group(0)
                cleaned = pattern.sub(replacement, cleaned)
                violations.append({
                    "category": category,
                    "original": original_fragment,
                    "replaced_with": replacement,
                })

    return cleaned, violations


def _validate_text(text: str, field_path: str = "") -> tuple[str, list[dict], str]:
    """
    Two-layer validation:
      Layer 1: Regex replacement (fast, no AI)
      Layer 2: AI rewrite fallback (only when 3+ violations make regex output incoherent)

    Returns:
        (cleaned_text, list_of_violations, method_used)
        method_used: "none" | "regex" | "ai_fallback"
    """
    if not text or not isinstance(text, str):
        return text, [], "none"

    # Layer 1: Detect violations first
    _, violations = _detect_violations(text)

    if not violations:
        return text, [], "none"

    # If violations are below threshold, regex replace is sufficient
    if len(violations) < _AI_FALLBACK_THRESHOLD:
        cleaned, violations = _regex_replace(text)
        return cleaned, violations, "regex"

    # Layer 2: Too many violations — AI rewrite for coherent output
    logger.info(
        "[OutputValidation] %d violations in '%s' — triggering AI rewrite",
        len(violations), field_path,
    )

    # Determine max words based on field type
    max_words = 8 if "highlight" in field_path else 20
    field_type = "highlight reason" if "highlight" in field_path else "summary"

    rewritten = _ai_rewrite(text, field_type, max_words)
    if rewritten:
        return rewritten, violations, "ai_fallback"

    # AI failed — fall back to regex replacement
    logger.warning("[OutputValidation] AI fallback failed, using regex replacement")
    cleaned, violations = _regex_replace(text)
    return cleaned, violations, "regex"


def _check_missing_context(text: str, field_name: str) -> dict | None:
    """
    Check if a text field that makes a nutrient claim also provides context
    (per serving / per 100g / full pack / daily limit).

    Only applies to fields that contain claim-like language.
    Short fields (highlights with max 8 words) are exempt since
    they appear alongside contextual data in the UI.
    """
    if not text or not isinstance(text, str):
        return None

    # Short highlight reasons are exempt — they're shown in context in the UI
    word_count = len(text.split())
    if word_count <= 8:
        return None

    # Only check if the text makes a claim
    if not _CLAIM_PATTERNS.search(text):
        return None

    # Check if context is present
    if _CONTEXT_KEYWORDS.search(text):
        return None

    return {
        "category": "missing_context",
        "field": field_name,
        "text": text,
        "note": "Claim made without serving/daily context",
    }


# ── Field Extraction & Validation ────────────────────────────────────────────

def _extract_text_fields(output: dict) -> list[tuple[str, str, list]]:
    """
    Extract all user-facing text fields from the shaped pipeline output.

    Returns list of (field_path, text_value, parent_container).
    parent_container is [parent_dict, key] or [parent_list, index, key]
    so we can write the cleaned value back.
    """
    fields = []
    analysis = output.get("analysis", {})

    # 1. Verdict summary
    verdict = analysis.get("verdict", {})
    if verdict.get("summary"):
        fields.append(("analysis.verdict.summary", verdict["summary"], [verdict, "summary"]))

    # 2. Verdict highlights
    for i, h in enumerate(verdict.get("highlights", [])):
        reason = h.get("reason", "")
        if reason:
            fields.append((f"analysis.verdict.highlights[{i}].reason", reason, [h, "reason"]))

    # 3. Watchlist reasons
    for i, w in enumerate(analysis.get("watchlist", [])):
        reason = w.get("reason", "")
        if reason:
            fields.append((f"analysis.watchlist[{i}].reason", reason, [w, "reason"]))

    # 4. Positive signal reasons
    for i, p in enumerate(analysis.get("positive_signals", [])):
        reason = p.get("reason", "")
        if reason:
            fields.append((f"analysis.positive_signals[{i}].reason", reason, [p, "reason"]))

    # 5. Nested ingredient verdict (combined mode)
    ingredient_verdict = verdict.get("ingredient_verdict", {})
    if ingredient_verdict.get("summary"):
        fields.append((
            "analysis.verdict.ingredient_verdict.summary",
            ingredient_verdict["summary"],
            [ingredient_verdict, "summary"],
        ))
    for i, h in enumerate(ingredient_verdict.get("highlights", [])):
        reason = h.get("reason", "")
        if reason:
            fields.append((
                f"analysis.verdict.ingredient_verdict.highlights[{i}].reason",
                reason, [h, "reason"],
            ))

    # 6. Nested nutrition verdict (combined mode)
    nutrition_verdict = verdict.get("nutrition_verdict", {})
    if nutrition_verdict.get("summary"):
        fields.append((
            "analysis.verdict.nutrition_verdict.summary",
            nutrition_verdict["summary"],
            [nutrition_verdict, "summary"],
        ))
    for i, h in enumerate(nutrition_verdict.get("highlights", [])):
        reason = h.get("reason", "")
        if reason:
            fields.append((
                f"analysis.verdict.nutrition_verdict.highlights[{i}].reason",
                reason, [h, "reason"],
            ))

    # 7. Top-level nutrition verdict (nutrition-only or combined)
    nutrition = output.get("nutrition") or {}
    nutr_verdict = nutrition.get("verdict", {})
    if nutr_verdict.get("summary"):
        fields.append(("nutrition.verdict.summary", nutr_verdict["summary"], [nutr_verdict, "summary"]))
    for i, h in enumerate(nutr_verdict.get("highlights", [])):
        reason = h.get("reason", "")
        if reason:
            fields.append((f"nutrition.verdict.highlights[{i}].reason", reason, [h, "reason"]))

    return fields


# ── Public API ───────────────────────────────────────────────────────────────

def validate_output(output: dict) -> dict:
    """
    Validate the shaped pipeline output against all product guardrails.
    Replaces violations in-place and returns a validation log.

    Two-layer approach:
      Layer 1 (regex): Fast pattern-based replacement for clear-cut violations
      Layer 2 (AI):    GPT-4 rewrite fallback when regex produces incoherent text

    Args:
        output: The shaped pipeline response dict (from _shape_response).

    Returns:
        Validation log dict with stats and details.
    """
    text_fields = _extract_text_fields(output)
    total_checked = len(text_fields)

    all_violations: list[dict] = []
    context_warnings: list[dict] = []
    fields_failed = 0
    fields_rewritten = 0
    fields_ai_fallback = 0

    for field_path, text_value, ref in text_fields:
        # Two-layer validation
        cleaned, violations, method = _validate_text(text_value, field_path)

        if violations:
            fields_failed += 1
            if method == "regex":
                fields_rewritten += 1
            elif method == "ai_fallback":
                fields_ai_fallback += 1

            # Write cleaned value back into the output dict
            container, key = ref[0], ref[1]
            container[key] = cleaned
            for v in violations:
                v["field"] = field_path
                v["method"] = method
            all_violations.extend(violations)

        # Check missing context
        ctx_warning = _check_missing_context(cleaned, field_path)
        if ctx_warning:
            context_warnings.append(ctx_warning)

    pass_rate = ((total_checked - fields_failed) / total_checked * 100) if total_checked > 0 else 100.0

    validation_log = {
        "total_fields_checked": total_checked,
        "fields_failed": fields_failed,
        "fields_rewritten": fields_rewritten,
        "fields_ai_fallback": fields_ai_fallback,
        "fields_with_missing_context": len(context_warnings),
        "violations": all_violations,
        "context_warnings": context_warnings,
        "pass_rate_pct": round(pass_rate, 1),
    }

    # Log summary
    if all_violations:
        logger.warning(
            "[OutputValidation] %d/%d fields failed (%d regex-rewritten, %d AI-rewritten). "
            "Pass rate: %.1f%%",
            fields_failed, total_checked, fields_rewritten, fields_ai_fallback, pass_rate,
        )
        for v in all_violations:
            logger.warning(
                "  [%s][%s] %s: '%s' → '%s'",
                v["category"], v["method"], v["field"], v["original"], v["replaced_with"],
            )
    else:
        logger.info(
            "[OutputValidation] All %d fields passed. Pass rate: 100%%",
            total_checked,
        )

    if context_warnings:
        logger.warning(
            "[OutputValidation] %d fields missing serving/daily context.",
            len(context_warnings),
        )

    return validation_log
