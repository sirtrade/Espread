import { describe, expect, it } from "vitest";
import {
  buildCard,
  buildCloze,
  buildClozeCard,
  buildOptions,
  buildQueueCard,
  containsLeakTerm,
  FALLBACK_SAMPLE_SIZE,
  isPhraseText,
  parseStoredDistractors,
  protectCrossCardLeaks,
  sampleFallbackDistractors,
  shufflePracticeCandidates,
  type CardSource,
  type QueueItemSource,
} from "../src/domain/practice.js";
import { TYPED_QUIZ_MIN_STAGE } from "../src/domain/typedQuiz.js";

/** Deterministic PRNG so shuffles are reproducible in assertions. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

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

describe("fallback distractor sampling", () => {
  it("selects a deterministic subset with injected randomness and varies by seed", () => {
    const first = sampleFallbackDistractors("noun", seeded(1));
    const repeated = sampleFallbackDistractors("noun", seeded(1));
    const second = sampleFallbackDistractors("noun", seeded(2));

    expect(first).toHaveLength(FALLBACK_SAMPLE_SIZE);
    expect(first).toEqual(repeated);
    expect(first).not.toEqual(second);
  });
});

describe("interleaving and cross-card anti-leak", () => {
  it("shuffles candidates deterministically with injected randomness", () => {
    expect(shufflePracticeCandidates([1, 2, 3, 4, 5], seeded(7))).toEqual(
      shufflePracticeCandidates([1, 2, 3, 4, 5], seeded(7)),
    );
    expect(shufflePracticeCandidates([1, 2, 3, 4, 5], () => 0)).toEqual([2, 3, 4, 5, 1]);
  });

  it("matches accents, case and multi-word phrases only at word boundaries", () => {
    expect(containsLeakTerm("La CANCIÓN terminó.", "cancion")).toBe(true);
    expect(containsLeakTerm("Se dio   cuenta ayer.", "dió cuenta")).toBe(true);
    expect(containsLeakTerm("La casación terminó.", "casa")).toBe(false);
    expect(containsLeakTerm("casablanca", "casa")).toBe(false);
  });

  it("sanitizes leaking contexts on both cards", () => {
    const cards = protectCrossCardLeaks(
      [
        {
          prompt: "first prompt",
          context: "Aquí aparece ÁRBOL.",
          contextHint: "También árbol.",
          leakAnswers: ["casa"],
        },
        {
          prompt: "second prompt",
          context: "La casa queda lejos.",
          contextHint: null,
          leakAnswers: ["árbol"],
        },
      ],
      2,
    );
    expect(cards).toHaveLength(2);
    expect(cards[0]!.context).toBeNull();
    expect(cards[0]!.contextHint).toBeNull();
    expect(cards[1]!.context).toBeNull();
  });

  it("drops prompt conflicts and refills from later candidates", () => {
    const cards = protectCrossCardLeaks(
      [
        { prompt: "translation one", context: null, contextHint: null, leakAnswers: ["casa"] },
        { prompt: "Una CASA bonita", context: null, contextHint: null, leakAnswers: ["árbol"] },
        { prompt: "translation three", context: null, contextHint: null, leakAnswers: ["puerta"] },
      ],
      2,
    );
    expect(cards.map((card) => card.leakAnswers[0])).toEqual(["casa", "puerta"]);
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

  it("uses stored distractors before bank and fallback candidates", () => {
    const stored = ["esfuerzo", "acuerdo", "recurso"];
    const card = buildCard(
      source({ firstContext: null, storedDistractors: stored, poolLemmas: ["propuesta", "amenaza"] }),
      "recall",
      seeded(4),
    )!;
    expect(card.options).toHaveLength(4);
    expect(card.options.filter((option) => option !== card.answer)).toEqual(expect.arrayContaining(stored));
  });

  it("fills after stored and bank candidates from a sampled POS fallback", () => {
    const card = buildCard(
      source({ firstContext: null, storedDistractors: ["guardado"], poolLemmas: ["candidato"] }),
      "recall",
      seeded(8),
    )!;
    expect(card.options).toHaveLength(4);
    expect(card.options).toContain("guardado");
    expect(card.options).toContain("candidato");
    expect(card.options.filter((option) => ![card.answer, "guardado", "candidato"].includes(option))).toHaveLength(1);
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

describe("buildQueueCard", () => {
  function source(overrides: Partial<QueueItemSource> = {}): QueueItemSource {
    return {
      lemma: "abarcar",
      isPhrase: false,
      translation: "охватывать",
      firstContext: "Los planes abarcan varios sectores.",
      surfaceForm: "abarcan",
      contextTranslation: "Планы охватывают несколько секторов.",
      pos: "verb",
      storedDistractors: ["quedarse", "ponerse", "irse"],
      poolLemmas: ["establecer", "generar"],
      srsStage: TYPED_QUIZ_MIN_STAGE,
      ...overrides,
    };
  }

  it("serves a typed card from TYPED_QUIZ_MIN_STAGE up (no options, answer graded server-side)", () => {
    const card = buildQueueCard(source(), "cloze", seeded(1))!;
    expect(card.type).toBe("typed");
    expect(card.prompt).toBe("охватывать");
    expect(card.answer).toBe("");
    expect(card.options).toEqual([]);
    // The blanked context sentence is a safe hint (the answer is masked).
    expect(card.contextHint).toBe("Los planes _____ varios sectores.");
    expect(card.contextHint!.toLowerCase()).not.toContain("abarcan");
  });

  it("keeps multiple choice below TYPED_QUIZ_MIN_STAGE (recognition for fresh words)", () => {
    const card = buildQueueCard(source({ srsStage: TYPED_QUIZ_MIN_STAGE - 1 }), "cloze", seeded(1))!;
    expect(card.type).toBe("cloze");
    expect(card.options).toHaveLength(4);
    expect(card.contextHint).toBeNull();
  });

  it("falls back to multiple choice at a high stage when no safe typed card exists", () => {
    // No translation -> buildTypedQuizCard returns null, so it degrades to MC.
    const card = buildQueueCard(source({ translation: null, srsStage: 5 }), "cloze", seeded(1))!;
    expect(card.type).toBe("cloze");
    expect(card.contextHint).toBeNull();
  });

  it("returns null at a high stage when neither a typed nor an MC card can be built", () => {
    const card = buildQueueCard(
      source({ translation: null, firstContext: null, surfaceForm: null, srsStage: 5 }),
      "cloze",
      seeded(1),
    );
    expect(card).toBeNull();
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
