"use client";

import {
  Document, Page, Text, View, StyleSheet, Font,
} from "@react-pdf/renderer";
import { AnalysisResult, NutrientValues } from "@/lib/types";
import { BRAND } from "@/lib/brand";
import { DISCLAIMER_LINES } from "@/components/Disclaimer";
import { scaleNutrientValues } from "@/lib/serving-size";

interface Props {
  result: AnalysisResult;
}

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  primary:   BRAND.primaryColor,
  green:     "#16a34a",
  amber:     "#d97706",
  red:       "#dc2626",
  slate900:  "#0f172a",
  slate700:  "#334155",
  slate500:  "#64748b",
  slate400:  "#94a3b8",
  slate100:  "#f1f5f9",
  slate50:   "#f8fafc",
  white:     "#ffffff",
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.slate700,
    paddingHorizontal: 36,
    paddingVertical: 32,
    backgroundColor: C.white,
  },

  // Header
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  brandCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", marginRight: 8 },
  brandName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.slate900 },
  brandTagline: { fontSize: 7, color: C.slate400, marginTop: 1 },
  headerRight: { alignItems: "flex-end" },
  headerMeta: { fontSize: 7, color: C.slate400 },

  // Divider
  divider: { height: 1, backgroundColor: C.slate100, marginVertical: 10 },

  // Section
  sectionTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.primary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },

  // Verdict banner
  verdictBanner: { borderRadius: 8, padding: 12, marginBottom: 10 },
  verdictLabel: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.white },
  verdictMeaning: { fontSize: 9, color: C.white, opacity: 0.85, marginTop: 2 },
  verdictSummary: { fontSize: 9, color: C.white, opacity: 0.75, marginTop: 4 },
  verdictPersona: { fontSize: 7, color: C.white, opacity: 0.6, marginTop: 3, textTransform: "uppercase", letterSpacing: 1 },

  // Table
  table: { marginBottom: 10 },
  tableHeader: { flexDirection: "row", backgroundColor: C.slate100, padding: "5 8", borderRadius: 4, marginBottom: 2 },
  tableRow: { flexDirection: "row", padding: "4 8", borderBottomWidth: 1, borderBottomColor: C.slate100 },
  tableCell: { flex: 1, fontSize: 8, color: C.slate700 },
  tableCellBold: { flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: C.slate900 },
  tableHeaderCell: { flex: 1, fontSize: 7, fontFamily: "Helvetica-Bold", color: C.slate500, textTransform: "uppercase", letterSpacing: 0.5 },

  // Allergen grid
  allergenGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  allergenCard: { width: "22%", borderRadius: 6, padding: "6 8", alignItems: "center" },
  allergenEmoji: { fontSize: 14, marginBottom: 2 },
  allergenLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  allergenStatus: { fontSize: 7, marginTop: 1 },

  // Signal row
  signalRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6, padding: "6 8", backgroundColor: C.slate50, borderRadius: 6 },
  signalLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.slate900, width: 90 },
  signalCount: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.primary, width: 20 },
  signalIngredients: { fontSize: 8, color: C.slate500, flex: 1 },

  // Category section
  categoryBlock: { marginBottom: 8 },
  categoryLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.slate900, marginBottom: 4 },
  ingredientRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 3, paddingLeft: 8 },
  bullet: { fontSize: 8, color: C.slate400, marginRight: 4, marginTop: 1 },
  ingredientName: { fontSize: 8, color: C.slate700, flex: 1 },
  tag: { fontSize: 6, fontFamily: "Helvetica-Bold", paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, marginLeft: 4, color: C.white },

  // Macro
  macroRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  macroItem: { flex: 1, borderRadius: 6, padding: "8 10", backgroundColor: C.slate50, alignItems: "center" },
  macroRank: { fontSize: 7, color: C.slate400, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  macroValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.slate900, textTransform: "capitalize" },

  // Footer
  footer: { position: "absolute", bottom: 16, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerText: { fontSize: 7, color: C.slate400 },

  // Highlight chips
  highlightRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
  highlightCard: { flex: 1, borderRadius: 6, padding: "6 8", backgroundColor: C.slate50 },
  highlightIngredient: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.slate900, marginBottom: 2 },
  highlightReason: { fontSize: 7, color: C.slate500 },

  // Positive signal rows
  positiveRow: { flexDirection: "row", padding: "5 8", borderBottomWidth: 1, borderBottomColor: C.slate100, alignItems: "flex-start" },
  positiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginRight: 6, marginTop: 1 },
  positiveSignal: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.green, width: 100 },
  positiveReason: { fontSize: 8, color: C.slate700, flex: 1 },

  // AI review notice
  reviewNotice: { flexDirection: "row", alignItems: "center", backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a", borderRadius: 6, padding: "5 8", marginBottom: 8 },
  reviewNoticeText: { fontSize: 7, color: "#92400e", flex: 1 },

  // Nutrition table
  nutrTable: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, overflow: "hidden", marginBottom: 10 },
  nutrHeaderRow: { flexDirection: "row", backgroundColor: C.slate100, padding: "4 6" },
  nutrCatRow: { flexDirection: "row", padding: "3 6" },
  nutrDataRow: { flexDirection: "row", padding: "3 6", borderTopWidth: 1, borderTopColor: C.slate100 },
  nutrCell: { fontSize: 7.5, color: C.slate700 },
  nutrCellBold: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.slate900 },
  nutrHeaderCell: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.slate500, textTransform: "uppercase", letterSpacing: 0.3 },
  nutrCatLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  nutrLimitBadge: { fontSize: 6, fontFamily: "Helvetica-Bold", color: C.red, backgroundColor: "#fef2f2", paddingHorizontal: 3, paddingVertical: 1, borderRadius: 3 },

  // Calories highlight
  caloriesRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  caloriesBox: { flex: 1, backgroundColor: C.slate50, borderRadius: 6, padding: "8 10", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0" },
  caloriesLabel: { fontSize: 7, color: C.slate400, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  caloriesValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.slate900 },
  caloriesUnit: { fontSize: 7, color: C.slate400, marginTop: 1 },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const VERDICT_COLORS: Record<string, string> = {
  not_recommended:       C.red,
  moderately_recommended: C.amber,
  highly_recommended:    C.green,
};

const VERDICT_LABELS: Record<string, Record<string, string>> = {
  kids: {
    not_recommended:        "Not Suitable for Kids",
    moderately_recommended: "Occasional Consumption",
    highly_recommended:     "Good for Kids",
  },
  clean_eating: {
    not_recommended:        "Not Clean Eating",
    moderately_recommended: "Moderately Clean",
    highly_recommended:     "Clean Product",
  },
};

const VERDICT_MEANINGS: Record<string, Record<string, string>> = {
  kids: {
    not_recommended:        "Contains ingredients not recommended for children",
    moderately_recommended: "Okay occasionally — some ingredients to monitor",
    highly_recommended:     "Clean ingredients — a good choice for children",
  },
  clean_eating: {
    not_recommended:        "Contains heavily processed or artificial ingredients",
    moderately_recommended: "Some processed ingredients — consume mindfully",
    highly_recommended:     "Minimal additives — aligns with clean eating",
  },
};

const ALLERGENS = [
  { key: "milk",   label: "Milk",   emoji: "🥛" },
  { key: "egg",    label: "Egg",    emoji: "🥚" },
  { key: "peanut", label: "Peanut", emoji: "🥜" },
  { key: "gluten", label: "Gluten", emoji: "🌾" },
] as const;

const TAG_LABELS: Record<string, string> = {
  functional:            "Functional",
  sweetener:             "Sweetener",
  flavor_enhancer:       "Flavor Enhancer",
  colorant:              "Colorant",
  preservative:          "Preservative",
  stabilizer_thickener:  "Stabilizer",
  may_increase_cravings: "Craving Trigger",
};

const TAG_COLORS: Record<string, string> = {
  functional:            "#8b5cf6",
  sweetener:             "#ec5b13",
  flavor_enhancer:       "#3b82f6",
  colorant:              "#f59e0b",
  preservative:          "#64748b",
  stabilizer_thickener:  "#0ea5e9",
  may_increase_cravings: "#ef4444",
};

const CATEGORY_COLORS: Record<string, string> = {
  natural:    C.green,
  processed:  C.amber,
  artificial: C.red,
};

// ── Nutrition constants ───────────────────────────────────────────────────────

const DAILY_REF_ADULT: Partial<Record<keyof NutrientValues, number>> = {
  total_fat_g: 70, saturated_fat_g: 20, sodium_mg: 2000, total_carbs_g: 275,
  fiber_g: 28, total_sugar_g: 25, added_sugar_g: 25, protein_g: 50,
  vitamin_a_mcg: 900, vitamin_b6_mg: 1.7, vitamin_b12_mcg: 2.4, vitamin_c_mg: 90,
  vitamin_d_mcg: 20, vitamin_e_mg: 15, vitamin_k_mcg: 120, calcium_mg: 1300,
  iron_mg: 18, magnesium_mg: 420, potassium_mg: 4700, zinc_mg: 11,
};
const DAILY_REF_KIDS: Partial<Record<keyof NutrientValues, number>> = {
  ...DAILY_REF_ADULT,
  total_fat_g: 50, saturated_fat_g: 15, sodium_mg: 1500, total_sugar_g: 20,
  added_sugar_g: 20, fiber_g: 18,
};

interface NutrRowDef { category: string; name: string; field: keyof NutrientValues; unit: string }
const NUTR_ROW_DEFS: NutrRowDef[] = [
  { category: "Carbohydrates", name: "Total Carbohydrates",  field: "total_carbs_g",         unit: "g"   },
  { category: "Carbohydrates", name: "Dietary Fiber",        field: "fiber_g",               unit: "g"   },
  { category: "Carbohydrates", name: "Total Sugars",         field: "total_sugar_g",         unit: "g"   },
  { category: "Carbohydrates", name: "Added Sugars",         field: "added_sugar_g",         unit: "g"   },
  { category: "Protein",       name: "Protein",              field: "protein_g",             unit: "g"   },
  { category: "Fat",           name: "Total Fat",            field: "total_fat_g",           unit: "g"   },
  { category: "Fat",           name: "Saturated Fat",        field: "saturated_fat_g",       unit: "g"   },
  { category: "Fat",           name: "Trans Fat",            field: "trans_fat_g",           unit: "g"   },
  { category: "Fat",           name: "Monounsaturated Fat",  field: "monounsaturated_fat_g", unit: "g"   },
  { category: "Fat",           name: "Polyunsaturated Fat",  field: "polyunsaturated_fat_g", unit: "g"   },
  { category: "Minerals",      name: "Sodium",               field: "sodium_mg",             unit: "mg"  },
  { category: "Minerals",      name: "Calcium",              field: "calcium_mg",            unit: "mg"  },
  { category: "Minerals",      name: "Iron",                 field: "iron_mg",               unit: "mg"  },
  { category: "Minerals",      name: "Magnesium",            field: "magnesium_mg",          unit: "mg"  },
  { category: "Minerals",      name: "Potassium",            field: "potassium_mg",          unit: "mg"  },
  { category: "Minerals",      name: "Zinc",                 field: "zinc_mg",               unit: "mg"  },
  { category: "Vitamins",      name: "Vitamin A",            field: "vitamin_a_mcg",         unit: "mcg" },
  { category: "Vitamins",      name: "Vitamin B6",           field: "vitamin_b6_mg",         unit: "mg"  },
  { category: "Vitamins",      name: "Vitamin B12",          field: "vitamin_b12_mcg",       unit: "mcg" },
  { category: "Vitamins",      name: "Vitamin C",            field: "vitamin_c_mg",          unit: "mg"  },
  { category: "Vitamins",      name: "Vitamin D",            field: "vitamin_d_mcg",         unit: "mcg" },
  { category: "Vitamins",      name: "Vitamin E",            field: "vitamin_e_mg",          unit: "mg"  },
  { category: "Vitamins",      name: "Vitamin K",            field: "vitamin_k_mcg",         unit: "mcg" },
];
const NUTR_CAT_ORDER = ["Carbohydrates", "Protein", "Fat", "Minerals", "Vitamins"];
const NUTR_CAT_COLOR: Record<string, string> = {
  Carbohydrates: "#f59e0b", Protein: "#22c55e", Fat: "#64748b",
  Vitamins: "#8b5cf6", Minerals: "#0d9488",
};

function fmtVal(v: number | null, unit: string): string {
  if (v == null) return "—";
  if (unit === "g")   return `${v.toFixed(1)}g`;
  if (unit === "kcal") return `${Math.round(v)}`;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`;
}
function fmtPct(v: number | null, ref: number | null): string {
  if (v == null || ref == null) return "—";
  return `${Math.round((v / ref) * 100)}%`;
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function getPersonaDisplay(persona: string): string {
  if (persona === "kids") return "Kids";
  if (persona === "clean_eating") return "Clean Eating";
  return persona;
}

function capitalize(s: string | null | undefined): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── PDF Document ──────────────────────────────────────────────────────────────

export default function AnalysisReport({ result }: Props) {
  const { analysis, ingredients, metadata } = result;
  const { allergens, signals, watchlist, positive_signals, verdict, category_distribution, macro_dominance } = analysis;
  const productName = metadata.product_info.probable_product_name ?? "Unknown Product";
  const persona = verdict?.persona ?? "clean_eating";
  const tier = verdict?.label ?? (verdict?.safe ? "highly_recommended" : "not_recommended");
  const bannerColor = VERDICT_COLORS[tier] ?? C.amber;
  const verdictLabel = (VERDICT_LABELS[persona] ?? VERDICT_LABELS.clean_eating)[tier];
  const verdictMeaning = (VERDICT_MEANINGS[persona] ?? VERDICT_MEANINGS.clean_eating)[tier];

  const reviewIngredients = ingredients.filter(i => i.db_data?.human_review_flag);
  const topN = [...ingredients].sort((a, b) => a.rank - b.rank).slice(0, 5);
  const topNLabel = topN.length < 5 ? `All ${topN.length}` : "Top 5";

  return (
    <Document title={`IngredParse — ${productName}`} author="IngredParse">
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.headerRow}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={s.brandCircle}>
              <Text style={{ color: C.white, fontSize: 14 }}>✦</Text>
            </View>
            <View>
              <Text style={s.brandName}>{BRAND.name}</Text>
              <Text style={s.brandTagline}>{BRAND.tagline}</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerMeta}>Analysed for: {getPersonaDisplay(persona)} Persona</Text>
            <Text style={s.headerMeta}>{formatDate()}</Text>
            {metadata.product_info.category && (
              <Text style={s.headerMeta}>{metadata.product_info.category}</Text>
            )}
          </View>
        </View>

        {/* Product name */}
        <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold", color: C.slate900, marginBottom: 12 }}>
          {productName}
        </Text>

        <View style={s.divider} />

        {/* ── Allergens ── */}
        <Text style={s.sectionTitle}>Allergens</Text>
        <View style={s.allergenGrid}>
          {ALLERGENS.map(({ key, label, emoji }) => {
            const detected = allergens[key] === true;
            return (
              <View
                key={key}
                style={[
                  s.allergenCard,
                  { backgroundColor: detected ? "#fef2f2" : C.slate50, borderWidth: 1, borderColor: detected ? "#fecaca" : "#e2e8f0" },
                ]}
              >
                <Text style={s.allergenEmoji}>{emoji}</Text>
                <Text style={[s.allergenLabel, { color: detected ? C.red : C.slate500 }]}>{label}</Text>
                <Text style={[s.allergenStatus, { color: detected ? "#ef4444" : C.slate400 }]}>
                  {detected ? "⚠ Present" : "✓ Not found"}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={s.divider} />

        {/* ── Verdict ── */}
        <Text style={s.sectionTitle}>Verdict</Text>
        <View style={[s.verdictBanner, { backgroundColor: bannerColor }]}>
          <Text style={s.verdictLabel}>{verdictLabel}</Text>
          <Text style={s.verdictMeaning}>{verdictMeaning}</Text>
          {verdict.summary && <Text style={s.verdictSummary}>{verdict.summary}</Text>}
          <Text style={s.verdictPersona}>{getPersonaDisplay(persona)} Persona</Text>
        </View>

        {/* Highlights */}
        {verdict.highlights.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { marginBottom: 4 }]}>
              {tier === "highly_recommended" ? "Worth Noting" : "Key Concerns"}
            </Text>
            <View style={s.highlightRow}>
              {verdict.highlights.map((h, i) => (
                <View key={i} style={s.highlightCard}>
                  <Text style={s.highlightIngredient}>{h.ingredient}</Text>
                  <Text style={s.highlightReason}>{h.reason}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={s.divider} />

        {/* ── Watchlist ── */}
        {watchlist?.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Watchlist</Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderCell, { flex: 0.8 }]}>Category</Text>
                <Text style={[s.tableHeaderCell, { flex: 1.2 }]}>Ingredients</Text>
                <Text style={[s.tableHeaderCell, { flex: 1.5 }]}>Reason</Text>
              </View>
              {watchlist.map((w, i) => (
                <View key={i} style={s.tableRow}>
                  <Text style={[s.tableCellBold, { flex: 0.8, textTransform: "capitalize" }]}>
                    {w.watchlist_category.replace(/_/g, " ")}
                  </Text>
                  <Text style={[s.tableCell, { flex: 1.2 }]}>{w.ingredients.join(", ")}</Text>
                  <Text style={[s.tableCell, { flex: 1.5 }]}>{w.reason}</Text>
                </View>
              ))}
            </View>
            <View style={s.divider} />
          </>
        )}

        {/* ── Positive Signals ── */}
        {positive_signals?.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Positive Signals</Text>
            <View style={s.table}>
              {positive_signals.map((ps, i) => (
                <View key={i} style={s.positiveRow}>
                  <View style={s.positiveDot} />
                  <Text style={s.positiveSignal}>{ps.signal}</Text>
                  <Text style={s.positiveReason}>{ps.reason}</Text>
                </View>
              ))}
            </View>
            <View style={s.divider} />
          </>
        )}

        {/* ── Ingredient Signals ── */}
        {signals?.sugar && (
          <>
            <Text style={s.sectionTitle}>Ingredient Signals</Text>
            {[
              { label: "Sugar Sources",  data: signals.sugar },
              { label: "Sodium Sources", data: signals.sodium },
              { label: "Processed Fats", data: signals.processed_fat },
            ].filter(({ data }) => data != null).map(({ label, data }) => (
              <View key={label} style={s.signalRow}>
                <Text style={s.signalLabel}>{label}</Text>
                <Text style={s.signalCount}>{data.count}</Text>
                <Text style={s.signalIngredients}>
                  {data.ingredients.length > 0 ? data.ingredients.join(", ") : "None detected"}
                </Text>
              </View>
            ))}
            <View style={s.divider} />
          </>
        )}

        {/* ── Ingredient Concentration ── */}
        {ingredients.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Ingredient Concentration ({topNLabel})</Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderCell, { flex: 0.3 }]}>#</Text>
                <Text style={[s.tableHeaderCell, { flex: 2 }]}>Ingredient</Text>
                <Text style={[s.tableHeaderCell, { flex: 0.6 }]}>Qty</Text>
              </View>
              {topN.map((ing) => (
                <View key={ing.rank} style={s.tableRow}>
                  <Text style={[s.tableCellBold, { flex: 0.3, color: C.primary }]}>{ing.rank}</Text>
                  <Text style={[s.tableCell, { flex: 2 }]}>{ing.raw_text}</Text>
                  <Text style={[s.tableCell, { flex: 0.6 }]}>
                    {ing.quantity?.value != null ? `${ing.quantity.value}${ing.quantity.unit ?? ""}` : "—"}
                  </Text>
                </View>
              ))}
            </View>
            <View style={s.divider} />
          </>
        )}

        {/* ── Ingredient Breakdown ── */}
        {category_distribution && (
          <>
            <Text style={s.sectionTitle}>Ingredient Breakdown</Text>
            {(["natural", "processed", "artificial"] as const).map((cat) => {
              const data = category_distribution?.[cat];
              if (!data || data.count === 0) return null;
              const color = CATEGORY_COLORS[cat];
              return (
                <View key={cat} style={s.categoryBlock}>
                  <Text style={[s.categoryLabel, { color }]}>
                    {capitalize(cat)} ({data.count})
                  </Text>
                  {data.ingredients.map((name) => {
                    const ing = ingredients.find(i => i.raw_text === name);
                    const tags = ing?.db_data?.ingredient_tags ?? [];
                    return (
                      <View key={name} style={s.ingredientRow}>
                        <Text style={s.bullet}>•</Text>
                        <Text style={s.ingredientName}>{name}</Text>
                        {tags.slice(0, 2).map((tag) => (
                          <Text key={tag} style={[s.tag, { backgroundColor: TAG_COLORS[tag] ?? C.slate400 }]}>
                            {TAG_LABELS[tag] ?? tag}
                          </Text>
                        ))}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </>
        )}

        <View style={s.divider} />

        {/* ── Macronutrient Profile ── */}
        {macro_dominance.dominant && (
          <>
            <Text style={s.sectionTitle}>Macronutrient Profile</Text>
            <View style={s.macroRow}>
              {[
                { rank: "Dominant",  value: macro_dominance.dominant },
                { rank: "Secondary", value: macro_dominance.secondary },
                { rank: "Tertiary",  value: macro_dominance.tertiary },
              ].map(({ rank, value }) => value ? (
                <View key={rank} style={s.macroItem}>
                  <Text style={s.macroRank}>{rank}</Text>
                  <Text style={s.macroValue}>{value}</Text>
                </View>
              ) : null)}
            </View>
            <View style={s.divider} />
          </>
        )}

        {/* ── AI Review Notice ── */}
        {reviewIngredients.length > 0 && (
          <View style={s.reviewNotice}>
            <Text style={s.reviewNoticeText}>
              ⚠ {reviewIngredients.length} ingredient{reviewIngredients.length > 1 ? "s" : ""} ({reviewIngredients.map(i => i.raw_text).join(", ")}) were analysed using AI knowledge and are pending expert review. Data may be updated after review.
            </Text>
          </View>
        )}

        {/* ── Disclaimer ── */}
        <View style={s.divider} />
        <View style={{
          backgroundColor: C.slate50,
          borderRadius: 6,
          padding: "10 12",
          borderWidth: 1,
          borderColor: "#e2e8f0",
          marginBottom: 24,
        }}>
          <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: C.slate500, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5 }}>
            Disclaimer
          </Text>
          {DISCLAIMER_LINES.map((line, i) => (
            <Text key={i} style={{ fontSize: 7.5, color: C.slate700, lineHeight: 1.6, marginBottom: i < DISCLAIMER_LINES.length - 1 ? 5 : 0 }}>
              {line}
            </Text>
          ))}
        </View>

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Generated by {BRAND.name} · {formatDate()}</Text>
          <Text style={s.footerText}>For informational purposes only</Text>
        </View>

      </Page>

      {/* ── Page 2: Nutrition Analysis ── */}
      {result.nutrition && (() => {
        const nutr = result.nutrition!;
        const drv = persona === "kids" ? DAILY_REF_KIDS : DAILY_REF_ADULT;
        const personaLabel = persona === "kids" ? "Child" : "Adult";
        const hasFullPack = (nutr.servings_per_pack ?? 0) > 1;
        const has100g = nutr.per_100g != null;

        const perServing = nutr.per_serving;
        const per100g    = nutr.per_100g;
        const perFullPack = hasFullPack && nutr.servings_per_pack != null
          ? scaleNutrientValues(perServing, nutr.servings_per_pack)
          : null;

        const servingLabel   = nutr.default_serving_label ?? nutr.serving_size ?? "1 serving";
        const fullPackLabel  = nutr.full_pack_serving_label ?? `Full pack (${nutr.servings_per_pack} servings)`;

        // column widths (flex units)
        const colName  = 1.6;
        const colLimit = 0.65;
        const colServ  = 0.7;
        const colPctS  = 0.55;
        const col100g  = 0.7;
        const colFP    = 0.7;
        const colPctFP = 0.55;

        return (
          <Page size="A4" style={s.page}>

            {/* Header */}
            <View style={s.headerRow}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={s.brandCircle}>
                  <Text style={{ color: C.white, fontSize: 14 }}>✦</Text>
                </View>
                <View>
                  <Text style={s.brandName}>{BRAND.name}</Text>
                  <Text style={s.brandTagline}>{BRAND.tagline}</Text>
                </View>
              </View>
              <View style={s.headerRight}>
                <Text style={s.headerMeta}>Nutrition Analysis</Text>
                <Text style={s.headerMeta}>{personaLabel} daily limits · {formatDate()}</Text>
              </View>
            </View>

            <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold", color: C.slate900, marginBottom: 2 }}>
              {productName}
            </Text>
            <Text style={{ fontSize: 8, color: C.slate400, marginBottom: 4 }}>
              Serving size: {servingLabel}
              {hasFullPack ? `  ·  ${nutr.servings_per_pack} servings per pack` : ""}
            </Text>

            <View style={s.divider} />

            {/* Calories highlight */}
            <Text style={s.sectionTitle}>Calories</Text>
            <View style={s.caloriesRow}>
              <View style={s.caloriesBox}>
                <Text style={s.caloriesLabel}>Per Serving</Text>
                <Text style={s.caloriesValue}>{perServing.calories != null ? Math.round(perServing.calories) : "—"}</Text>
                <Text style={s.caloriesUnit}>kcal</Text>
              </View>
              {has100g && (
                <View style={s.caloriesBox}>
                  <Text style={s.caloriesLabel}>Per 100g / 100ml</Text>
                  <Text style={s.caloriesValue}>{per100g?.calories != null ? Math.round(per100g.calories) : "—"}</Text>
                  <Text style={s.caloriesUnit}>kcal</Text>
                </View>
              )}
              {hasFullPack && (
                <View style={s.caloriesBox}>
                  <Text style={s.caloriesLabel}>{fullPackLabel}</Text>
                  <Text style={s.caloriesValue}>{perFullPack?.calories != null ? Math.round(perFullPack.calories) : "—"}</Text>
                  <Text style={s.caloriesUnit}>kcal</Text>
                </View>
              )}
            </View>

            <View style={s.divider} />

            {/* Main nutrients table */}
            <Text style={s.sectionTitle}>Nutrient Breakdown</Text>
            <View style={s.nutrTable}>

              {/* Column headers */}
              <View style={s.nutrHeaderRow}>
                <Text style={[s.nutrHeaderCell, { flex: colName }]}>Nutrient</Text>
                <Text style={[s.nutrHeaderCell, { flex: colLimit, textAlign: "right" }]}>{personaLabel} DV</Text>
                <Text style={[s.nutrHeaderCell, { flex: colServ,  textAlign: "right" }]}>Per Serving</Text>
                <Text style={[s.nutrHeaderCell, { flex: colPctS,  textAlign: "right" }]}>%DV</Text>
                {has100g && <Text style={[s.nutrHeaderCell, { flex: col100g, textAlign: "right" }]}>Per 100g</Text>}
                {hasFullPack && <Text style={[s.nutrHeaderCell, { flex: colFP,   textAlign: "right" }]}>Full Pack</Text>}
                {hasFullPack && <Text style={[s.nutrHeaderCell, { flex: colPctFP, textAlign: "right" }]}>%DV</Text>}
              </View>

              {NUTR_CAT_ORDER.map((cat) => {
                const rows = NUTR_ROW_DEFS.filter(
                  (r) => r.category === cat && perServing[r.field] != null
                );
                if (rows.length === 0) return null;
                const catColor = NUTR_CAT_COLOR[cat];

                return (
                  <View key={cat}>
                    {/* Category label */}
                    <View style={[s.nutrCatRow, { backgroundColor: `${catColor}18` }]}>
                      <Text style={[s.nutrCatLabel, { flex: 1, color: catColor }]}>{cat}</Text>
                    </View>

                    {rows.map((row) => {
                      const sv   = perServing[row.field] as number | null;
                      const hg   = per100g?.[row.field] as number | null | undefined;
                      const fp   = perFullPack?.[row.field] as number | null | undefined;
                      const ref  = (drv[row.field] as number | undefined) ?? null;
                      const isTF = row.field === "trans_fat_g";

                      return (
                        <View key={row.field} style={s.nutrDataRow}>
                          <Text style={[s.nutrCell, { flex: colName, paddingLeft: 8 }]}>{row.name}</Text>
                          <Text style={[s.nutrCell, { flex: colLimit, textAlign: "right", color: C.slate400 }]}>
                            {ref != null ? `${ref}${row.unit}` : "—"}
                          </Text>
                          <Text style={[s.nutrCellBold, { flex: colServ, textAlign: "right" }]}>
                            {fmtVal(sv, row.unit)}
                          </Text>
                          <View style={{ flex: colPctS, alignItems: "flex-end", justifyContent: "center" }}>
                            {isTF
                              ? <Text style={s.nutrLimitBadge}>Limit</Text>
                              : <Text style={[s.nutrCell, { color: (() => { const p = sv != null && ref ? (sv/ref)*100 : 0; return p > 50 ? C.red : p > 20 ? C.amber : C.slate400; })() }]}>
                                  {fmtPct(sv, ref)}
                                </Text>
                            }
                          </View>
                          {has100g && (
                            <Text style={[s.nutrCell, { flex: col100g, textAlign: "right" }]}>
                              {fmtVal(hg ?? null, row.unit)}
                            </Text>
                          )}
                          {hasFullPack && (
                            <Text style={[s.nutrCellBold, { flex: colFP, textAlign: "right" }]}>
                              {fmtVal(fp ?? null, row.unit)}
                            </Text>
                          )}
                          {hasFullPack && (
                            <View style={{ flex: colPctFP, alignItems: "flex-end", justifyContent: "center" }}>
                              {isTF
                                ? <Text style={s.nutrLimitBadge}>Limit</Text>
                                : <Text style={[s.nutrCell, { color: (() => { const p = fp != null && ref ? ((fp as number)/ref)*100 : 0; return p > 50 ? C.red : p > 20 ? C.amber : C.slate400; })() }]}>
                                    {fmtPct(fp ?? null, ref)}
                                  </Text>
                              }
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>

            <Text style={{ fontSize: 7, color: C.slate400, marginBottom: 24 }}>
              Based on WHO-aligned {personaLabel.toLowerCase()} daily reference values · %DV = % of daily value · not medical advice
            </Text>

            {/* Footer */}
            <View style={s.footer} fixed>
              <Text style={s.footerText}>Generated by {BRAND.name} · {formatDate()}</Text>
              <Text style={s.footerText}>For informational purposes only</Text>
            </View>

          </Page>
        );
      })()}

    </Document>
  );
}
