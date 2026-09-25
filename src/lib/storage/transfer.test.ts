import { describe, expect, it } from "vitest";
import { makeAttempt, makeSummary } from "@/lib/testing/fixtures";
import { DEFAULT_SETTINGS } from "@/lib/session/types";
import { DeferredAdapter, MIGRATION_MARKER_KEY, copyRecords, migrateFromWebStorage } from "./indexeddb";
import { KEY_PREFIX, REVIEW_KEY, SESSIONS_KEY, attemptsKey, createRepositories } from "./repositories";
import { MemoryAdapter } from "./storage";
import { EXPORT_FORMAT, EXPORT_VERSION, applyImport, buildExport, exportFileName, mergeReviewStates, parseExport } from "./transfer";

function reviewItem(skillId: string, lastOutcomeAt: number, stage = 1) {
  return {
    skillId,
    numberType: "integer" as const,
    operation: "division" as const,
    difficulty: "medium" as const,
    facet: "2digit-divisor",
    stage,
    dueAt: lastOutcomeAt + 1000,
    lapses: 1,
    streak: 0,
    history: [false],
    lastOutcomeAt,
    lastLapseAt: lastOutcomeAt,
    createdAt: lastOutcomeAt,
  };
}

async function seeded() {
  const adapter = new MemoryAdapter();
  const repos = createRepositories(adapter);
  await repos.settings.save({ ...DEFAULT_SETTINGS, answerFormat: "multiple-choice" });
  await repos.saveCompletedSession(makeSummary({ id: "s1", endedAt: 1000 }), [makeAttempt({ id: "s1:a1", sessionId: "s1", submittedAt: 900 })]);
  await repos.saveCompletedSession(makeSummary({ id: "s2", endedAt: 2000 }), [
    makeAttempt({ id: "s2:a1", sessionId: "s2", submittedAt: 1900, correct: false, errorTag: "missed-carry" }),
    makeAttempt({ id: "s2:a2", sessionId: "s2", submittedAt: 1950, answerFormat: "multiple-choice" }),
  ]);
  await repos.review.save({ items: { k1: reviewItem("k1", 1950) }, updatedAt: 1950 });
  return { adapter, repos };
}

describe("storage migration", () => {
  it("copies prefixed records once, leaving the source intact", async () => {
    const web = new MemoryAdapter();
    const idb = new MemoryAdapter();
    await web.write(`${KEY_PREFIX}:settings`, "S");
    await web.write(`${KEY_PREFIX}:sessions`, "L");
    await web.write("unrelated", "X");
    await idb.write(`${KEY_PREFIX}:sessions`, "already-there");

    const copied = await migrateFromWebStorage(web, idb, KEY_PREFIX, 123);
    expect(copied).toBe(1);
    expect(await idb.read(`${KEY_PREFIX}:settings`)).toBe("S");
    expect(await idb.read(`${KEY_PREFIX}:sessions`)).toBe("already-there");
    expect(await idb.read("unrelated")).toBeNull();
    expect(await web.read(`${KEY_PREFIX}:settings`)).toBe("S");
    expect(JSON.parse((await idb.read(MIGRATION_MARKER_KEY)) ?? "")).toEqual({ at: 123, copied: 1 });

    await web.write(`${KEY_PREFIX}:later`, "new");
    expect(await migrateFromWebStorage(web, idb, KEY_PREFIX)).toBe(0);
    expect(await idb.read(`${KEY_PREFIX}:later`)).toBeNull();
    expect(await copyRecords(web, idb, KEY_PREFIX)).toBe(1);
  });

  it("defers to whichever adapter resolves and reports its name", async () => {
    const memory = new MemoryAdapter();
    const deferred = new DeferredAdapter(async () => ({ adapter: memory, name: "memory" }));
    await deferred.write("k", "v");
    expect(await deferred.read("k")).toBe("v");
    expect(await deferred.keys()).toEqual(["k"]);
    expect(await deferred.name()).toBe("memory");
    await deferred.remove("k");
    expect(await memory.read("k")).toBeNull();
  });
});

describe("repositories: aggregate views", () => {
  it("lists every attempt oldest first and counts records", async () => {
    const { repos } = await seeded();
    const all = await repos.attempts.listAll();
    expect(all.map((a) => a.id)).toEqual(["s1:a1", "s2:a1", "s2:a2"]);
    expect(await repos.counts()).toEqual({ sessions: 2, attempts: 3, reviewItems: 1 });
  });

  it("loads an empty review state when nothing is stored", async () => {
    const repos = createRepositories(new MemoryAdapter());
    expect(await repos.review.load()).toEqual({ items: {}, updatedAt: 0 });
  });

  it("clears only its own keys", async () => {
    const { adapter, repos } = await seeded();
    await adapter.write("someone-else", "1");
    await repos.clearAll();
    expect(await adapter.keys()).toEqual(["someone-else"]);
    expect(await repos.sessions.list()).toEqual([]);
  });
});

