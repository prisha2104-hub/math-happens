import { EMPTY_REVIEW_STATE, type ReviewState } from "@/lib/review/types";
import { type Attempt, type SessionSummary, type TrainerSettings, coerceSessionSettings, coerceSettings } from "@/lib/session/types";
import { type Schema, type StorageAdapter, readVersioned, writeVersioned } from "./storage";

export const KEY_PREFIX = "math-happens";
export const SETTINGS_KEY = `${KEY_PREFIX}:settings`;
export const SESSIONS_KEY = `${KEY_PREFIX}:sessions`;
export const REVIEW_KEY = `${KEY_PREFIX}:review`;
export const ATTEMPTS_PREFIX = `${KEY_PREFIX}:attempts:`;
export const attemptsKey = (sessionId: string) => `${ATTEMPTS_PREFIX}${sessionId}`;

/**
 * Oldest sessions (and their attempts) are dropped beyond this many. With
 * IndexedDB the limit is about keeping analysis fast, not about space.
 */
export const MAX_STORED_SESSIONS = 500;

/**
 * True for the records that make up practice history: finished sessions, their
 * attempts, and the spaced-review calendar derived from them. Preferences and
 * the migration marker are deliberately excluded so clearing history can keep
 * them.
 */
export function isHistoryKey(key: string): boolean {
  return key === SESSIONS_KEY || key === REVIEW_KEY || key.startsWith(ATTEMPTS_PREFIX);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const settingsSchema: Schema<TrainerSettings> = {
  version: 1,
  parse: (data) => coerceSettings(data),
  migrate: () => null,
};

/**
 * Summaries keep their stored settings, coerced so pre-Phase-2 sessions gain
 * `answerFormat: "open"`. Unlike saved preferences, a session's settings keep
 * their Improve plan: without it an adaptive session would read back as
 * ordinary practice and be compared against Train sessions.
 */
export function normalizeSummary(item: unknown): SessionSummary | null {
  if (!isRecord(item) || typeof item.id !== "string" || typeof item.endedAt !== "number") return null;
  const raw = item as unknown as SessionSummary;
  return { ...raw, settings: coerceSessionSettings(raw.settings) };
}

export const sessionsSchema: Schema<SessionSummary[]> = {
  version: 1,
  parse: (data) => (Array.isArray(data) ? data.map(normalizeSummary).filter((s): s is SessionSummary => s !== null) : null),
  migrate: () => null,
};

/**
 * Attempts written by Phase 1 predate answer formats and error tags. They
 * were all typed answers, so they are normalised to "open" on read; the
 * stored record itself is left untouched.
 */
export function normalizeAttempt(item: unknown): Attempt | null {
  if (!isRecord(item) || typeof item.id !== "string" || typeof item.questionId !== "string") return null;
  const raw = item as Partial<Attempt> & { id: string; questionId: string };
  return {
    ...(raw as Attempt),
    answerFormat: raw.answerFormat === "multiple-choice" ? "multiple-choice" : "open",
    choice: raw.choice ?? null,
    errorTag: raw.errorTag ?? null,
  };
}

export const attemptsSchema: Schema<Attempt[]> = {
  version: 1,
  parse: (data) => (Array.isArray(data) ? data.map(normalizeAttempt).filter((a): a is Attempt => a !== null) : null),
  migrate: () => null,
};

export function normalizeReviewState(data: unknown): ReviewState | null {
  if (!isRecord(data) || !isRecord(data.items)) return null;
  const items: ReviewState["items"] = {};
  for (const [key, value] of Object.entries(data.items)) {
    if (isRecord(value) && typeof value.skillId === "string" && typeof value.dueAt === "number" && typeof value.stage === "number") {
      items[key] = value as unknown as ReviewState["items"][string];
    }
  }
  return { items, updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0 };
}

const reviewSchema: Schema<ReviewState> = {
  version: 1,
  parse: normalizeReviewState,
  migrate: () => null,
};

export interface StorageCounts {
  sessions: number;
  attempts: number;
  reviewItems: number;
}

export interface Repositories {
  settings: {
    load(): Promise<TrainerSettings | null>;
    save(settings: TrainerSettings): Promise<void>;
  };
  sessions: {
    list(): Promise<SessionSummary[]>;
  };
  attempts: {
    listBySession(sessionId: string): Promise<Attempt[]>;
    /** Every stored attempt, oldest first. */
    listAll(): Promise<Attempt[]>;
  };
  review: {
    load(): Promise<ReviewState>;
    save(state: ReviewState): Promise<void>;
  };
  /** Persist a finished session and its attempts together, pruning old sessions. */
  saveCompletedSession(summary: SessionSummary, attempts: Attempt[]): Promise<void>;
  /** Write sessions and attempts wholesale (used by import). Existing records with the same ids are replaced. */
  putSessions(sessions: SessionSummary[], attemptsBySession: Record<string, Attempt[]>): Promise<void>;
  counts(): Promise<StorageCounts>;
  /** Remove every Math Happens record. Callers must confirm with the user first. */
  clearAll(): Promise<void>;
  /**
   * Remove practice history — sessions, attempts and the review calendar —
   * while keeping preferences. Callers must confirm with the user first.
   */
  clearHistory(): Promise<void>;
}

export interface RepositoryOptions {
  /**
   * Additional stores to purge when clearing, such as the localStorage copy
   * the IndexedDB migration leaves behind as a backup. Without this a cleared
   * record could be copied back the next time the migration runs.
   */
  mirrors?: readonly StorageAdapter[];
  /** Sessions kept before the oldest are dropped. Overridable so tests do not have to write 500 records. */
  maxSessions?: number;
}

export function createRepositories(adapter: StorageAdapter, { mirrors = [], maxSessions = MAX_STORED_SESSIONS }: RepositoryOptions = {}): Repositories {
  const listSessions = async () => (await readVersioned(adapter, SESSIONS_KEY, sessionsSchema)) ?? [];
  const listAttempts = async (sessionId: string) => (await readVersioned(adapter, attemptsKey(sessionId), attemptsSchema)) ?? [];
  const writeSessions = (sessions: SessionSummary[], at: number) => writeVersioned(adapter, SESSIONS_KEY, sessionsSchema, sessions, at);

  return {
    settings: {
      load: () => readVersioned(adapter, SETTINGS_KEY, settingsSchema),
      save: (settings) => writeVersioned(adapter, SETTINGS_KEY, settingsSchema, settings),
    },
    sessions: {
      list: listSessions,
    },
    attempts: {
      listBySession: listAttempts,
      async listAll() {
        const sessions = await listSessions();
        const all: Attempt[] = [];
        for (const session of sessions) all.push(...(await listAttempts(session.id)));
        return all.sort((a, b) => a.submittedAt - b.submittedAt);
      },
    },
    review: {
      load: async () => (await readVersioned(adapter, REVIEW_KEY, reviewSchema)) ?? EMPTY_REVIEW_STATE,
      save: (state) => writeVersioned(adapter, REVIEW_KEY, reviewSchema, state, state.updatedAt),
    },
    async saveCompletedSession(summary, attempts) {
      const existing = (await listSessions()).filter((s) => s.id !== summary.id);
      const kept = [...existing, summary].slice(-maxSessions);
      const dropped = existing.filter((s) => !kept.includes(s));
      await writeVersioned(adapter, attemptsKey(summary.id), attemptsSchema, attempts, summary.endedAt);
      await writeSessions(kept, summary.endedAt);
      for (const session of dropped) await adapter.remove(attemptsKey(session.id));
    },
    async putSessions(sessions, attemptsBySession) {
      const incomingIds = new Set(sessions.map((s) => s.id));
      const existing = (await listSessions()).filter((s) => !incomingIds.has(s.id));
      const merged = [...existing, ...sessions].sort((a, b) => a.endedAt - b.endedAt).slice(-maxSessions);
      const keptIds = new Set(merged.map((s) => s.id));
      for (const session of sessions) {
        if (!keptIds.has(session.id)) continue;
        await writeVersioned(adapter, attemptsKey(session.id), attemptsSchema, attemptsBySession[session.id] ?? [], session.endedAt);
      }
      await writeSessions(merged, Date.now());
      for (const session of existing) if (!keptIds.has(session.id)) await adapter.remove(attemptsKey(session.id));
    },
    async counts() {
      const sessions = await listSessions();
      let attempts = 0;
      for (const session of sessions) attempts += (await listAttempts(session.id)).length;
      const review = (await readVersioned(adapter, REVIEW_KEY, reviewSchema)) ?? EMPTY_REVIEW_STATE;
      return { sessions: sessions.length, attempts, reviewItems: Object.keys(review.items).length };
    },
    async clearAll() {
      // Mirrors are purged too, otherwise the next migration would copy the
      // backup copy of a deleted record straight back in.
      for (const store of [adapter, ...mirrors]) {
        for (const key of await store.keys()) if (key.startsWith(KEY_PREFIX)) await store.remove(key);
      }
    },
    async clearHistory() {
      for (const store of [adapter, ...mirrors]) {
        for (const key of await store.keys()) if (isHistoryKey(key)) await store.remove(key);
      }
    },
  };
}
