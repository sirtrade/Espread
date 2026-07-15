import { describe, expect, it } from "vitest";
import {
  GRAMMAR_GAP,
  MAX_GRAMMAR_CANDIDATES_PER_REVIEW,
  normalizeCanonicalKey,
  parseGrammarCandidates,
} from "../src/domain/grammar.js";

const BODY =
  "Cuando tengamos tiempo, iremos al museo de la ciudad. " +
  "El proyecto va a crecer este año según sus responsables. " +
  "Se lo entregaron ayer sin explicaciones.";

function validCandidate(overrides: Record<string, unknown> = {}) {
  return {
    canonicalKey: "cuando+subjuntivo-presente",
    pattern: "cuando + presente de subjuntivo",
    category: "mood",
    explanation: "Después de «cuando» con valor de futuro se usa subjuntivo.",
    sourceForm: "Cuando tengamos",
    sourceSentence: "Cuando tengamos tiempo, iremos al museo de la ciudad.",
    sourceSentenceTranslation: "Когда у нас будет время, мы пойдём в городской музей.",
    exercise: {
      cloze: "Cuando ___ tiempo, iremos al museo de la ciudad.",
      acceptedAnswers: ["tengamos"],
      options: ["tenemos", "tendremos", "teníamos"],
    },
    ...overrides,
  };
}

describe("normalizeCanonicalKey", () => {
  it("lowercases, collapses whitespace and strips exotic characters", () => {
    expect(normalizeCanonicalKey("  Cuando + Subjuntivo   Presente!! ")).toBe("cuando-+-subjuntivo-presente");
    expect(normalizeCanonicalKey("ir a + infinitivo")).toBe("ir-a-+-infinitivo");
    expect(normalizeCanonicalKey("---se_lo+verbo---")).toBe("se_lo+verbo");
  });
});

describe("parseGrammarCandidates", () => {
  it("accepts a fully valid candidate and normalizes its key and gap", () => {
    const raw = validCandidate({
      canonicalKey: "Cuando + Subjuntivo Presente",
      exercise: {
        cloze: "Cuando ______ tiempo, iremos al museo de la ciudad.",
        acceptedAnswers: ["tengamos"],
        options: ["tenemos", "tendremos", "teníamos"],
      },
    });
    const [candidate] = parseGrammarCandidates([raw], BODY);
    expect(candidate).toBeDefined();
    expect(candidate!.canonicalKey).toBe("cuando-+-subjuntivo-presente");
    expect(candidate!.exercise.cloze).toContain(GRAMMAR_GAP);
    expect(candidate!.exercise.cloze).not.toContain("______");
  });

  it("drops malformed values without touching valid siblings", () => {
    const result = parseGrammarCandidates(
      [null, 42, "texto", { canonicalKey: "x" }, validCandidate()],
      BODY,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.canonicalKey).toBe("cuando+subjuntivo-presente");
  });

  it("rejects a single-word sourceForm (lexical territory)", () => {
    const raw = validCandidate({ sourceForm: "tengamos" });
    expect(parseGrammarCandidates([raw], BODY)).toHaveLength(0);
  });

  it("rejects a sourceForm that is not in the sourceSentence", () => {
    const raw = validCandidate({ sourceForm: "va a crecer" });
    expect(parseGrammarCandidates([raw], BODY)).toHaveLength(0);
  });

  it("rejects a sourceSentence that is not in the article", () => {
    const raw = validCandidate({
      sourceSentence: "Cuando tengamos dinero, iremos al teatro.",
      sourceForm: "Cuando tengamos",
    });
    expect(parseGrammarCandidates([raw], BODY)).toHaveLength(0);
  });

  it("rejects an exercise whose cloze leaks the answer", () => {
    const raw = validCandidate({
      exercise: {
        cloze: "Cuando ___ tiempo, tengamos calma en el museo de la ciudad.",
        acceptedAnswers: ["tengamos"],
        options: ["tenemos", "tendremos", "teníamos"],
      },
    });
    expect(parseGrammarCandidates([raw], BODY)).toHaveLength(0);
  });

  it("rejects an exercise without exactly one gap", () => {
    const noGap = validCandidate({
      exercise: {
        cloze: "Cuando tenga tiempo, iremos al museo de la ciudad.",
        acceptedAnswers: ["tengamos"],
        options: ["tenemos", "tendremos", "teníamos"],
      },
    });
    const twoGaps = validCandidate({
      exercise: {
        cloze: "Cuando ___ tiempo, ___ al museo de la ciudad.",
        acceptedAnswers: ["tengamos"],
        options: ["tenemos", "tendremos", "teníamos"],
      },
    });
    expect(parseGrammarCandidates([noGap, twoGaps], BODY)).toHaveLength(0);
  });

  it("rejects a primary accepted answer that is not in the source sentence", () => {
    const raw = validCandidate({
      exercise: {
        cloze: "Cuando ___ tiempo, iremos al museo de la ciudad.",
        acceptedAnswers: ["tuviéramos"],
        options: ["tenemos", "tendremos", "teníamos"],
      },
    });
    expect(parseGrammarCandidates([raw], BODY)).toHaveLength(0);
  });

  it("deduplicates options against accepted answers and requires 3 survivors", () => {
    const raw = validCandidate({
      exercise: {
        cloze: "Cuando ___ tiempo, iremos al museo de la ciudad.",
        acceptedAnswers: ["tengamos"],
        // "Tengamos" duplicates the answer, "tenemos" duplicates itself.
        options: ["Tengamos", "tenemos", "tenemos", "tendremos"],
      },
    });
    expect(parseGrammarCandidates([raw], BODY)).toHaveLength(0);

    const enough = validCandidate({
      exercise: {
        cloze: "Cuando ___ tiempo, iremos al museo de la ciudad.",
        acceptedAnswers: ["tengamos"],
        options: ["Tengamos", "tenemos", "tendremos", "teníamos"],
      },
    });
    const [candidate] = parseGrammarCandidates([enough], BODY);
    expect(candidate!.exercise.options).toEqual(["tenemos", "tendremos", "teníamos"]);
  });

  it("collapses duplicate canonical keys to the first candidate", () => {
    const first = validCandidate();
    const duplicate = validCandidate({ canonicalKey: "CUANDO+subjuntivo-presente", pattern: "otro patrón" });
    const result = parseGrammarCandidates([first, duplicate], BODY);
    expect(result).toHaveLength(1);
    expect(result[0]!.pattern).toBe("cuando + presente de subjuntivo");
  });

  it("caps the accepted candidates per review", () => {
    const many = Array.from({ length: MAX_GRAMMAR_CANDIDATES_PER_REVIEW + 3 }, (_, index) =>
      validCandidate({ canonicalKey: `patron-numero-${index}` }),
    );
    expect(parseGrammarCandidates(many, BODY)).toHaveLength(MAX_GRAMMAR_CANDIDATES_PER_REVIEW);
  });
});
