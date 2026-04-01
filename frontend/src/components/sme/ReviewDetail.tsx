"use client";

import { useState, useEffect } from "react";
import { ReviewItem } from "./SMEClient";

interface DBMatch {
  id: number;
  name: string;
  json_data: Record<string, any>;
}

interface ReviewDetailProps {
  item: ReviewItem;
  onBack: () => void;
  onItemUpdated: (item: ReviewItem) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const INGREDIENT_CATEGORIES = ["natural", "processed", "artificial"];
const SIGNAL_CATEGORIES = ["sugar", "sodium", "processed_fat", "none"];
const MACRO_OPTIONS = ["carbohydrate", "fat", "protein", "water", "fiber", "none"];
const ALLERGY_TYPES = [
  "milk",
  "egg",
  "peanut",
  "gluten",
  "tree_nut",
  "shellfish",
  "sesame",
];
const FUNCTIONAL_ROLE_DB_OPTIONS = [
  "emulsifier",
  "stabilizer",
  "preservative",
  "acidity_regulator",
  "anti_caking_agent",
  "raising_agent",
  "thickener",
  "colorant",
  "flavoring_agent",
  "flavor_enhancer",
  "fat_source",
  "sweetener",
  "structure_provider",
  "fruit_component",
  "protein_source",
  "humectant",
  "bleaching_agent",
  "bulking_agent",
];
const WATCHLIST_CATEGORY_OPTIONS = [
  "high_sugar",
  "added_sugar",
  "artificial_color",
  "artificial_flavor",
  "natural_flavor",
  "artificial_sweetener",
  "processed_fat",
  "high_sodium",
  "highly_processed",
  "refined_carbohydrate",
  "caffeine",
  "banned_ingredient",
];

export default function ReviewDetail({ item, onBack, onItemUpdated }: ReviewDetailProps) {
  const [name, setName] = useState(item.name || "");
  const [functionalRole, setFunctionalRole] = useState(item.functional_role || "");
  const [smeNotes, setSmeNotes] = useState(item.sme_notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [jsonData, setJsonData] = useState(item.json_data || {});
  const [dbMatches, setDbMatches] = useState<DBMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [showMatchDetail, setShowMatchDetail] = useState<DBMatch | null>(null);

  // Fetch possible DB matches on mount
  useEffect(() => {
    async function fetchMatches() {
      setMatchesLoading(true);
      try {
        const searchTerms = [item.raw_name];
        if (item.name) {
          item.name.replace(/\|/g, ",").split(",").forEach((n) => {
            const trimmed = n.trim();
            if (trimmed) searchTerms.push(trimmed);
          });
        }
        const allMatches: DBMatch[] = [];
        const seenIds = new Set<number>();
        for (const term of searchTerms) {
          const res = await fetch(`${API_BASE}/api/sme/db-ingredients/search?q=${encodeURIComponent(term)}`);
          if (res.ok) {
            const data = await res.json();
            for (const match of data.data || []) {
              if (!seenIds.has(match.id)) {
                seenIds.add(match.id);
                allMatches.push(match);
              }
            }
          }
        }
        setDbMatches(allMatches);
      } catch {
        // Non-blocking — matches are optional
      } finally {
        setMatchesLoading(false);
      }
    }
    fetchMatches();
  }, [item.raw_name, item.name]);

  const handleJsonDataChange = (key: string, value: any) => {
    setJsonData({ ...jsonData, [key]: value });
  };

  const handleNestedChange = (parent: string, child: string, value: any) => {
    setJsonData({
      ...jsonData,
      [parent]: {
        ...(jsonData[parent] || {}),
        [child]: value,
      },
    });
  };

  const handleMacroChange = (key: "primary_macro" | "secondary_macro" | "tertiary_macro", value: string) => {
    const macroProfile = jsonData.macro_profile || {};
    handleNestedChange("macro_profile", key, value === "none" ? null : value);
  };

  const handleTagToggle = (tag: string) => {
    const tags = jsonData.ingredient_tags || [];
    const updated = tags.includes(tag) ? tags.filter((t: string) => t !== tag) : [...tags, tag];
    handleJsonDataChange("ingredient_tags", updated);
  };

  async function handleSaveDraft() {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/sme/queue/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || null,
          functional_role: functionalRole || null,
          json_data: { ...jsonData, common_names: name || null },
          sme_notes: smeNotes || null,
        }),
      });
      if (!response.ok) throw new Error("Failed to save draft");
      const updated = await response.json();
      onItemUpdated(updated);
      setSuccessMessage("Draft saved");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    // First save any pending changes
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    if (!name.trim()) {
      setError("Common names are required before approval");
      setSaving(false);
      return;
    }

    try {
      // Update first
      await fetch(`${API_BASE}/api/sme/queue/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          functional_role: functionalRole || null,
          json_data: { ...jsonData, common_names: name || null },
          sme_notes: smeNotes || null,
        }),
      });

      // Then approve
      const response = await fetch(`${API_BASE}/api/sme/queue/${item.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed_by: "SME" }),
      });
      if (!response.ok) throw new Error("Failed to approve");
      const updated = await response.json();
      setSuccessMessage("Item approved and saved to database");
      setTimeout(() => {
        onBack();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/sme/queue/${item.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed_by: "SME" }),
      });
      if (!response.ok) throw new Error("Failed to reject");
      setSuccessMessage("Item rejected");
      setTimeout(() => {
        onBack();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          ← Back
        </button>
        <div>
          <h2 className="text-2xl font-bold">Review Ingredient</h2>
          <p className="text-xs text-slate-500 mt-1">ID: {item.id}</p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 text-sm">{successMessage}</p>
        </div>
      )}

      {/* Possible DB Matches */}
      {(matchesLoading || dbMatches.length > 0) && (
        <div className="bg-blue-50 rounded-2xl border border-blue-200 p-6 space-y-3">
          <h3 className="font-semibold text-blue-900">
            Possible DB Matches
            {dbMatches.length > 0 && (
              <span className="ml-2 text-xs px-2 py-1 bg-blue-100 rounded-full text-blue-700">
                {dbMatches.length}
              </span>
            )}
          </h3>
          {matchesLoading ? (
            <p className="text-sm text-blue-600">Searching database...</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-blue-700">
                Similar ingredients found in DB. Review before approving to avoid duplicates.
              </p>
              {dbMatches.map((match) => (
                <div key={match.id} className="bg-white rounded-lg border border-blue-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-900">{match.name}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {match.json_data?.functional_role_db && (
                          <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                            {match.json_data.functional_role_db}
                          </span>
                        )}
                        {match.json_data?.allergy_flag_info?.allergy_flag && (
                          <span className="text-xs px-2 py-0.5 bg-red-100 rounded text-red-600">
                            Allergen: {match.json_data.allergy_flag_info.allergy_type}
                          </span>
                        )}
                        {match.json_data?.watchlist_category && (
                          <span className="text-xs px-2 py-0.5 bg-yellow-100 rounded text-yellow-700">
                            {match.json_data.watchlist_category}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMatchDetail(showMatchDetail?.id === match.id ? null : match)}
                      className="text-xs px-3 py-1 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50"
                    >
                      {showMatchDetail?.id === match.id ? "Hide" : "Details"}
                    </button>
                  </div>
                  {showMatchDetail?.id === match.id && (
                    <div className="mt-3 pt-3 border-t border-blue-100 text-xs text-slate-600 space-y-1">
                      <p><span className="font-medium">INS:</span> {match.json_data?.ins_number || "—"}</p>
                      <p><span className="font-medium">Macro:</span> {match.json_data?.macro_profile?.primary_macro || "—"} / {match.json_data?.macro_profile?.secondary_macro || "—"}</p>
                      <p><span className="font-medium">Category:</span> {match.json_data?.ingredient_category || "—"}</p>
                      <p><span className="font-medium">Limit:</span> {match.json_data?.limit_info?.limit_needed ? `${match.json_data.limit_info.max_percentage}% (${match.json_data.limit_info.regulatory_body})` : "None"}</p>
                      <p className="text-blue-700 font-medium mt-2">
                        DB ID: {match.id} — Edit this in the DB Browser tab
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section 1: Identity */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">Identity</h3>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            Raw OCR Name (read-only)
          </label>
          <input
            type="text"
            value={item.raw_name}
            disabled
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            Common Names (comma-separated, required)
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Gelatin, Gelatine"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-orange-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            Functional Role
          </label>
          <input
            type="text"
            value={functionalRole}
            onChange={(e) => setFunctionalRole(e.target.value)}
            placeholder="e.g., Thickener, Emulsifier"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-orange-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            INS Number
          </label>
          <input
            type="text"
            value={jsonData.ins_number || ""}
            onChange={(e) => handleJsonDataChange("ins_number", e.target.value || null)}
            placeholder="e.g., INS 627"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-orange-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            Functional Role (DB)
          </label>
          <select
            value={jsonData.functional_role_db || ""}
            onChange={(e) => handleJsonDataChange("functional_role_db", e.target.value || null)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-orange-500 focus:outline-none"
          >
            <option value="">Select...</option>
            {FUNCTIONAL_ROLE_DB_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {role.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Section 2: Classification */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">Classification</h3>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            Ingredient Category
          </label>
          <select
            value={jsonData.ingredient_category || ""}
            onChange={(e) => handleJsonDataChange("ingredient_category", e.target.value || null)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-orange-500 focus:outline-none"
          >
            <option value="">Select...</option>
            {INGREDIENT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            Signal Category
          </label>
          <select
            value={jsonData.signal_category || ""}
            onChange={(e) => handleJsonDataChange("signal_category", e.target.value || null)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-orange-500 focus:outline-none"
          >
            <option value="">Select...</option>
            {SIGNAL_CATEGORIES.map((sig) => (
              <option key={sig} value={sig}>
                {sig === "none" ? "None" : sig.charAt(0).toUpperCase() + sig.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            Watchlist Category
          </label>
          <select
            value={jsonData.watchlist_category || ""}
            onChange={(e) => handleJsonDataChange("watchlist_category", e.target.value || null)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-orange-500 focus:outline-none"
          >
            <option value="">None</option>
            {WATCHLIST_CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat}>
                {cat.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            Ingredient Tags
          </label>
          <div className="space-y-2">
            {["additive", "preservative", "sweetener", "flavor", "color"].map((tag) => (
              <label key={tag} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(jsonData.ingredient_tags || []).includes(tag)}
                  onChange={() => handleTagToggle(tag)}
                  className="w-4 h-4 rounded border-slate-300 text-orange-600"
                />
                <span className="text-sm text-slate-700">
                  {tag.charAt(0).toUpperCase() + tag.slice(1)}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Section 3: Macro Profile */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">Macro Profile</h3>

        {["primary_macro", "secondary_macro", "tertiary_macro"].map((macroKey) => (
          <div key={macroKey}>
            <label className="block text-xs font-medium text-slate-700 mb-2">
              {macroKey
                .split("_")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ")}
            </label>
            <select
              value={jsonData.macro_profile?.[macroKey] || ""}
              onChange={(e) =>
                handleMacroChange(macroKey as any, e.target.value)
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-orange-500 focus:outline-none"
            >
              <option value="">Select...</option>
              {MACRO_OPTIONS.map((macro) => (
                <option key={macro} value={macro}>
                  {macro === "none" ? "None" : macro.charAt(0).toUpperCase() + macro.slice(1)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Section 4: Allergen Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">Allergen Info</h3>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={jsonData.allergy_flag_info?.allergy_flag || false}
            onChange={(e) =>
              handleNestedChange("allergy_flag_info", "allergy_flag", e.target.checked)
            }
            className="w-4 h-4 rounded border-slate-300 text-orange-600"
          />
          <span className="text-sm font-medium text-slate-700">Allergy Flag</span>
        </label>

        {jsonData.allergy_flag_info?.allergy_flag && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">
              Allergy Type
            </label>
            <select
              value={jsonData.allergy_flag_info?.allergy_type || ""}
              onChange={(e) =>
                handleNestedChange("allergy_flag_info", "allergy_type", e.target.value || null)
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-orange-500 focus:outline-none"
            >
              <option value="">Select...</option>
              {ALLERGY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Section 5: Regulatory */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">Regulatory</h3>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={jsonData.limit_info?.limit_needed || false}
            onChange={(e) =>
              handleNestedChange("limit_info", "limit_needed", e.target.checked)
            }
            className="w-4 h-4 rounded border-slate-300 text-orange-600"
          />
          <span className="text-sm font-medium text-slate-700">Limit Needed</span>
        </label>

        {jsonData.limit_info?.limit_needed && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">
              Max Percentage
            </label>
            <input
              type="number"
              value={jsonData.limit_info?.max_percentage || ""}
              onChange={(e) =>
                handleNestedChange("limit_info", "max_percentage", e.target.value ? parseFloat(e.target.value) : null)
              }
              placeholder="e.g., 10"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-orange-500 focus:outline-none"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            Regulatory Body
          </label>
          <input
            type="text"
            value={jsonData.limit_info?.regulatory_body || "FSSAI"}
            onChange={(e) =>
              handleNestedChange("limit_info", "regulatory_body", e.target.value)
            }
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-orange-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Section 6: SME Notes */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">SME Notes</h3>
        <textarea
          value={smeNotes}
          onChange={(e) => setSmeNotes(e.target.value)}
          placeholder="Add any notes about this ingredient..."
          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-orange-500 focus:outline-none min-h-24"
        />
      </div>

      {/* Action buttons */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex gap-3 sticky bottom-0">
        <button
          onClick={handleReject}
          disabled={saving}
          className="flex-1 px-4 py-2 border border-red-300 text-red-700 rounded-lg font-medium hover:bg-red-50 disabled:opacity-50"
        >
          {saving ? "..." : "Reject"}
        </button>
        <button
          onClick={handleSaveDraft}
          disabled={saving}
          className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {saving ? "..." : "Save Draft"}
        </button>
        <button
          onClick={handleApprove}
          disabled={saving || !name.trim()}
          className="flex-1 px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: !name.trim() ? "#ccc" : "#ec5b13" }}
        >
          {saving ? "..." : "Approve & Save"}
        </button>
      </div>
    </div>
  );
}