describe("export / import", () => {
  it("round-trips everything through a versioned JSON file", async () => {
    const { repos } = await seeded();
    const file = await buildExport(repos, 5000);
    expect(file).toMatchObject({ format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: 5000 });
    const text = JSON.stringify(file);

    const parsed = parseExport(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.preview).toEqual({ sessions: 2, attempts: 3, reviewItems: 1, exportedAt: 5000, hasSettings: true });

    const target = createRepositories(new MemoryAdapter());
    const result = await applyImport(target, parsed.file, "merge");
    expect(result).toEqual({ sessionsAdded: 2, attemptsAdded: 3, reviewItemsMerged: 1 });
    expect((await target.sessions.list()).map((s) => s.id)).toEqual(["s1", "s2"]);
    expect((await target.attempts.listBySession("s2")).map((a) => [a.errorTag, a.answerFormat])).toEqual([
      ["missed-carry", "open"],
      [null, "multiple-choice"],
    ]);
    expect((await target.settings.load())?.answerFormat).toBe("multiple-choice");
    expect(Object.keys((await target.review.load()).items)).toEqual(["k1"]);
  });

  it("merge adds only unknown sessions and keeps current settings", async () => {
    const { repos } = await seeded();
    const file = await buildExport(repos);
    file.sessions.push(makeSummary({ id: "s3", endedAt: 3000 }));
    file.attempts.s3 = [makeAttempt({ id: "s3:a1", sessionId: "s3", submittedAt: 2900 })];
    file.settings = { ...DEFAULT_SETTINGS, difficulty: "hard" };
    // Tamper with an existing session in the file: merge must not overwrite the stored one.
    file.sessions[0] = { ...file.sessions[0]!, attempted: 999 };

    const result = await applyImport(repos, file, "merge");
    expect(result.sessionsAdded).toBe(1);
    expect(result.attemptsAdded).toBe(1);
    const sessions = await repos.sessions.list();
    expect(sessions.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(sessions[0]?.attempted).toBe(1);
    expect((await repos.settings.load())?.difficulty).toBe("medium");
    expect((await repos.settings.load())?.answerFormat).toBe("multiple-choice");
  });

  it("replace wipes the store first and installs the file's contents", async () => {
    const { repos } = await seeded();
    const file = await buildExport(createRepositories(new MemoryAdapter()));
    file.sessions = [makeSummary({ id: "only", endedAt: 10 })];
    file.attempts = { only: [makeAttempt({ id: "only:a1", sessionId: "only" })] };
    file.settings = { ...DEFAULT_SETTINGS, difficulty: "easy" };
    file.review = { items: { z: reviewItem("z", 5) }, updatedAt: 5 };
    const result = await applyImport(repos, file, "replace");
    expect(result).toEqual({ sessionsAdded: 1, attemptsAdded: 1, reviewItemsMerged: 1 });
    expect((await repos.sessions.list()).map((s) => s.id)).toEqual(["only"]);
    expect(await repos.attempts.listBySession("s1")).toEqual([]);
    expect((await repos.settings.load())?.difficulty).toBe("easy");
    expect(Object.keys((await repos.review.load()).items)).toEqual(["z"]);
  });

  it("merges review state by recency", () => {
    const merged = mergeReviewStates(
      { items: { a: reviewItem("a", 100, 1), b: reviewItem("b", 500, 3) }, updatedAt: 500 },
      { items: { a: reviewItem("a", 200, 2), c: reviewItem("c", 50) }, updatedAt: 200 },
    );
    expect(merged.items.a?.stage).toBe(2);
    expect(merged.items.b?.stage).toBe(3);
    expect(merged.items.c).toBeDefined();
    expect(merged.updatedAt).toBe(500);
    expect(mergeReviewStates({ items: {}, updatedAt: 1 }, null)).toEqual({ items: {}, updatedAt: 1 });
  });

  it("rejects malformed files with readable errors", () => {
    expect(parseExport("{nope")).toEqual({ ok: false, error: "That file is not valid JSON." });
    expect(parseExport(JSON.stringify({ hello: 1 }))).toMatchObject({ ok: false, error: expect.stringMatching(/not exported/) });
    expect(parseExport(JSON.stringify({ format: EXPORT_FORMAT, version: 99, sessions: [], attempts: {} }))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/newer/),
    });
    expect(parseExport(JSON.stringify({ format: EXPORT_FORMAT, version: 1, sessions: "x", attempts: {} }))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/missing/),
    });
  });

  it("drops malformed records but keeps the rest", () => {
    const parsed = parseExport(
      JSON.stringify({
        format: EXPORT_FORMAT,
        version: 1,
        exportedAt: 1,
        sessions: [makeSummary({ id: "ok", endedAt: 1 }), { junk: true }, 5],
        attempts: { ok: [makeAttempt({ id: "ok:a1", sessionId: "ok" }), { junk: true }], orphan: [makeAttempt()] },
        review: { items: { good: reviewItem("good", 1), bad: { nope: 1 } }, updatedAt: 1 },
        settings: { difficulty: "hard" },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.preview).toMatchObject({ sessions: 1, attempts: 1, reviewItems: 1, hasSettings: true });
    expect(parsed.file.attempts.orphan).toBeUndefined();
    expect(parsed.file.settings?.difficulty).toBe("hard");
    expect(parsed.file.settings?.answerFormat).toBe("open");
  });

  it("names export files by timestamp", () => {
    expect(exportFileName(new Date("2026-09-24T21:05:09Z"))).toBe("math-happens-2026-09-24-21-05-09.json");
  });

  it("stores review state and sessions under the expected keys", async () => {
    const { adapter } = await seeded();
    const keys = await adapter.keys();
    expect(keys).toContain(REVIEW_KEY);
    expect(keys).toContain(SESSIONS_KEY);
    expect(keys).toContain(attemptsKey("s1"));
  });
});
