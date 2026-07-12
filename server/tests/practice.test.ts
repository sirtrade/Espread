import { describe, expect, it } from "vitest";
import {
  buildCard,
  buildCloze,
  buildClozeCard,
  buildOptions,
  isPhraseText,
  nextPracticeState,
  nextStreakState,
  parseStoredDistractors,
  PRACTICE_INTERVALS_DAYS,
  type CardSource,
} from "../src/domain/practice.js";

const DAY = 24 * 60 * 60 * 1000;

/** Deterministic PRNG so shuffles are reproducible in assertions. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

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

describe("nextStreakState", () => {
  // A fixed day used as the "today" for the anti-farm cap.
  const day1 = Date.UTC(2026, 0, 10, 9, 0, 0);
  const day1Later = Date.UTC(2026, 0, 10, 20, 0, 0);
  const day2 = Date.UTC(2026, 0, 11, 9, 0, 0);

  it("credits a clean encounter on a first-try-correct answer", () => {
    const r = nextStreakState({ cleanStreak: 0, status: "active", lastStreakCreditAt: null }, true, day1);
    expect(r).toMatchObject({ cleanStreak: 1, streakCredited: true, becameLearned: false });
    expect(r.lastStreakCreditAt).toBe(day1);
  });

  it("promotes to learned on the 3rd credited answer", () => {
    const r = nextStreakState({ cleanStreak: 2, status: "active", lastStreakCreditAt: null }, true, day1);
    expect(r).toMatchObject({ cleanStreak: 3, status: "learned", streakCredited: true, becameLearned: true });
  });

  it("resets the streak on a wrong answer without touching the daily cap", () => {
    const r = nextStreakState({ cleanStreak: 2, status: "active", lastStreakCreditAt: day1 }, false, day1Later);
    expect(r).toMatchObject({ cleanStreak: 0, streakCredited: false, becameLearned: false });
    // A wrong answer does not restamp the credit clock.
    expect(r.lastStreakCreditAt).toBe(day1);
  });

  it("does not credit a second correct answer the same day", () => {
    const r = nextStreakState({ cleanStreak: 1, status: "active", lastStreakCreditAt: day1 }, true, day1Later);
    expect(r).toMatchObject({ cleanStreak: 1, streakCredited: false, becameLearned: false });
    expect(r.lastStreakCreditAt).toBe(day1);
  });

  it("credits again on the next calendar day", () => {
    const r = nextStreakState({ cleanStreak: 1, status: "active", lastStreakCreditAt: day1 }, true, day2);
    expect(r).toMatchObject({ cleanStreak: 2, streakCredited: true });
    expect(r.lastStreakCreditAt).toBe(day2);
  });

  it("never re-credits an already-learned item", () => {
    const r = nextStreakState({ cleanStreak: 3, status: "learned", lastStreakCreditAt: null }, true, day1);
    expect(r).toMatchObject({ cleanStreak: 3, status: "learned", streakCredited: false, becameLearned: false });
  });
});

describe("buildOptions", () => {
  it("contains the correct answer exactly once among 4 distinct options", () => {
    const options = buildOptions("hallazgo", ["esfuerzo", "amenaza", "propuesta", "recurso"], 4, seeded(1));
    expect(options).toHaveLength(4);
    expect(options.filter((o) => o === "hallazgo")).toHaveLength(1);
    expect(new Set(options.map((o) => o.toLowerCase())).size).toBe(4);
  });

  it("returns only the correct term when the pool is empty (caller pads the pool)", () => {
    expect(buildOptions("hallazgo", [], 4, seeded(1))).toEqual(["hallazgo"]);
  });

  it("never duplicates the correct term from the pool", () => {
    const options = buildOptions("hallazgo", ["Hallazgo", "esfuerzo", "amenaza", "recurso"], 4, seeded(2));
    expect(options.filter((o) => o.toLowerCase() === "hallazgo")).toHaveLength(1);
  });

  it("caps the option count", () => {
    const options = buildOptions("uno", ["dos", "tres", "cuatro", "cinco", "seis"], 3, seeded(3));
    expect(options).toHaveLength(3);
    expect(options).toContain("uno");
  });
});

describe("buildCard", () => {
  function source(overrides: Partial<CardSource> = {}): CardSource {
    return {
      lemma: "hallazgo",
      isPhrase: false,
      translation: "discovery",
      firstContext: "Los científicos anunciaron un hallazgo relevante.",
      surfaceForm: "hallazgo",
      contextTranslation: "The scientists announced a relevant discovery.",
      pos: "noun",
      storedDistractors: ["esfuerzo", "acuerdo", "nivel"],
      poolLemmas: ["propuesta", "recurso"],
      ...overrides,
    };
  }

  it("builds a cloze card whose answer never appears in the prompt", () => {
    const card = buildCard(source(), "cloze", seeded(1))!;
    expect(card.type).toBe("cloze");
    expect(card.prompt).toContain("_____");
    expect(card.prompt.toLowerCase()).not.toContain(card.answer.toLowerCase());
    expect(card.options).toContain(card.answer);
  });

  it("builds a recall card whose answer never appears in the translation prompt", () => {
    const card = buildCard(source({ firstContext: null }), "recall", seeded(1))!;
    expect(card.type).toBe("recall");
    expect(card.prompt).toBe("discovery");
    expect(card.prompt.toLowerCase()).not.toContain(card.answer.toLowerCase());
  });

  it("degrades a leaking recall into a cloze", () => {
    // The translation echoes the Spanish lemma -> recall would leak the answer.
    const card = buildCard(source({ translation: "el hallazgo científico" }), "recall", seeded(1))!;
    expect(card.type).toBe("cloze");
    expect(card.prompt.toLowerCase()).not.toContain(card.answer.toLowerCase());
  });

  it("skips an item when the only possible card would leak the answer", () => {
    // No context (no cloze) and the translation echoes the lemma (recall leaks).
    const card = buildCard(source({ firstContext: null, translation: "hallazgo" }), "recall", seeded(1));
    expect(card).toBeNull();
  });

  it("keeps recall options single-word and same part of speech", () => {
    const card = buildCard(
      source({ firstContext: null, storedDistractors: ["esfuerzo", "acuerdo", "recurso"], poolLemmas: [] }),
      "recall",
      seeded(4),
    )!;
    expect(card.options.every((o) => !isPhraseText(o))).toBe(true);
  });

  it("offers only phrases for a phrase card, and never a single-word decoy", () => {
    const card = buildCard(
      source({
        lemma: "durante meses",
        isPhrase: true,
        pos: "phrase",
        translation: "for months",
        firstContext: "El equipo trabajó durante meses en el proyecto.",
        surfaceForm: "durante meses",
        storedDistractors: ["sin parar", "a menudo", "de repente"],
        poolLemmas: ["hallazgo", "recurso"],
      }),
      "cloze",
      seeded(5),
    )!;
    expect(card.options.every((o) => isPhraseText(o))).toBe(true);
    expect(card.options).toContain("durante meses");
  });

  it("skips a phrase card when there are too few phrase distractors", () => {
    const card = buildCard(
      source({
        lemma: "en resumen",
        isPhrase: true,
        pos: "phrase",
        translation: "in short",
        firstContext: "En resumen, el proyecto avanza.",
        surfaceForm: "En resumen",
        storedDistractors: ["ademas"], // single words only -> filtered out as non-phrases
        poolLemmas: ["hallazgo"],
      }),
      "cloze",
      seeded(6),
    );
    expect(card).toBeNull();
  });

  it("never leaks the answer across a batch of mixed sources", () => {
    const sources: CardSource[] = [
      source(),
      source({ firstContext: null }),
      source({ lemma: "casa", translation: "house", firstContext: "La casa es grande.", surfaceForm: "casa" }),
      source({
        lemma: "perfilarse",
        pos: "verb",
        translation: "to shape up",
        firstContext: "El proyecto se perfila como líder.",
        surfaceForm: "perfila",
        storedDistractors: ["quedarse", "ponerse", "irse"],
      }),
    ];
    for (const [i, src] of sources.entries()) {
      for (const prefer of ["cloze", "recall"] as const) {
        const card = buildCard(src, prefer, seeded(i + 1));
        if (!card) continue;
        expect(card.prompt.toLowerCase()).not.toContain(card.answer.toLowerCase());
      }
    }
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
