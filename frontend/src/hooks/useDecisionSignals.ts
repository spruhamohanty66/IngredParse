/**
 * useDecisionSignals — Tracks user interactions on the results screen
 * for the North Star eval: "% of analyses that lead to informed decisions"
 *
 * Tracks:
 *   - Time spent on results screen
 *   - Interactive chart clicks (ingredient category, macro bar, nutrient chip, watchlist, serving toggle)
 *   - Scans in session
 *
 * Sends signals to backend on unmount (page leave / back navigation).
 */

import { useRef, useEffect, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Session-level state (persists across ResultsScreen mounts within same session)
let sessionId: string | null = null;
let scansInSession = 0;

function getSessionId(): string {
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    scansInSession = 0;
  }
  return sessionId;
}

/** Reset session (call when user goes back to home screen) */
export function resetSession() {
  sessionId = null;
  scansInSession = 0;
}

export interface InteractionCounts {
  ingredient_category_click: number;
  macro_bar_click: number;
  nutrient_chip_click: number;
  watchlist_expand: number;
  serving_toggle: number;
}

interface DecisionSignalOptions {
  scanId: string;
  labelType: string | null;
  persona: string | null;
}

export function useDecisionSignals({ scanId, labelType, persona }: DecisionSignalOptions) {
  const mountTime = useRef(Date.now());
  const interactions = useRef<InteractionCounts>({
    ingredient_category_click: 0,
    macro_bar_click: 0,
    nutrient_chip_click: 0,
    watchlist_expand: 0,
    serving_toggle: 0,
  });
  const sent = useRef(false);

  // Increment scan count for this session
  useEffect(() => {
    getSessionId();
    scansInSession += 1;
  }, [scanId]);

  /** Track a single interaction. Call this from interactive components. */
  const trackInteraction = useCallback((type: keyof InteractionCounts) => {
    interactions.current[type] += 1;
  }, []);

  /** Send signals to backend */
  const sendSignals = useCallback(() => {
    if (sent.current) return;
    sent.current = true;

    const timeOnScreen = (Date.now() - mountTime.current) / 1000;

    const payload = {
      scan_id: scanId,
      session_id: getSessionId(),
      time_on_screen_seconds: Math.round(timeOnScreen * 10) / 10,
      interactions: { ...interactions.current },
      scans_in_session: scansInSession,
      scan_sequence: scansInSession,
      label_type: labelType,
      persona,
    };

    const body = JSON.stringify(payload);
    const url = `${API_BASE}/api/evals/decision-signal`;

    if (process.env.NODE_ENV === 'development') {
      console.log("[DecisionSignal] Sending signal:", payload);
    }

    // Use fetch with keepalive — sendBeacon can drop Content-Type header
    // causing FastAPI to reject the request
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch((err) => {
      console.error("[DecisionSignal] fetch failed, trying sendBeacon:", err);
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(url, blob);
      }
    });
  }, [scanId, labelType, persona]);

  // Send on unmount (back navigation)
  useEffect(() => {
    return () => {
      sendSignals();
    };
  }, [sendSignals]);

  // Send on page unload / tab close
  useEffect(() => {
    const handleUnload = () => sendSignals();
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [sendSignals]);

  return { trackInteraction, sendSignals };
}
