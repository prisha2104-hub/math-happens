"use client";

import { useCallback, useEffect, useState } from "react";
import { EMPTY_REVIEW_STATE, type ReviewState } from "@/lib/review/types";
import { ensureReviewState } from "@/lib/services/recordSession";
import type { Attempt, SessionSummary } from "@/lib/session/types";
import { getRepositories } from "@/lib/storage/client";

export interface HistoryData {
  sessions: SessionSummary[];
  attempts: Attempt[];
  review: ReviewState;
  /** Epoch ms when this snapshot was loaded; use it as "now" for analysis so renders stay pure. */
  loadedAt: number;
}

export type HistoryStatus = "loading" | "ready" | "error";

const EMPTY: HistoryData = { sessions: [], attempts: [], review: EMPTY_REVIEW_STATE, loadedAt: 0 };

/** Everything stored locally, loaded once per mount; call `reload` after writes. */
export function useHistory() {
  const [data, setData] = useState<HistoryData>(EMPTY);
  const [status, setStatus] = useState<HistoryStatus>("loading");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const repos = getRepositories();
    Promise.all([repos.sessions.list(), repos.attempts.listAll(), ensureReviewState(repos)])
      .then(([sessions, attempts, review]) => {
        if (cancelled) return;
        setData({ sessions: [...sessions].sort((a, b) => b.endedAt - a.endedAt), attempts, review, loadedAt: Date.now() });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...data, status, reload };
}
