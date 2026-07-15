import { describe, expect, it } from "vitest";
import { planGrammarSaves } from "../src/domain/grammarLifecycle.js";
import type { GrammarCandidate } from "../src/llm/schemas.js";

const NOW = Date.UTC(2026, 6, 15, 12);

function candidate(key: string, overrides: Partial<GrammarCandidate> = {}): GrammarCandidate {
  return {
    canonicalKey: key,
    pattern: "cuando + presente de subjuntivo",
    category: "mood",
    explanation: "Futuro tras «cuando» pide subjuntivo.",
    sourceForm: "Cuando tengamos",
    sourceSentence: "Cuando tengamos tiempo, iremos al museo.",
    sourceSentenceTranslation: "Когда будет время, пойдём в музей.",
    exercise: {
      cloze: "Cuando ___ tiempo, iremos al museo.",
      acceptedAnswers: ["tengamos"],
      options: ["tenemos", "tendremos", "teníamos"],
    },
    ...overrides,
  };
}

function existingItem(key: string, contexts: unknown[] = []) {
  return { id: 7, canonicalKey: key, contexts: JSON.stringify(contexts) };
}

describe("planGrammarSaves", () => {
  it("creates a new active unit at the bottom of the ladder while the pool has room", () => {
    const plan = planGrammarSaves({
      accepted: [candidate("cuando+subjuntivo")],
      existing: [],
      activeCount: 9,
      poolLimit: 10,
      articleId: 42,
      now: NOW,
    });
    expect(plan.contextUpdates).toEqual([]);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]).toMatchObject({
      canonicalKey: "cuando+subjuntivo",
      status: "active",
      srsStage: 0,
      nextDueAt: NOW,
      lastCreditAt: null,
    });
    const contexts = JSON.parse(plan.inserts[0]!.contexts) as unknown[];
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ articleId: 42, surfaceForm: "Cuando tengamos" });
  });

  it("queues new units beyond the pool limit, counting inserts of the same batch", () => {
    const plan = planGrammarSaves({
      accepted: [candidate("uno+dos"), candidate("tres+cuatro")],
      existing: [],
      activeCount: 9,
      poolLimit: 10,
      articleId: 1,
      now: NOW,
    });
    expect(plan.inserts.map((insert) => insert.status)).toEqual(["active", "queued"]);
  });

  it("treats poolLimit 0 as unlimited", () => {
    const plan = planGrammarSaves({
      accepted: [candidate("uno+dos"), candidate("tres+cuatro")],
      existing: [],
      activeCount: 999,
      poolLimit: 0,
      articleId: 1,
      now: NOW,
    });
    expect(plan.inserts.every((insert) => insert.status === "active")).toBe(true);
  });

  it("only adds a context for a repeat canonical key (no insert, no SRS fields)", () => {
    const stored = {
      sentence: "Una frase anterior con el patrón.",
      translation: null,
      surfaceForm: "cuando tengamos",
      articleId: 1,
      addedAt: NOW - 1000,
    };
    const plan = planGrammarSaves({
      accepted: [candidate("cuando+subjuntivo")],
      existing: [existingItem("cuando+subjuntivo", [stored])],
      activeCount: 0,
      poolLimit: 10,
      articleId: 42,
      now: NOW,
    });
    expect(plan.inserts).toEqual([]);
    expect(plan.contextUpdates).toHaveLength(1);
    const contexts = JSON.parse(plan.contextUpdates[0]!.contexts) as unknown[];
    expect(contexts).toHaveLength(2);
  });

  it("skips the update when the context is a duplicate sentence", () => {
    const stored = {
      sentence: "Cuando tengamos tiempo, iremos al museo.",
      translation: "Когда будет время, пойдём в музей.",
      surfaceForm: "Cuando tengamos",
      articleId: 42,
      addedAt: NOW - 1000,
    };
    const plan = planGrammarSaves({
      accepted: [candidate("cuando+subjuntivo")],
      existing: [existingItem("cuando+subjuntivo", [stored])],
      activeCount: 0,
      poolLimit: 10,
      articleId: 42,
      now: NOW,
    });
    expect(plan.inserts).toEqual([]);
    expect(plan.contextUpdates).toEqual([]);
  });

  it("caps stored contexts at five", () => {
    const stored = Array.from({ length: 5 }, (_, index) => ({
      sentence: `Frase distinta número ${index}.`,
      translation: null,
      surfaceForm: "cuando tengamos",
      articleId: index + 1,
      addedAt: NOW - 5000 + index,
    }));
    const plan = planGrammarSaves({
      accepted: [candidate("cuando+subjuntivo")],
      existing: [existingItem("cuando+subjuntivo", stored)],
      activeCount: 0,
      poolLimit: 10,
      articleId: 42,
      now: NOW,
    });
    const contexts = JSON.parse(plan.contextUpdates[0]!.contexts) as Array<{ sentence: string }>;
    expect(contexts).toHaveLength(5);
    expect(contexts.at(-1)!.sentence).toBe("Cuando tengamos tiempo, iremos al museo.");
    expect(contexts[0]!.sentence).toBe("Frase distinta número 1.");
  });
});
