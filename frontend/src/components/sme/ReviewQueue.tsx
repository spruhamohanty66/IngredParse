"use client";

import { useEffect, useState } from "react";
import { ReviewItem } from "./SMEClient";

interface ReviewQueueProps {
  status: "pending" | "approved" | "rejected";
  onStatusChange: (status: "pending" | "approved" | "rejected") => void;
  onSelectItem: (item: ReviewItem) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function ReviewQueue({ status, onStatusChange, onSelectItem }: ReviewQueueProps) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });

  useEffect(() => {
    fetchQueue();
  }, [status]);

  async function fetchQueue() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/sme/queue?status=${status}`);
      if (!response.ok) throw new Error(`Failed to fetch queue: ${response.status}`);
      const data = await response.json();
      setItems(data.data || []);

      // Also fetch counts for all statuses
      const pendingRes = await fetch(`${API_BASE}/api/sme/queue?status=pending`);
      const approvedRes = await fetch(`${API_BASE}/api/sme/queue?status=approved`);
      const rejectedRes = await fetch(`${API_BASE}/api/sme/queue?status=rejected`);

      const pendingData = await pendingRes.json();
      const approvedData = await approvedRes.json();
      const rejectedData = await rejectedRes.json();

      setCounts({
        pending: pendingData.data?.length ?? 0,
        approved: approvedData.data?.length ?? 0,
        rejected: rejectedData.data?.length ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }

  const tabs = [
    { value: "pending", label: "Pending", count: counts.pending },
    { value: "approved", label: "Approved", count: counts.approved },
    { value: "rejected", label: "Rejected", count: counts.rejected },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">SME Review Queue</h2>
        <p className="text-sm text-slate-500 mt-1">
          Review and validate GPT-4 enriched ingredient data
        </p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onStatusChange(tab.value)}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              status === tab.value
                ? "text-orange-600 border-b-2 border-orange-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab.label}
            <span className="ml-2 text-xs px-2 py-1 bg-slate-100 rounded-full">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-8">
          <p className="text-slate-500">Loading...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-500">No {status} items</p>
        </div>
      )}

      {/* Queue list */}
      <div className="space-y-3">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectItem(item)}
            className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-4 hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate">
                  {item.name || item.raw_name}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Raw OCR: {item.raw_name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 bg-slate-100 rounded text-slate-700">
                  {item.source}
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded font-medium ${
                    status === "pending"
                      ? "bg-yellow-100 text-yellow-800"
                      : status === "approved"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {status}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {new Date(item.submitted_at).toLocaleString()}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
