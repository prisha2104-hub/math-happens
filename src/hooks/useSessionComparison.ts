"use client";

import { useEffect, useMemo, useState } from "react";
import { type SessionComparison, comparabilityKey, compareSession, previousMatchingFor } from "@/lib/analysis/comparison";
import type { Attempt, SessionSummary } from "@/lib/session/types";
import { getRepositories } from "@/lib/storage/client";

/**
 * How many matching sessions have their answers read back for the weakest
 * area. The accuracy and time figures use every matching session, since they
 * come from the summaries that are loaded anyway; individual answers cost a
 * read per session, so the most recent ones stand in for the rest.
 */
export const WEAKEST_AREA_SESSIONS = 20;

export type ComparisonStatus = "loading" | "ready" | "error";

interface LoadedHistory {
  /** The session this snapshot was loaded for; anything else is stale. */
  token: string;
  sessions: SessionSummary[];
  previousAttempts: Attempt[];
}

/**
 * Compare one finished session with the earlier ones that used the same
 * settings. Reads from storage rather than from the page's history so the
 * results screen behaves the same whether it is shown straight after a
 * session or reopened from history later.
 */
export function useSessionComparison(summary: SessionSummary, attempts: readonly Attempt[]): { status: ComparisonStatus; comparison: SessionComparison | null } {
  const [loaded, setLoaded] = useState<LoadedHistory | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Identified by primitives, so a new summary object for the same session
  // reloads nothing.
  const { id, endedAt } = summary;
  const key = comparabilityKey(summary.settings);
  const token = `${id}@${endedAt}#${key}`;

  useEffect(() => {
    let cancelled = false;
    const repos = getRepositories();
    repos.sessions
      .list()
      .then(async (sessions) => {
        // Matching happens here so only the answers that can affect the
        // figures are read back out of storage.
        const recent = previousMatchingFor({ id, endedAt, key }, sessions).slice(0, WEAKEST_AREA_SESSIONS);
        const lists = await Promise.all(recent.map((s) => repos.attempts.listBySession(s.id)));
        if (!cancelled) setLoaded({ token, sessions, previousAttempts: lists.flat() });
      })
      .catch(() => {
        if (!cancelled) setFailed(token);
      });
    return () => {
      cancelled = true;
    };
  }, [id, endedAt, key, token]);

  const ready = loaded !== null && loaded.token === token;
  const comparison = useMemo(
    () => (loaded === null || !ready ? null : compareSession({ summary, attempts, history: loaded.sessions, previousAttempts: loaded.previousAttempts })),
    [ready, loaded, summary, attempts],
  );

  return { status: ready ? "ready" : failed === token ? "error" : "loading", comparison };
}
