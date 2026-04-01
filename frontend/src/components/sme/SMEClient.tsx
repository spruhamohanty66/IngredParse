"use client";

import { useState } from "react";
import ReviewQueue from "./ReviewQueue";
import ReviewDetail from "./ReviewDetail";
import DBBrowser from "./DBBrowser";
import DBIngredientDetail from "./DBIngredientDetail";

export interface ReviewItem {
  id: number;
  raw_name: string;
  name: string | null;
  functional_role: string | null;
  json_data: Record<string, any>;
  status: "pending" | "approved" | "rejected";
  source: string;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  sme_notes: string | null;
}

export interface DBIngredient {
  id: number;
  name: string;
  json_data: Record<string, any>;
}

type ActiveTab = "review" | "database";

export default function SMEClient() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("review");
  const [selectedReviewItem, setSelectedReviewItem] = useState<ReviewItem | null>(null);
  const [selectedDBItem, setSelectedDBItem] = useState<DBIngredient | null>(null);
  const [queueStatus, setQueueStatus] = useState<"pending" | "approved" | "rejected">("pending");

  // Review detail view
  if (selectedReviewItem) {
    return (
      <ReviewDetail
        item={selectedReviewItem}
        onBack={() => setSelectedReviewItem(null)}
        onItemUpdated={(updated) => setSelectedReviewItem(updated)}
      />
    );
  }

  // DB ingredient detail view
  if (selectedDBItem) {
    return (
      <DBIngredientDetail
        item={selectedDBItem}
        onBack={() => setSelectedDBItem(null)}
        onItemUpdated={(updated) => setSelectedDBItem(updated)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top-level tabs: Review Queue vs DB Browser */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() => setActiveTab("review")}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "review"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Review Queue
        </button>
        <button
          onClick={() => setActiveTab("database")}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "database"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          DB Browser
        </button>
      </div>

      {/* Content */}
      {activeTab === "review" ? (
        <ReviewQueue
          status={queueStatus}
          onStatusChange={setQueueStatus}
          onSelectItem={setSelectedReviewItem}
        />
      ) : (
        <DBBrowser onSelectItem={setSelectedDBItem} />
      )}
    </div>
  );
}
