import { beforeEach, describe, expect, it, vi } from "vitest";

const { callJsonMock } = vi.hoisted(() => ({ callJsonMock: vi.fn() }));

vi.mock("../src/llm/callJson.js", () => ({
  callJsonLLM: (params: unknown) => callJsonMock(params),
}));

const { REVIEW_BATCH_SIZE, reviewMarkedItems } = await import("../src/llm/review.js");

function item(surface: string) {
  return {
    surface,
    lemma: surface,
    pos: "noun",
    gender: "m",
    translation: `перевод ${surface}`,
    note: null,
    contextTranslation: null,
    freqBand: "top3000",
    distractors: ["uno", "dos", "tres", "cuatro", "cinco"],
  };
}

describe("review batching", () => {
  beforeEach(() => {
    callJsonMock.mockReset();
    callJsonMock.mockImplementation(async (params: { messages: Array<{ content: string }> }) => {
      const content = params.messages[0]!.content;
      const rawMarks = content.slice(content.indexOf("Marcas del estudiante: ") + "Marcas del estudiante: ".length);
      const marks = JSON.parse(rawMarks) as Array<{ text: string }>;
      return { items: marks.map((mark) => item(mark.text)), grammarCandidates: [] };
    });
  });

  it("keeps every LLM response below the configured mark batch size", async () => {
    const marks = Array.from({ length: REVIEW_BATCH_SIZE * 2 + 1 }, (_, index) => ({
      text: `palabra-${index}`,
      sentence: `Una frase con palabra-${index}.`,
      kind: "word" as const,
    }));

    const result = await reviewMarkedItems({
      userId: 1,
      articleTitle: "Lectura",
      articleBody: marks.map((mark) => mark.sentence).join(" "),
      level: "B2",
      explainLang: "ru",
      marks,
    });

    expect(callJsonMock).toHaveBeenCalledTimes(3);
    expect(result.items).toHaveLength(marks.length);
    for (const [params] of callJsonMock.mock.calls as Array<[{ messages: Array<{ content: string }> }]>) {
      const content = params.messages[0]!.content;
      const rawMarks = content.slice(content.indexOf("Marcas del estudiante: ") + "Marcas del estudiante: ".length);
      expect((JSON.parse(rawMarks) as unknown[]).length).toBeLessThanOrEqual(REVIEW_BATCH_SIZE);
    }
  });
});
