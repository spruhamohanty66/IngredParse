export interface NutrientValues {
  calories: number | null;
  total_fat_g: number | null;
  saturated_fat_g: number | null;
  monounsaturated_fat_g: number | null;
  polyunsaturated_fat_g: number | null;
  trans_fat_g: number | null;
  cholesterol_mg: number | null;
  sodium_mg: number | null;
  total_carbs_g: number | null;
  fiber_g: number | null;
  total_sugar_g: number | null;
  added_sugar_g: number | null;
  protein_g: number | null;
  // Vitamins
  vitamin_a_mcg: number | null;
  vitamin_b6_mg: number | null;
  vitamin_b12_mcg: number | null;
  vitamin_c_mg: number | null;
  vitamin_d_mcg: number | null;
  vitamin_e_mg: number | null;
  vitamin_k_mcg: number | null;
  // Minerals
  calcium_mg: number | null;
  magnesium_mg: number | null;
  iron_mg: number | null;
  potassium_mg: number | null;
  zinc_mg: number | null;
}

export interface NutritionData {
  serving_size: string | null;
  servings_per_pack: number | null;
  default_serving_label: string | null;
  full_pack_serving_label: string | null;
  per_serving: NutrientValues;
  per_100g: NutrientValues | null;
  dv_percent: Record<string, number | null> | null;
  flags: {
    high_sugar: boolean;
    high_sodium: boolean;
    high_sat_fat: boolean;
    high_trans_fat: boolean;
    low_fiber: boolean;
    low_protein: boolean;
  };
  source: string;
}

export interface AgentEval {
  token_usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  llm_calls: number;
  duration_seconds?: number;
}

export interface Evals {
  total: AgentEval;
  OCR?: AgentEval;
  IngredientAgent?: AgentEval;
  NutritionAgent?: AgentEval;
  AnalysisAgent?: AgentEval;
}

export interface AnalysisResult {
  scan_id: string;
  duration_seconds?: number;
  evals?: Evals;
  nutrition: NutritionData | null;
  ingredients: Array<{
    rank: number;
    raw_text: string;
    quantity: { value: number | null; unit: string | null };
    functional_role: string | null;
    is_compound: boolean;
    sub_ingredients: any[];
    db_data: {
      ingredient_category?: "natural" | "processed" | "artificial" | null;
      ingredient_tags?: string[];
      signal_category?: string | null;
      allergy_flag_info?: { allergy_flag: boolean; allergy_type: string | null };
      macro_profile?: { primary_macro: string | null; secondary_macro: string | null; tertiary_macro: string | null };
      watchlist_category?: string | null;
      human_review_flag?: boolean;
      [key: string]: any;
    };
  }>;
  analysis: {
    allergens: {
      milk: boolean;
      egg: boolean;
      peanut: boolean;
      gluten: boolean;
      ingredient_map: Record<string, string[]>;
    };
    signals: {
      sugar: { count: number; ingredients: string[] };
      sodium: { count: number; ingredients: string[] };
      processed_fat: { count: number; ingredients: string[] };
    };
    category_distribution: Record<string, { count: number; ingredients: string[] }>;
    macro_dominance: {
      dominant: string | null;
      secondary: string | null;
      tertiary: string | null;
      scores: Record<string, number>;
      ingredients: Record<string, string[]>;
    };
    additive_density: {
      count: number;
      density: "none" | "low" | "medium" | "high";
      additives: string[];
    } | null;
    ingredient_complexity: {
      count: number;
      level: "simple" | "moderate" | "complex";
    };
    watchlist: Array<{
      watchlist_category: string;
      ingredients: string[];
      reason: string;
    }>;
    positive_signals: Array<{
      signal: string;
      reason: string;
    }>;
    verdict: {
      persona: string;
      safe: boolean;
      label?: "not_recommended" | "moderately_recommended" | "highly_recommended";
      summary: string;
      highlights: Array<{ ingredient: string; reason: string }>;
    };
  };
  metadata: {
    product_info: {
      probable_product_name: string | null;
      category: string | null;
      probable_product_type: string | null;
    };
    input_type: "ingredient_label" | "nutrition_label" | "both" | null;
    input_category: string | null;
    ocr_confidence: number | null;
    processing_timestamp: string | null;
  };
}
