"""
OCR Service
Extracts text from food label images.

Engine: GPT-4o Vision (default).
EasyOCR is kept as a fallback for local/offline development only — set OCR_ENGINE=easyocr in .env to use it.
"""

import os
import time
import base64
import numpy as np
from pathlib import Path
from datetime import datetime
from PIL import Image, ImageEnhance, ImageOps

import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.60
ROTATIONS = [0, 90, 180, 270]
EARLY_EXIT_THRESHOLD = 0.60

_reader = None


class ImageQualityError(Exception):
    """Raised when no text is detected in the image."""
    code = "IMAGE_QUALITY_LOW"
    retake_required = True

    def to_dict(self) -> dict:
        return {
            "error": {
                "code": self.code,
                "message": str(self),
                "retake_required": self.retake_required
            }
        }


# ── EasyOCR ───────────────────────────────────────────────────────────────────

def _get_reader():
    """Lazy-load EasyOCR reader (downloads model on first run ~100MB)."""
    global _reader
    if _reader is None:
        import easyocr  # noqa: PLC0415 — lazy import, only used in fallback mode
        _reader = easyocr.Reader(["en"], verbose=False)
    return _reader


def _preprocess(img: Image.Image) -> np.ndarray:
    """Resize image to 1000–2000px width and enhance for OCR."""
    min_width, max_width = 1000, 2000

    if img.width < min_width:
        scale = min_width / img.width
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    elif img.width > max_width:
        scale = max_width / img.width
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)

    img = ImageEnhance.Contrast(img).enhance(1.5)
    img = ImageEnhance.Sharpness(img).enhance(1.5)
    return np.array(img)


def _avg_confidence(results: list) -> float:
    if not results:
        return 0.0
    return sum(conf for (_, _, conf) in results) / len(results)


def _extract_easyocr(path: Path) -> dict:
    img = ImageOps.exif_transpose(Image.open(str(path)))
    reader = _get_reader()

    best_results, best_confidence, best_rotation = [], 0.0, 0

    for angle in ROTATIONS:
        rotated = img.rotate(angle, expand=True) if angle != 0 else img
        image_array = _preprocess(rotated)
        results = reader.readtext(image_array)
        conf = _avg_confidence(results)

        logger.debug("[OCR] Rotation %ddeg -> confidence: %.0f%%, blocks: %d", angle, conf * 100, len(results))

        if conf > best_confidence:
            best_confidence = conf
            best_results = results
            best_rotation = angle

        if best_confidence >= EARLY_EXIT_THRESHOLD:
            logger.debug("[OCR] Early exit at %ddeg - confidence %.0f%% exceeded threshold", angle, conf * 100)
            break

    logger.debug("[OCR] Best rotation: %ddeg (confidence: %.0f%%)", best_rotation, best_confidence * 100)

    if not best_results:
        raise ImageQualityError("Image is not clear enough to read. Please retake with better lighting and ensure the label is fully visible.")

    return {
        "text": " ".join(text for (_, text, _) in best_results),
        "confidence": round(best_confidence, 4),
        "engine": "easyocr",
        "token_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        "llm_calls": 0,
    }


# ── GPT-4 Vision ──────────────────────────────────────────────────────────────

def _extract_gpt4vision(path: Path) -> dict:
    suffix = path.suffix.lower()
    mime_types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    mime_type = mime_types.get(suffix, "image/jpeg")

    with open(path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode("utf-8")

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Extract ALL text from this food label image exactly as it appears. "
                            "Do not skip, summarise, or truncate any part of the label. "
                            "For nutrition tables, capture every single row including sub-rows "
                            "(e.g. Total Sugars, Added Sugars, Saturated Fat, Trans Fat, Dietary Fibre). "
                            "Preserve numbers, units, and %RDA values exactly as printed. "
                            "Output only the extracted text, nothing else."
                        )
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}
                    }
                ]
            }
        ],
        max_tokens=4096
    )

    extracted_text = response.choices[0].message.content

    # Capture token usage
    usage = response.usage
    token_usage = {
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
        "total_tokens": usage.total_tokens if usage else 0,
    }

    if not extracted_text or not extracted_text.strip():
        raise ImageQualityError("Image is not clear enough to read. Please retake with better lighting and ensure the label is fully visible.")

    return {
        "text": extracted_text,
        "confidence": None,  # GPT-4 Vision does not return a confidence score
        "engine": "gpt4vision",
        "token_usage": token_usage,
        "llm_calls": 1,
    }


# ── Public API ────────────────────────────────────────────────────────────────

def extract_text(image_path: str) -> dict:
    """
    Extract text from a food label image.
    Engine: gpt4vision (default). Override with OCR_ENGINE=easyocr in .env for local dev.

    Returns:
        {
            "text": "<extracted text>",
            "confidence": 0.93 or None,
            "engine": "easyocr" | "gpt4vision",
            "duration_seconds": 14.2
        }
    """
    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    engine = os.getenv("OCR_ENGINE", "gpt4vision").lower()

    logger.info("[OCR] Engine   : %s", engine)
    logger.info("[OCR] Started  : %s", datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    start_time = time.time()

    if engine == "gpt4vision":
        result = _extract_gpt4vision(path)
    else:
        result = _extract_easyocr(path)

    end_time = time.time()
    logger.info("[OCR] Ended    : %s", datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    logger.info("[OCR] Duration : %.2fs", end_time - start_time)

    result["duration_seconds"] = round(end_time - start_time, 2)
    full_text = result.get("text", "")
    logger.info("[OCR] Total chars  : %d", len(full_text))
    logger.debug("[OCR] Full text ---\n%s\n[OCR] --- end text", full_text)
    return result
