import { describe, expect, it } from "vitest";
import { dedupeMarks, type Mark } from "../src/domain/marks.js";
import { putSessionSchema } from "../src/api/validation.js";

describe("dedupeMarks", () => {
  it("drops marks with the same kind/text/sentence, keeping the first", () => {
    const sentence = "Mi vecino se llama Andrés.";
    const marks: Mark[] = [
      { text: "se", sentence, kind: "word", pos: { p: 0, s: 0, t: [2, 2] } },
      { text: "se", sentence, kind: "word", pos: { p: 0, s: 0, t: [2, 2] } },
      { text: "Se", sentence, kind: "word" },
      { text: "se", sentence, kind: "sentence" },
    ];
    const result = dedupeMarks(marks);
    expect(result).toHaveLength(2);
    expect(result[0]?.pos).toEqual({ p: 0, s: 0, t: [2, 2] });
    expect(result[1]?.kind).toBe("sentence");
  });
});

describe("putSessionSchema (marks contract)", () => {
  const mark = { text: "perfila", sentence: "El proyecto se perfila como líder.", kind: "word" };

  it("accepts marks with and without pos", () => {
    const result = putSessionSchema.safeParse({
      marks: [mark, { ...mark, kind: "span", pos: { p: 1, s: 0, t: [3, 4] } }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty text or sentence", () => {
    expect(putSessionSchema.safeParse({ marks: [{ ...mark, text: "" }] }).success).toBe(false);
    expect(putSessionSchema.safeParse({ marks: [{ ...mark, sentence: "" }] }).success).toBe(false);
  });

  it("rejects unknown kinds and the legacy payload shape", () => {
    expect(putSessionSchema.safeParse({ marks: [{ ...mark, kind: "paragraph" }] }).success).toBe(false);
    expect(putSessionSchema.safeParse({ markedWords: ["hola"], markedSents: [] }).success).toBe(false);
  });

  it("caps the number of marks", () => {
    const marks = Array.from({ length: 301 }, () => mark);
    expect(putSessionSchema.safeParse({ marks }).success).toBe(false);
  });
});
