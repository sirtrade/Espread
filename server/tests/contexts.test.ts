import { describe, expect, it } from "vitest";
import {
  MAX_CONTEXTS,
  appendContext,
  parseContexts,
  pickContext,
  type BankContext,
} from "../src/domain/contexts.js";
import { buildCard, protectCrossCardLeaks, type CardSource } from "../src/domain/practice.js";

const legacy = {
  firstContext: "La casa es grande.",
  contextTranslation: "The house is big.",
  surfaceForm: "casa",
};

function context(n: number, sentence = `Contexto ${n} contiene casa.`): BankContext {
  return {
    sentence,
    translation: n % 2 ? null : `Translation ${n}`,
    surfaceForm: "casa",
    articleId: n,
    addedAt: n,
  };
}

function cardSource(selected: BankContext): CardSource {
  return {
    lemma: "casa",
    isPhrase: false,
    translation: "house",
    firstContext: selected.sentence,
    surfaceForm: selected.surfaceForm,
    contextTranslation: selected.translation,
    pos: "noun",
    storedDistractors: ["puerta", "mesa", "calle"],
    poolLemmas: [],
  };
}

describe("bank contexts", () => {
  it("falls back to legacy fields for bad, empty, or invalid JSON", () => {
    expect(parseContexts("{bad", legacy)).toEqual([
      {
        sentence: legacy.firstContext,
        translation: legacy.contextTranslation,
        surfaceForm: legacy.surfaceForm,
        articleId: null,
        addedAt: 0,
      },
    ]);
    expect(parseContexts("[]", legacy)).toHaveLength(1);
    expect(parseContexts('[{"sentence":42}]', legacy)).toHaveLength(1);
  });

  it("dedupes normalized sentences and caps the newest contexts", () => {
    const first = context(1, "  La CASA es grande. ");
    expect(appendContext([first], context(2, "la casa es grande"))).toEqual([first]);

    let contexts: BankContext[] = [];
    for (let i = 1; i <= MAX_CONTEXTS + 2; i++) contexts = appendContext(contexts, context(i));
    expect(contexts.map((item) => item.articleId)).toEqual([3, 4, 5, 6, 7]);
  });

  it("picks deterministically with injected randomness", () => {
    const contexts = [context(1), context(2), context(3)];
    expect(pickContext(contexts, () => 0)).toBe(contexts[0]);
    expect(pickContext(contexts, () => 0.99)).toBe(contexts[2]);
  });

  it("different seeds build different cloze prompts", () => {
    const contexts = [
      context(1, "La casa queda junto al río."),
      context(2, "Vendieron la casa durante el verano."),
    ];
    const first = buildCard(cardSource(pickContext(contexts, () => 0)!), "cloze", () => 0)!;
    const second = buildCard(cardSource(pickContext(contexts, () => 0.99)!), "cloze", () => 0)!;
    expect(first.prompt).not.toBe(second.prompt);
  });

  it("cross-card anti-leak checks the picked context", () => {
    const contexts = [
      context(1, "La casa queda lejos."),
      context(2, "La casa está junto al árbol."),
    ];
    const picked = pickContext(contexts, () => 0.99)!;
    const card = buildCard(cardSource(picked), "recall", () => 0)!;
    const protectedCards = protectCrossCardLeaks(
      [
        { ...card, contextHint: null, leakAnswers: ["casa"] },
        { prompt: "tree", context: null, contextHint: null, leakAnswers: ["árbol"] },
      ],
      2,
    );
    expect(protectedCards[0]!.context).toBeNull();
  });
});
