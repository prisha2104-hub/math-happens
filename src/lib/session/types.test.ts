import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, coerceSettings, validateSettings } from "./types";

describe("settings migration", () => {
  it("defaults existing saved configurations to open answers", () => {
    const phaseOne = {
      mode: "timed",
      durationMinutes: 4,
      questionLimit: null,
      difficulty: "hard",
      operations: ["division"],
      numberTypes: ["decimal"],
    };
    const coerced = coerceSettings(phaseOne);
    expect(coerced.answerFormat).toBe("open");
    expect(coerced).toMatchObject({ difficulty: "hard", operations: ["division"], numberTypes: ["decimal"] });
  });

  it("keeps a saved multiple-choice preference and rejects junk", () => {
    expect(coerceSettings({ ...DEFAULT_SETTINGS, answerFormat: "multiple-choice" }).answerFormat).toBe("multiple-choice");
    expect(coerceSettings({ ...DEFAULT_SETTINGS, answerFormat: "telepathy" }).answerFormat).toBe("open");
    expect(coerceSettings(null).answerFormat).toBe("open");
    expect(DEFAULT_SETTINGS.answerFormat).toBe("open");
  });

  it("validates independently of the answer format", () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, answerFormat: "multiple-choice" })).toEqual([]);
    expect(validateSettings({ ...DEFAULT_SETTINGS, answerFormat: "multiple-choice", operations: [] })).toHaveLength(1);
  });
});
