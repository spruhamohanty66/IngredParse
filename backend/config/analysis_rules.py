"""
Analysis Rules Configuration
─────────────────────────────
All configurable rules for ingredient & nutrition analysis.
Update this file when rules change — mirrors analysis.md.

To add/remove items: edit the relevant list or dict below.
No code changes needed in analysis_service.py.
"""

# ── Allergen Detection ────────────────────────────────────────────────────────

TOP_4_ALLERGENS = ["milk", "egg", "peanut", "gluten"]

ALLERGEN_KEYWORDS: dict[str, list[str]] = {
    "milk":   ["milk", "dairy", "lactose", "whey", "casein", "butter", "cream", "ghee",
               "milk solids", "milk powder", "skim milk"],
    "egg":    ["egg", "eggs", "albumin", "albumen", "ovalbumin", "mayonnaise"],
    "peanut": ["peanut", "groundnut", "arachis"],
    "gluten": ["wheat", "gluten", "barley", "rye", "oats", "semolina", "durum",
               "spelt", "malt", "wheat flour", "whole wheat"],
}

# ── Ingredient Signals ────────────────────────────────────────────────────────

SIGNAL_TYPES = ["sugar", "sodium", "processed_fat"]

# Map watchlist_category (DB records) → signal type when signal_category is absent
WATCHLIST_TO_SIGNAL: dict[str, str] = {
    "high_sugar":    "sugar",
    "high_sodium":   "sodium",
    "processed_fat": "processed_fat",
}

# ── Sodium Signal Rules ──────────────────────────────────────────────────────
# Functional roles EXCLUDED from sodium signal (never count these as sodium)
# Examples: Raising Agents INS 500(ii), baking soda, sodium citrate
SODIUM_EXCLUDED_ROLES = {
    "raising_agent", "acidity_regulator", "anti_caking_agent", "flavor_enhancer",
    "thickener", "humectant", "emulsifier", "stabilizer", "gelling_agent",
    "bulking_agent", "firming_agent",
}

# Rank threshold: flag sodium if salt is within top N ingredients
SODIUM_TOP_RANK_THRESHOLD = 5

# Minimum sodium sources to flag (when salt is NOT in top N)
SODIUM_MIN_SOURCES_TO_FLAG = 2

# ── Fat/Oil Signal Rules ─────────────────────────────────────────────────────
# Minimum fat/oil sources to flag as caution
FAT_MIN_SOURCES_TO_FLAG = 2

# ── Refined Grain Rules ──────────────────────────────────────────────────────
# Keywords to identify refined grains in ingredient text
REFINED_GRAIN_KEYWORDS = [
    "maida",
    "refined wheat flour",
    "white rice flour",
    "white flour",
    "corn flour",
    "refined semolina",
    "refined flour",
    "white bread",
    "white wheat",
]

# Rank threshold for refined grain flagging (flag if refined grain within top N)
REFINED_GRAIN_TOP_RANK_THRESHOLD = 3

# Minimum refined grain count to flag when NOT in top N
REFINED_GRAIN_MIN_COUNT_TO_FLAG = 2

# ── Ingredient Classification ────────────────────────────────────────────────

CATEGORY_TYPES = ["natural", "processed", "artificial"]

# Ingredients that are ALWAYS classified as "natural" regardless of DB/GPT-4
ALWAYS_NATURAL_KEYWORDS = {
    "water", "wheat flour", "whole wheat flour", "whole wheat",
    "rice flour", "rice", "oats", "oat flour", "milk", "eggs", "egg",
    "butter", "cream", "salt", "sugar", "honey", "fruit", "vegetable",
    "cocoa", "cocoa powder", "coffee", "tea", "spices", "herbs",
    "sunflower oil", "olive oil", "coconut oil", "mustard oil",
    "flour", "chickpea flour", "besan",
    "lentils", "dal", "nuts", "almonds", "cashews", "peanuts",
    "raisins", "dates", "vinegar", "lemon juice", "tomato",
    "onion", "garlic", "ginger",
}

# Tags/roles that mark an ingredient as a functional additive
ADDITIVE_TAGS = {"functional", "colorant", "preservative", "stabilizer_thickener", "flavor_enhancer"}
ADDITIVE_ROLES = {
    "emulsifier", "preservative", "color", "thickener", "stabilizer",
    "humectant", "acidity_regulator", "anti_caking_agent", "raising_agent",
    "bleaching_agent", "flavor_enhancer", "bulking_agent",
}

# Map functional_role_db → ingredient_category
FUNCTIONAL_ROLE_TO_CATEGORY: dict[str, str] = {
    "emulsifier":         "processed",
    "stabilizer":         "processed",
    "preservative":       "processed",
    "acidity_regulator":  "processed",
    "anti_caking_agent":  "processed",
    "raising_agent":      "processed",
    "thickener":          "processed",
    "colorant":           "artificial",
    "flavoring_agent":    "artificial",
    "flavor_enhancer":    "artificial",
    "fat_source":         "processed",
    "sweetener":          "processed",
    "structure_provider": "processed",
    "fruit_component":    "natural",
    "protein_source":     "natural",
}

# Map watchlist_category → ingredient_category
WATCHLIST_TO_CATEGORY: dict[str, str] = {
    "artificial_color":       "artificial",
    "artificial_flavor":      "artificial",
    "artificial_sweetener":   "artificial",
    "banned_ingredient":      "artificial",
    "refined_carbohydrate":   "processed",
    "high_sugar":             "processed",
    "processed_fat":          "processed",
    "highly_processed":       "processed",
    "high_sodium":            "processed",
}

# ── Macro Nutrients ───────────────────────────────────────────────────────────

TRACKED_MACROS = {"carbohydrate", "fat", "protein", "fiber"}

MACRO_SLOT_WEIGHTS = {"primary_macro": 3, "secondary_macro": 2, "tertiary_macro": 1}

# ── Ingredient Complexity ─────────────────────────────────────────────────────
COMPLEXITY_THRESHOLDS = {
    "simple": 5,      # <= 5 ingredients
    "moderate": 10,   # 6-10 ingredients
    # > 10 = "complex"
}
