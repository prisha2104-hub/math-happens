import { describe, expect, it } from "vitest";
import type { PracticePlan } from "@/lib/adaptive/plan";
import { DEFAULT_SETTINGS, type SessionSummary, type TrainerSettings } from "@/lib/session/types";
import type { Attempt } from "@/lib/session/types";
import { makeAttempt, makeSummary } from "@/lib/testing/fixtures";
import {
  MAX_STORED_SESSIONS,
  SESSIONS_KEY,
  SETTINGS_KEY,
  attemptsKey,
  createRepositories,
} from "./repositories";
import {
  MemoryAdapter,
  type Schema,
  StorageWriteError,
  WebStorageAdapter,
  readVersioned,
  writeVersioned,
} from "./storage";

const numberSchema: Schema<{ value: number }> = {
  version: 2,
  parse: (data) => (typeof data === "object" && data !== null && typeof (data as { value: unknown }).value === "number" ? (data as { value: number }) : null),
  migrate: (data, from) => (from === 1 && typeof data === "number" ? { value: data } : null),
};

describe("versioned storage", () => {
  it("round-trips data inside a versioned envelope", async () => {
    const adapter = new MemoryAdapter();
    await writeVersioned(adapter, "k", numberSchema, { value: 7 }, 123);
    expect(JSON.parse((await adapter.read("k")) ?? "")).toEqual({ version: 2, savedAt: 123, data: { value: 7 } });
    expect(await readVersioned(adapter, "k", numberSchema)).toEqual({ value: 7 });
  });

  it("returns null for missing, corrupt or unrecognised records", async () => {
    const adapter = new MemoryAdapter();
    expect(await readVersioned(adapter, "missing", numberSchema)).toBeNull();
    await adapter.write("corrupt", "{not json");
    expect(await readVersioned(adapter, "corrupt", numberSchema)).toBeNull();
    await adapter.write("bare", JSON.stringify({ value: 1 }));
    expect(await readVersioned(adapter, "bare", numberSchema)).toBeNull();
    await adapter.write("bad-shape", JSON.stringify({ version: 2, savedAt: 0, data: { value: "nope" } }));
    expect(await readVersioned(adapter, "bad-shape", numberSchema)).toBeNull();
  });

  it("migrates older versions and refuses newer ones", async () => {
    const adapter = new MemoryAdapter();
    await adapter.write("old", JSON.stringify({ version: 1, savedAt: 0, data: 42 }));
    expect(await readVersioned(adapter, "old", numberSchema)).toEqual({ value: 42 });
    await adapter.write("unmigratable", JSON.stringify({ version: 0, savedAt: 0, data: "?" }));
    expect(await readVersioned(adapter, "unmigratable", numberSchema)).toBeNull();
    await adapter.write("future", JSON.stringify({ version: 3, savedAt: 0, data: { value: 1 } }));
    expect(await readVersioned(adapter, "future", numberSchema)).toBeNull();
  });

  it("wraps web storage and reports quota failures", async () => {
    const backing = new Map<string, string>();
    const fake: Storage = {
      get length() {
        return backing.size;
      },
      key: (i) => [...backing.keys()][i] ?? null,
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => {
        if (v.length > 50) throw new DOMException("quota", "QuotaExceededError");
        backing.set(k, v);
      },
      removeItem: (k) => void backing.delete(k),
      clear: () => backing.clear(),
    };
    const adapter = new WebStorageAdapter(fake);
    await adapter.write("a", "1");
    expect(await adapter.read("a")).toBe("1");
    expect(await adapter.keys()).toEqual(["a"]);
    await expect(adapter.write("big", "x".repeat(100))).rejects.toBeInstanceOf(StorageWriteError);
    await adapter.remove("a");
    expect(await adapter.read("a")).toBeNull();
  });
});

function summary(id: string, endedAt: number): SessionSummary {
  return makeSummary({ id, endedAt });
}

function attempt(sessionId: string, n: number): Attempt {
  return makeAttempt({ id: `${sessionId}:a${n}`, sessionId, questionId: `${sessionId}:q${n}`, submittedAt: 1 });
}

