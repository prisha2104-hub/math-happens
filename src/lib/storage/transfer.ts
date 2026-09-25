import { EMPTY_REVIEW_STATE, type ReviewState } from "@/lib/review/types";
import { type Attempt, type SessionSummary, type TrainerSettings, coerceSettings } from "@/lib/session/types";
import { type Repositories, normalizeAttempt, normalizeReviewState, normalizeSummary } from "./repositories";

export const EXPORT_FORMAT = "math-happens-export";
export const EXPORT_VERSION = 1;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: number;
  settings: TrainerSettings | null;
  sessions: SessionSummary[];
  /** Attempts keyed by session id. */
  attempts: Record<string, Attempt[]>;
  review: ReviewState | null;
}

export interface ImportPreview {
  sessions: number;
  attempts: number;
  reviewItems: number;
  exportedAt: number;
  hasSettings: boolean;
}

export type ParseResult = { ok: true; file: ExportFile; preview: ImportPreview } | { ok: false; error: string };

export async function buildExport(repos: Repositories, now = Date.now()): Promise<ExportFile> {
  const sessions = await repos.sessions.list();
  const attempts: Record<string, Attempt[]> = {};
  for (const session of sessions) attempts[session.id] = await repos.attempts.listBySession(session.id);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now,
    settings: await repos.settings.load(),
    sessions,
    attempts,
    review: await repos.review.load(),
  };
}

export function exportFileName(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `math-happens-${stamp}.json`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/**
 * Validate an export file. Anything structurally off is rejected with a
 * readable message; individual malformed records are dropped, and their
 * counts are visible in the preview so the user can judge before importing.
 */
export function parseExport(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!isRecord(raw) || raw.format !== EXPORT_FORMAT) {
    return { ok: false, error: "That file was not exported by Math Happens." };
  }
  if (typeof raw.version !== "number" || raw.version > EXPORT_VERSION) {
    return { ok: false, error: `This export uses format version ${String(raw.version)}, newer than this app understands.` };
  }
  if (!Array.isArray(raw.sessions) || !isRecord(raw.attempts)) {
    return { ok: false, error: "The export is missing its sessions or attempts." };
  }

  const sessions = raw.sessions.map(normalizeSummary).filter((s): s is SessionSummary => s !== null);
  const sessionIds = new Set(sessions.map((s) => s.id));
  const attempts: Record<string, Attempt[]> = {};
  let attemptCount = 0;
  for (const [sessionId, list] of Object.entries(raw.attempts)) {
    if (!sessionIds.has(sessionId) || !Array.isArray(list)) continue;
    const normalized = list.map(normalizeAttempt).filter((a): a is Attempt => a !== null);
    attempts[sessionId] = normalized;
    attemptCount += normalized.length;
  }
  const review = raw.review == null ? null : normalizeReviewState(raw.review);
  const settings = raw.settings == null ? null : coerceSettings(raw.settings);

  const file: ExportFile = {
    format: EXPORT_FORMAT,
    version: raw.version,
    exportedAt: typeof raw.exportedAt === "number" ? raw.exportedAt : 0,
    settings,
    sessions,
    attempts,
    review,
  };
  return {
    ok: true,
    file,
    preview: {
      sessions: sessions.length,
      attempts: attemptCount,
      reviewItems: review ? Object.keys(review.items).length : 0,
      exportedAt: file.exportedAt,
      hasSettings: settings !== null,
    },
  };
}

export type ImportMode = "merge" | "replace";

export interface ImportResult {
  sessionsAdded: number;
  attemptsAdded: number;
  reviewItemsMerged: number;
}

/** Keep the more recently reviewed record when both sides know a skill. */
export function mergeReviewStates(existing: ReviewState, incoming: ReviewState | null): ReviewState {
  if (!incoming) return existing;
  const items = { ...existing.items };
  for (const [key, item] of Object.entries(incoming.items)) {
    const current = items[key];
    if (!current || item.lastOutcomeAt > current.lastOutcomeAt) items[key] = item;
  }
  return { items, updatedAt: Math.max(existing.updatedAt, incoming.updatedAt) };
}

/**
 * Apply an import. "merge" only adds sessions the store does not already have
 * and never touches current settings; "replace" wipes everything first and
 * must only be called after the user has explicitly confirmed.
 */
export async function applyImport(repos: Repositories, file: ExportFile, mode: ImportMode): Promise<ImportResult> {
  if (mode === "replace") {
    await repos.clearAll();
    if (file.settings) await repos.settings.save(file.settings);
    await repos.putSessions(file.sessions, file.attempts);
    await repos.review.save(file.review ?? EMPTY_REVIEW_STATE);
    const attemptsAdded = Object.values(file.attempts).reduce((sum, list) => sum + list.length, 0);
    return { sessionsAdded: file.sessions.length, attemptsAdded, reviewItemsMerged: Object.keys(file.review?.items ?? {}).length };
  }

  const existingIds = new Set((await repos.sessions.list()).map((s) => s.id));
  const fresh = file.sessions.filter((s) => !existingIds.has(s.id));
  const freshAttempts: Record<string, Attempt[]> = {};
  let attemptsAdded = 0;
  for (const session of fresh) {
    const list = file.attempts[session.id] ?? [];
    freshAttempts[session.id] = list;
    attemptsAdded += list.length;
  }
  if (fresh.length > 0) await repos.putSessions(fresh, freshAttempts);
  if ((await repos.settings.load()) === null && file.settings) await repos.settings.save(file.settings);
  const mergedReview = mergeReviewStates(await repos.review.load(), file.review);
  await repos.review.save(mergedReview);
  return { sessionsAdded: fresh.length, attemptsAdded, reviewItemsMerged: Object.keys(file.review?.items ?? {}).length };
}
