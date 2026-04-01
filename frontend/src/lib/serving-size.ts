import { NutrientValues, NutritionData } from "./types";

export interface ServingView {
  label: string;
}

export interface ServingViews {
  perServing: ServingView;
  per100g: ServingView;
}

/**
 * Returns true if the serving size is a liquid unit (ml / L).
 * Used to switch the "Per 100g" label to "Per 100ml" for drinks/liquids.
 */
export function isLiquidServing(nutrition: NutritionData): boolean {
  const s = (nutrition.serving_size ?? nutrition.default_serving_label ?? "").toLowerCase();
  return /\d\s*ml\b|\d\s*l\b/.test(s);
}

/**
 * Returns display labels for Per Serving and Per 100g/ml toggle views.
 * Labels come from GPT-4 (default_serving_label). Falls back to serving_size if unavailable.
 */
export function getServingViews(nutrition: NutritionData): ServingViews {
  const perServingLabel =
    nutrition.default_serving_label ??
    nutrition.serving_size ??
    "1 serving";

  const per100Label = isLiquidServing(nutrition) ? "Per 100ml" : "Per 100g";

  return {
    perServing: { label: `Per Serving (${perServingLabel})` },
    per100g:    { label: per100Label },
  };
}

/**
 * Scales all nutrient values by a multiplier.
 * Used for calculations that require proportional scaling.
 */
export function scaleNutrientValues(
  values: NutrientValues,
  multiplier: number
): NutrientValues {
  if (multiplier === 1) return values;
  const scale = (v: number | null): number | null =>
    v != null ? v * multiplier : null;
  return {
    calories:               scale(values.calories),
    total_fat_g:            scale(values.total_fat_g),
    saturated_fat_g:        scale(values.saturated_fat_g),
    monounsaturated_fat_g:  scale(values.monounsaturated_fat_g),
    polyunsaturated_fat_g:  scale(values.polyunsaturated_fat_g),
    trans_fat_g:            scale(values.trans_fat_g),
    cholesterol_mg:         scale(values.cholesterol_mg),
    sodium_mg:              scale(values.sodium_mg),
    total_carbs_g:          scale(values.total_carbs_g),
    fiber_g:                scale(values.fiber_g),
    total_sugar_g:          scale(values.total_sugar_g),
    added_sugar_g:          scale(values.added_sugar_g),
    protein_g:              scale(values.protein_g),
    vitamin_a_mcg:          scale(values.vitamin_a_mcg),
    vitamin_b6_mg:          scale(values.vitamin_b6_mg),
    vitamin_b12_mcg:        scale(values.vitamin_b12_mcg),
    vitamin_c_mg:           scale(values.vitamin_c_mg),
    vitamin_d_mcg:          scale(values.vitamin_d_mcg),
    vitamin_e_mg:           scale(values.vitamin_e_mg),
    vitamin_k_mcg:          scale(values.vitamin_k_mcg),
    calcium_mg:             scale(values.calcium_mg),
    magnesium_mg:           scale(values.magnesium_mg),
    iron_mg:                scale(values.iron_mg),
    potassium_mg:           scale(values.potassium_mg),
    zinc_mg:                scale(values.zinc_mg),
  };
}
