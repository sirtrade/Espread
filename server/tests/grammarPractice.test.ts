import { describe, expect, it } from "vitest";
import { buildGrammarQueueCard, GRAMMAR_TYPED_MIN_STAGE } from "../src/domain/grammarPractice.js";

const EXERCISE = {
  cloze: "Cuando ___ tiempo, iremos al museo.",
  acceptedAnswers: ["tengamos"],
  options: ["tenemos", "tendremos", "teníamos"],
};

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    pattern: "cuando + presente de subjuntivo",
    category: "mood",
    explanation: "Futuro tras «cuando» pide subjuntivo.",
    exercise: JSON.stringify(EXERCISE),
    srsStage: 0,
    ...overrides,
  };
}

const fixedRandom = () => 0.42;

describe("buildGrammarQueueCard", () => {
  it("builds an MC cloze below the typed threshold", () => {
    const card = buildGrammarQueueCard(source({ srsStage: GRAMMAR_TYPED_MIN_STAGE - 1 }), fixedRandom);
    expect(card).toMatchObject({ grammarItemId: 7, type: "cloze", answer: "tengamos" });
    expect(card!.prompt).toContain("___");
    expect(card!.options).toHaveLength(4);
    expect(card!.options).toContain("tengamos");
    // Feedback sentence is the cloze with the answer restored.
    expect(card!.context).toBe("Cuando tengamos tiempo, iremos al museo.");
  });

  it("builds a typed card from the threshold up, withholding answers and options", () => {
    const card = buildGrammarQueueCard(source({ srsStage: GRAMMAR_TYPED_MIN_STAGE }), fixedRandom);
    expect(card).toMatchObject({ type: "typed", answer: "", context: null });
    expect(card!.options).toEqual([]);
    expect(card!.leakAnswers).toEqual(["tengamos"]);
  });

  it("nulls hint material that would leak an accepted answer", () => {
    const card = buildGrammarQueueCard(
      source({ explanation: "La forma tengamos expresa futuro tras cuando." }),
      fixedRandom,
    );
    expect(card!.explanation).toBeNull();
    expect(card!.pattern).toBe("cuando + presente de subjuntivo");
  });

  it("skips corrupt or unsafe exercises", () => {
    expect(buildGrammarQueueCard(source({ exercise: "{broken json" }), fixedRandom)).toBeNull();
    expect(
      buildGrammarQueueCard(
        source({ exercise: JSON.stringify({ ...EXERCISE, cloze: "Cuando tenga tiempo, iremos." }) }),
        fixedRandom,
      ),
    ).toBeNull();
    // The answer readable in the prompt is an immediate disqualifier.
    expect(
      buildGrammarQueueCard(
        source({
          exercise: JSON.stringify({ ...EXERCISE, cloze: "Cuando ___ tiempo, tengamos calma." }),
        }),
        fixedRandom,
      ),
    ).toBeNull();
  });

  it("requires 4 distinct MC options", () => {
    const card = buildGrammarQueueCard(
      source({ exercise: JSON.stringify({ ...EXERCISE, options: ["tenemos", "Tenemos", "teníamos"] }) }),
      fixedRandom,
    );
    expect(card).toBeNull();
  });
});
