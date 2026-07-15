import { describe, expect, it } from "vitest";
import {
  reviewItemSchema,
  reviewSchema,
  sanitizeShortTranslation,
  shortTranslationSchema,
} from "../src/llm/schemas.js";
import { frequencyInstruction, LEVEL_FREQ_CAP } from "../src/llm/articleGeneration.js";

function validItem(overrides: Record<string, unknown> = {}) {
  return {
    surface: "perfila",
    lemma: "perfilarse",
    pos: "verb",
    gender: null,
    translation: "вырисовываться",
    note: null,
    contextTranslation: "Проект вырисовывается как лидер.",
    freqBand: "top5000",
    distractors: ["quedarse", "ponerse", "irse"],
    ...overrides,
  };
}

describe("review schema: translation must be a plain short translation", () => {
  it("accepts a short clean translation", () => {
    expect(reviewItemSchema.safeParse(validItem()).success).toBe(true);
  });

  it("heals a translation with parentheses (the old dumping-ground format) instead of failing the batch", () => {
    const result = reviewItemSchema.safeParse(
      validItem({ translation: "ранний, досрочный (acceso anticipado — ранний доступ)" }),
    );
    expect(result.success).toBe(true);
    expect(result.success && result.data.translation).toBe("ранний, досрочный");
  });

  it("heals a translation with an em dash down to the part before it", () => {
    const result = shortTranslationSchema.safeParse("ранний — досрочный");
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe("ранний");
  });

  it("keeps the words after a leading dash rather than collapsing to empty", () => {
    expect(sanitizeShortTranslation("— досрочный")).toBe("досрочный");
  });

  it("still rejects a translation that is empty once the leaked parts are stripped", () => {
    expect(shortTranslationSchema.safeParse("(solo la explicación)").success).toBe(false);
  });

  it("truncates an over-long translation to whole words within the cap", () => {
    const parsed = shortTranslationSchema.safeParse("очень ".repeat(11) + "длинно");
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.length).toBeLessThanOrEqual(60);
    expect(parsed.success && parsed.data.endsWith("очень")).toBe(true);
  });

  it("requires exactly 3 distractors", () => {
    expect(reviewItemSchema.safeParse(validItem({ distractors: ["uno", "dos"] })).success).toBe(false);
    expect(reviewItemSchema.safeParse(validItem({ distractors: ["uno", "dos", "tres", "cuatro"] })).success).toBe(false);
  });

  it("normalizes omitted gender/note/contextTranslation to null", () => {
    const item = validItem();
    delete (item as Record<string, unknown>).gender;
    delete (item as Record<string, unknown>).note;
    delete (item as Record<string, unknown>).contextTranslation;
    const parsed = reviewSchema.parse({ items: [item] });
    expect(parsed.items[0]).toMatchObject({ gender: null, note: null, contextTranslation: null });
  });
});

describe("article generation frequency frame", () => {
  it("uses the agreed cap per CEFR level", () => {
    expect(LEVEL_FREQ_CAP).toEqual({ A2: 1500, B1: 2500, B2: 3500, C1: 5000 });
  });

  it.each([
    ["A2", 1500],
    ["B1", 2500],
    ["B2", 3500],
    ["C1", 5000],
  ] as const)("frames %s articles within the ~%i most frequent words", (level, cap) => {
    const instruction = frequencyInstruction(level);
    expect(instruction).toContain(`~${cap} palabras más frecuentes`);
    expect(instruction).toContain("sinónimo");
    // Woven bank lemmas and proper nouns are exempt from the frame.
    expect(instruction).toContain("nombres propios");
  });
});
