import { describe, expect, it } from "vitest";
import {
  buildCloze,
  buildClozeCard,
  buildOptions,
  nextPracticeState,
  parseStoredDistractors,
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

describe("buildClozeCard", () => {
  it("blanks the surface form when the lemma doesn't occur in the context", () => {
    const card = buildClozeCard("El proyecto se perfila como líder.", "perfilarse", "perfila");
    expect(card).toEqual({ prompt: "El proyecto se _____ como líder.", answer: "perfila" });
  });

  it("falls back to the lemma when there is no surface form", () => {
    const card = buildClozeCard("La casa es grande.", "casa", null);
    expect(card).toEqual({ prompt: "La _____ es grande.", answer: "casa" });
  });

  it("returns null when neither form occurs or there is no context", () => {
    expect(buildClozeCard("Una frase sin la palabra.", "perfilarse", "perfila")).toBeNull();
    expect(buildClozeCard(null, "casa", "casas")).toBeNull();
  });
});

describe("parseStoredDistractors", () => {
  it("parses a stored JSON array", () => {
    expect(parseStoredDistractors('["uno","dos","tres"]')).toEqual(["uno", "dos", "tres"]);
  });

  it("returns [] for null, malformed JSON, or non-array values", () => {
    expect(parseStoredDistractors(null)).toEqual([]);
    expect(parseStoredDistractors("not json")).toEqual([]);
    expect(parseStoredDistractors('{"a":1}')).toEqual([]);
  });
});
