"use client";

import { useEffect, useState } from "react";

interface DBIngredient {
  id: number;
  name: string;
  json_data: Record<string, any>;
}

interface DBBrowserProps {
  onSelectItem: (item: DBIngredient) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function DBBrowser({ onSelectItem }: DBBrowserProps) {
  const [items, setItems] = useState<DBIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchDebounce, setSearchDebounce] = useState("");
  const PAGE_SIZE = 30;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (searchDebounce) {
      fetchSearch();
    } else {
      fetchPage();
    }
  }, [page, searchDebounce]);

  async function fetchPage() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/sme/db-ingredients?offset=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`
      );
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setItems(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSearch() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/sme/db-ingredients/search?q=${encodeURIComponent(searchDebounce)}`
      );
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setItems(data.data || []);
      setTotal(data.data?.length || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Ingredient Database</h2>
        <p className="text-sm text-slate-500 mt-1">
          Browse and edit all ingredients in the database ({total} total)
        </p>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search ingredients by name..."
          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-orange-500 focus:outline-none"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-8">
          <p className="text-slate-500">Loading...</p>
        </div>
      )}

      {/* Empty */}
      {!loading && items.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-500">
            {search ? "No matching ingredients found" : "No ingredients in database"}
          </p>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectItem(item)}
            className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-4 hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate">{item.name}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {item.json_data?.functional_role_db && (
                    <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                      {item.json_data.functional_role_db}
                    </span>
                  )}
                  {item.json_data?.macro_profile?.primary_macro && (
                    <span className="text-xs px-2 py-0.5 bg-purple-100 rounded text-purple-600">
                      {item.json_data.macro_profile.primary_macro}
                    </span>
                  )}
                  {item.json_data?.allergy_flag_info?.allergy_flag && (
                    <span className="text-xs px-2 py-0.5 bg-red-100 rounded text-red-600">
                      Allergen: {item.json_data.allergy_flag_info.allergy_type}
                    </span>
                  )}
                  {item.json_data?.watchlist_category && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 rounded text-yellow-700">
                      {item.json_data.watchlist_category}
                    </span>
                  )}
                  {item.json_data?.ingredient_category && (
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      item.json_data.ingredient_category === "natural"
                        ? "bg-green-100 text-green-700"
                        : item.json_data.ingredient_category === "artificial"
                        ? "bg-red-100 text-red-700"
                        : "bg-orange-100 text-orange-700"
                    }`}>
                      {item.json_data.ingredient_category}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs text-slate-400">ID: {item.id}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Pagination */}
      {!searchDebounce && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:opacity-50 hover:bg-slate-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:opacity-50 hover:bg-slate-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
