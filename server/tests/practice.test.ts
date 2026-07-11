import { describe, expect, it } from "vitest";
import {
  buildCloze,
  buildOptions,
  nextPracticeState,
  PRACTICE_INTERVALS_DAYS,
} from "../src/domain/practice.js";

const DAY = 24 * 60 * 60 * 1000;

describe("nextPracticeState", () => {
  it("walks up the interval ladder on correct answers", () => {
    const now = 1_000_000;
    let stage = 0;
    for (const [i, days] of PRACTICE_INTERVALS_DAYS.entries()) {
      const next = nextPracticeState(stage, true, now);
      expect(next.practiceStage).toBe(i + 1);
      expect(next.nextPracticeAt).toBe(now + days * DAY);
      stage = next.practiceStage;
    }
  });

  it("caps the stage at the last interval", () => {
    const now = 0;
    const top = PRACTICE_INTERVALS_DAYS.length;
    const next = nextPracticeState(top, true, now);
    expect(next.practiceStage).toBe(top);
    expect(next.nextPracticeAt).toBe(PRACTICE_INTERVALS_DAYS[top - 1]! * DAY);
  });

  it("resets to stage 0 with a short retry on a wrong answer", () => {
    const now = 5_000_000;
    const next = nextPracticeState(3, false, now);
    expect(next.practiceStage).toBe(0);
    expect(next.nextPracticeAt).toBeGreaterThan(now);
    expect(next.nextPracticeAt).toBeLessThan(now + DAY);
  });
});

describe("buildOptions", () => {
  it("contains the correct answer exactly once among 4 distinct options", () => {
    const options = buildOptions("hallazgo", ["esfuerzo", "amenaza", "propuesta", "recurso"]);
    expect(options).toHaveLength(4);
    expect(options.filter((o) => o === "hallazgo")).toHaveLength(1);
    expect(new Set(options.map((o) => o.toLowerCase())).size).toBe(4);
  });

  it("pads with fallback distractors when the pool is small", () => {
    const options = buildOptions("hallazgo", []);
    expect(options).toHaveLength(4);
    expect(options).toContain("hallazgo");
  });

  it("never duplicates the correct term from the pool", () => {
    const options = buildOptions("hallazgo", ["Hallazgo", "esfuerzo", "amenaza", "recurso"]);
    expect(options.filter((o) => o.toLowerCase() === "hallazgo")).toHaveLength(1);
  });
});

describe("buildCloze", () => {
  it("blanks the term inside its context, case-insensitively", () => {
    expect(buildCloze("Los científicos anunciaron un hallazgo relevante.", "hallazgo")).toBe(
      "Los científicos anunciaron un _____ relevante.",
    );
    expect(buildCloze("Hallazgo importante en la región.", "hallazgo")).toBe("_____ importante en la región.");
  });

  it("returns null when the term is absent", () => {
    expect(buildCloze("Una frase sin la palabra.", "hallazgo")).toBeNull();
  });

  it("works for multi-word phrases", () => {
    expect(buildCloze("El equipo trabajó durante meses en el proyecto.", "durante meses")).toBe(
      "El equipo trabajó _____ en el proyecto.",
    );
  });
});
