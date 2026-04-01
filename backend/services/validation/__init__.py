"""
Validation Services — Post-Parser & Post-Analysis

Three validation layers:
  1. ingredient_validation_service — validates parsed ingredient structure & count
  2. nutrition_validation_service  — validates parsed nutrition data integrity
  3. output_validation_service     — guardrail compliance for user-facing text

Flow:
  Parser → Ingredient/Nutrition Validation → (retry if fail) → Analysis → Output Validation → Frontend
"""

from .output_validation_service import validate_output
from .ingredient_validation_service import validate_ingredients
from .nutrition_validation_service import validate_nutrition

__all__ = ["validate_output", "validate_ingredients", "validate_nutrition"]
