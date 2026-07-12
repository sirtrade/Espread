import { describe, expect, it } from "vitest";
import { buildTypedQuizCard, gradeTypedAnswer, TYPED_QUIZ_MIN_STAGE } from "../src/domain/typedQuiz.js";

describe("buildTypedQuizCard", () => {
  const src = {
    lemma: "abarcar",
    translation: "охватывать, включать в себя",
    firstContext: "Lanzamientos que abarcan distintas plataformas y géneros.",
    surfaceForm: "abarcan",
  };

  it("builds a card with the translation prompt and a blanked context hint", () => {
    const card = buildTypedQuizCard(src);
    expect(card).not.toBeNull();
    expect(card!.prompt).toBe(src.translation);
    expect(card!.contextHint).toBe("Lanzamientos que _____ distintas plataformas y géneros.");
    expect(card!.accepted).toEqual(["abarcan", "abarcar"]);
  });

  it("returns null without a translation", () => {
    expect(buildTypedQuizCard({ ...src, translation: null })).toBeNull();
  });

  it("returns null when the translation echoes the answer", () => {
    expect(buildTypedQuizCard({ ...src, translation: "similar a abarcar" })).toBeNull();
  });

  it("omits the context hint when the answer still leaks after blanking", () => {
    const card = buildTypedQuizCard({
      ...src,
      firstContext: "Los planes abarcan mucho, y abarcan también otros temas.",
    });
    expect(card).not.toBeNull();
    expect(card!.contextHint).toBeNull();
  });

  it("omits the hint when neither form occurs in the context", () => {
    const card = buildTypedQuizCard({ ...src, firstContext: "Una frase sin la palabra." });
    expect(card).not.toBeNull();
    expect(card!.contextHint).toBeNull();
  });

  it("survives missing surface form (lemma only)", () => {
    const card = buildTypedQuizCard({ ...src, surfaceForm: null });
    expect(card!.accepted).toEqual(["abarcar"]);
  });

  it("kicks in from stage 2 (buttons stay for fresh words)", () => {
    expect(TYPED_QUIZ_MIN_STAGE).toBe(2);
  });
});

describe("gradeTypedAnswer", () => {
  const accepted = ["abarcan", "abarcar"];

  it("accepts an exact match of either form", () => {
    expect(gradeTypedAnswer("abarcan", accepted)).toMatchObject({ correct: true, verdict: "exact" });
    expect(gradeTypedAnswer("abarcar", accepted)).toMatchObject({ correct: true, verdict: "exact" });
  });

  it("is case- and whitespace-insensitive and ignores edge punctuation", () => {
    expect(gradeTypedAnswer("  Abarcar. ", accepted)).toMatchObject({ correct: true, verdict: "exact" });
    expect(gradeTypedAnswer("¡abarcan!", accepted)).toMatchObject({ correct: true, verdict: "exact" });
  });

  it("ignores a leading article on nouns", () => {
    expect(gradeTypedAnswer("el lanzamiento", ["lanzamiento"])).toMatchObject({ correct: true, verdict: "exact" });
    expect(gradeTypedAnswer("la amenaza", ["amenaza"])).toMatchObject({ correct: true, verdict: "exact" });
  });

  it("accepts a missing accent as correct but flags the spelling", () => {
    const grade = gradeTypedAnswer("genero", ["género"]);
    expect(grade).toMatchObject({ correct: true, verdict: "spelling", matched: "género" });
  });

  it("forgives a single typo on long words, flagging the spelling", () => {
    expect(gradeTypedAnswer("abarcam", accepted)).toMatchObject({ correct: true, verdict: "spelling" });
    expect(gradeTypedAnswer("abarcarn", accepted)).toMatchObject({ correct: true, verdict: "spelling" });
    expect(gradeTypedAnswer("abarca", accepted)).toMatchObject({ correct: true, verdict: "spelling" });
  });

  it("does not forgive typos on short words (casa != cosa)", () => {
    expect(gradeTypedAnswer("cosa", ["casa"])).toMatchObject({ correct: false, verdict: "wrong" });
    expect(gradeTypedAnswer("pero", ["perro"])).toMatchObject({ correct: false, verdict: "wrong" });
  });

  it("rejects two edits even on long words", () => {
    expect(gradeTypedAnswer("abarcomn", accepted)).toMatchObject({ correct: false, verdict: "wrong" });
  });

  it("rejects a different word and reports the primary form", () => {
    const grade = gradeTypedAnswer("establecer", accepted);
    expect(grade).toMatchObject({ correct: false, verdict: "wrong", matched: "abarcan" });
  });

  it("grades multi-word phrases", () => {
    expect(gradeTypedAnswer("llegar cargado de", ["llegar cargado de"])).toMatchObject({
      correct: true,
      verdict: "exact",
    });
    expect(gradeTypedAnswer("llegar  Cargado de ", ["llegar cargado de"])).toMatchObject({
      correct: true,
      verdict: "exact",
    });
  });
});
