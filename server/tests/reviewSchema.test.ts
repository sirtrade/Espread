import { describe, expect, it } from "vitest";
import { reviewItemSchema, reviewSchema, shortTranslationSchema } from "../src/llm/schemas.js";
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

  it("rejects a translation with parentheses (the old dumping-ground format)", () => {
    const result = reviewItemSchema.safeParse(
      validItem({ translation: "ранний, досрочный (acceso anticipado — ранний доступ)" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a translation with an em dash", () => {
    expect(shortTranslationSchema.safeParse("ранний — досрочный").success).toBe(false);
  });

  it("rejects a translation longer than 60 characters", () => {
    expect(shortTranslationSchema.safeParse("очень ".repeat(11) + "длинно").success).toBe(false);
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

describe("review schema: grammar (subjunctive) analysis", () => {
  it("defaults a missing grammar field to null (back-compat with archived reviews)", () => {
    const parsed = reviewSchema.parse({ items: [validItem()] });
    expect(parsed.items[0]!.grammar).toBeNull();
  });

  it("accepts a subjunctive grammar note", () => {
    const grammar = {
      label: "subjuntivo presente",
      explanation:
        "Se usa el subjuntivo tras «que» con un antecedente hipotético; el indicativo afirmaría que ya existen.",
    };
    const parsed = reviewSchema.parse({ items: [validItem({ grammar })] });
    expect(parsed.items[0]!.grammar).toEqual(grammar);
  });

  it("normalizes an explicit null grammar to null", () => {
    const parsed = reviewSchema.parse({ items: [validItem({ grammar: null })] });
    expect(parsed.items[0]!.grammar).toBeNull();
  });

  it("rejects a grammar note missing its label or explanation", () => {
    expect(reviewItemSchema.safeParse(validItem({ grammar: { label: "subjuntivo presente" } })).success).toBe(false);
    expect(reviewItemSchema.safeParse(validItem({ grammar: { explanation: "porque sí" } })).success).toBe(false);
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