describe("repositories", () => {
  it("stores and reloads settings, coercing invalid fields", async () => {
    const adapter = new MemoryAdapter();
    const repos = createRepositories(adapter);
    expect(await repos.settings.load()).toBeNull();
    const settings: TrainerSettings = { ...DEFAULT_SETTINGS, mode: "untimed", questionLimit: 20, numberTypes: ["fraction"] };
    await repos.settings.save(settings);
    expect(await repos.settings.load()).toEqual(settings);

    await adapter.write(
      SETTINGS_KEY,
      JSON.stringify({ version: 1, savedAt: 0, data: { mode: "weird", durationMinutes: 99, operations: ["addition", "nonsense"], numberTypes: [] } }),
    );
    expect(await repos.settings.load()).toEqual({
      ...DEFAULT_SETTINGS,
      mode: "timed",
      durationMinutes: 10,
      operations: ["addition"],
      numberTypes: ["integer"],
    });
  });

  it("saves a completed session with its attempts and lists them back", async () => {
    const adapter = new MemoryAdapter();
    const repos = createRepositories(adapter);
    const attempts = [attempt("s1", 1), attempt("s1", 2)];
    await repos.saveCompletedSession(summary("s1", 1000), attempts);
    expect(await repos.sessions.list()).toEqual([summary("s1", 1000)]);
    expect(await repos.attempts.listBySession("s1")).toEqual(attempts);
    expect(await repos.attempts.listBySession("nope")).toEqual([]);
    expect(JSON.parse((await adapter.read(SESSIONS_KEY)) ?? "").version).toBe(1);
    expect(JSON.parse((await adapter.read(attemptsKey("s1"))) ?? "").version).toBe(1);
  });

  it("keeps sessions in order, replaces duplicates and prunes the oldest", async () => {
    const adapter = new MemoryAdapter();
    // The limit is injected so this writes 25 records rather than 505; the
    // default is asserted separately.
    const LIMIT = 20;
    expect(MAX_STORED_SESSIONS).toBe(500);
    const repos = createRepositories(adapter, { maxSessions: LIMIT });
    for (let i = 0; i < LIMIT + 5; i += 1) {
      await repos.saveCompletedSession(summary(`s${i}`, i), [attempt(`s${i}`, 1)]);
    }
    const sessions = await repos.sessions.list();
    expect(sessions).toHaveLength(LIMIT);
    expect(sessions[0]?.id).toBe("s5");
    expect(sessions[sessions.length - 1]?.id).toBe(`s${LIMIT + 4}`);
    expect(await repos.attempts.listBySession("s0")).toEqual([]);
    expect(await adapter.read(attemptsKey("s4"))).toBeNull();
    expect(await repos.attempts.listBySession("s5")).toHaveLength(1);

    await repos.saveCompletedSession(summary("s5", 999_999), []);
    const after = await repos.sessions.list();
    expect(after.filter((s) => s.id === "s5")).toHaveLength(1);
    expect(after[after.length - 1]?.id).toBe("s5");
  });

  it("keeps an Improve session's plan so it is not read back as ordinary practice", async () => {
    const adapter = new MemoryAdapter();
    const repos = createRepositories(adapter);
    const plan: PracticePlan = {
      targets: [{ target: { numberType: "integer", operation: "division", difficulty: "hard" }, weight: 1, reason: "weak-accuracy", label: "Two-digit divisors" }],
      createdAt: 7,
      summary: "focused practice",
      coldStart: false,
    };
    const adaptive = makeSummary({ id: "improve", endedAt: 10, settings: { ...DEFAULT_SETTINGS, plan } });
    await repos.saveCompletedSession(adaptive, []);
    const [stored] = await repos.sessions.list();
    expect(stored?.settings.plan?.targets).toHaveLength(1);
    expect(stored?.settings.plan?.summary).toBe("focused practice");
  });

  it("ignores malformed session and attempt records", async () => {
    const adapter = new MemoryAdapter();
    const repos = createRepositories(adapter);
    await adapter.write(SESSIONS_KEY, JSON.stringify({ version: 1, savedAt: 0, data: [{ id: "ok", endedAt: 1 }, { nope: true }, 3] }));
    expect((await repos.sessions.list()).map((s) => s.id)).toEqual(["ok"]);
    await adapter.write(attemptsKey("ok"), JSON.stringify({ version: 1, savedAt: 0, data: "not an array" }));
    expect(await repos.attempts.listBySession("ok")).toEqual([]);
  });
});

describe("Phase 1 records", () => {
  it("normalises attempts and sessions saved before answer formats existed", async () => {
    const adapter = new MemoryAdapter();
    const repos = createRepositories(adapter);
    const legacyAttempt = { ...makeAttempt({ id: "old:a1", sessionId: "old", questionId: "old:q1" }) } as Record<string, unknown>;
    delete legacyAttempt.answerFormat;
    delete legacyAttempt.choice;
    delete legacyAttempt.errorTag;
    const legacySummary = { ...makeSummary({ id: "old", endedAt: 5 }) } as Record<string, unknown>;
    legacySummary.settings = { mode: "timed", durationMinutes: 4, questionLimit: null, difficulty: "medium", operations: ["addition"], numberTypes: ["integer"] };
    await adapter.write(attemptsKey("old"), JSON.stringify({ version: 1, savedAt: 0, data: [legacyAttempt] }));
    await adapter.write(SESSIONS_KEY, JSON.stringify({ version: 1, savedAt: 0, data: [legacySummary] }));

    const [attempt] = await repos.attempts.listBySession("old");
    expect(attempt).toMatchObject({ id: "old:a1", answerFormat: "open", choice: null, errorTag: null });
    const [session] = await repos.sessions.list();
    expect(session?.settings.answerFormat).toBe("open");
    expect(session?.settings.operations).toEqual(["addition"]);
  });
});
