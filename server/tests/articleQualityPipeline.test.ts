import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArticleQualityVerdict, ArticleStepResult } from "../src/llm/schemas.js";

const { callJsonMock } = vi.hoisted(() => ({ callJsonMock: vi.fn() }));

vi.mock("../src/llm/callJson.js", () => ({
  callJsonLLM: (params: unknown) => callJsonMock(params),
}));

const { auditAndRefineArticle, needsRewrite, MAX_REWRITE_ATTEMPTS } = await import("../src/llm/articleQuality.js");

function bodyOf(words: number): string {
  return Array(words).fill("palabra").join(" ");
}

function article(title: string): ArticleStepResult {
  return { title, body: bodyOf(260), usedTerms: [], lemmas: ["palabra"] };
}

function passing(over: Partial<ArticleQualityVerdict> = {}): ArticleQualityVerdict {
  return { estimatedLevel: "B1", naturalness: 5, cefrFit: 5, readability: 5, factualGrounding: 5, issues: [], ...over };
}

function failingMajor(over: Partial<ArticleQualityVerdict> = {}): ArticleQualityVerdict {
  return {
    estimatedLevel: "C1",
    naturalness: 5,
    cefrFit: 5,
    readability: 5,
    factualGrounding: 5,
    issues: [{ category: "collocation", severity: "major", excerpt: null, suggestion: "suena forzado" }],
    ...over,
  };
}

/** Drives the mocked callJsonLLM by call kind, pulling from per-kind queues. */
function driveByKind(audits: ArticleQualityVerdict[], rewrites: ArticleStepResult[]) {
  const auditQueue = [...audits];
  const rewriteQueue = [...rewrites];
  callJsonMock.mockImplementation(async (p: { kind: string }) => {
    if (p.kind === "audit") return auditQueue.shift();
    if (p.kind === "rewrite") return rewriteQueue.shift();
    throw new Error(`unexpected kind ${p.kind}`);
  });
}

const baseParams = { userId: 1, level: "C1" as const, targetTerms: [], facts: null };

beforeEach(() => {
  callJsonMock.mockReset();
});

describe("needsRewrite decision", () => {
  const okDeterministic = { wordCount: 260, issues: [], hardFail: false };

  it("passes a clean verdict with no facts", () => {
    expect(needsRewrite(passing(), okDeterministic, false)).toBe(false);
  });

  it("requires a rewrite on any major issue", () => {
    expect(needsRewrite(failingMajor(), okDeterministic, false)).toBe(true);
  });

  it("requires a rewrite when naturalness or cefrFit is below the threshold", () => {
    expect(needsRewrite(passing({ naturalness: 3 }), okDeterministic, false)).toBe(true);
    expect(needsRewrite(passing({ cefrFit: 3 }), okDeterministic, false)).toBe(true);
  });

  it("requires a rewrite on a deterministic hard fail even if the verdict is perfect", () => {
    expect(needsRewrite(passing(), { wordCount: 40, issues: [], hardFail: true }, false)).toBe(true);
  });

  it("only weighs factual grounding when there is a source", () => {
    const weakFacts = passing({ factualGrounding: 2 });
    expect(needsRewrite(weakFacts, okDeterministic, false)).toBe(false);
    expect(needsRewrite(weakFacts, okDeterministic, true)).toBe(true);
  });
});

describe("auditAndRefineArticle orchestration", () => {
  it("keeps the draft and skips rewriting when the audit passes", async () => {
    driveByKind([passing()], []);
    const draft = article("Borrador limpio");
    const result = await auditAndRefineArticle({ ...baseParams, draft });

    expect(result).toBe(draft);
    expect(callJsonMock).toHaveBeenCalledTimes(1);
    expect(callJsonMock.mock.calls.every((c) => c[0].kind === "audit")).toBe(true);
  });

  it("rewrites once when the first audit fails and the rewrite passes", async () => {
    const rewritten = article("Versión corregida");
    driveByKind([failingMajor(), passing()], [rewritten]);

    const result = await auditAndRefineArticle({ ...baseParams, draft: article("Borrador flojo") });

    expect(result).toBe(rewritten);
    const kinds = callJsonMock.mock.calls.map((c) => c[0].kind);
    expect(kinds).toEqual(["audit", "rewrite", "audit"]);
  });

  it("stops after MAX_REWRITE_ATTEMPTS and returns the best-scoring version", async () => {
    const rewrite1 = article("Mejor intento");
    const rewrite2 = article("Peor intento");
    driveByKind(
      [
        failingMajor({ naturalness: 2, cefrFit: 2, readability: 2 }), // draft: score 6
        failingMajor({ naturalness: 4, cefrFit: 4, readability: 4 }), // rewrite1: score 12 (best)
        failingMajor({ naturalness: 1, cefrFit: 1, readability: 1 }), // rewrite2: score 3
      ],
      [rewrite1, rewrite2],
    );

    const result = await auditAndRefineArticle({ ...baseParams, draft: article("Borrador") });

    expect(result).toBe(rewrite1);
    const kinds = callJsonMock.mock.calls.map((c) => c[0].kind);
    expect(kinds).toEqual(["audit", "rewrite", "audit", "rewrite", "audit"]);
    expect(kinds.filter((k) => k === "rewrite")).toHaveLength(MAX_REWRITE_ATTEMPTS);
  });

  it("degrades gracefully to the draft when the audit call throws", async () => {
    callJsonMock.mockRejectedValue(new Error("LLM down"));
    const draft = article("Borrador");
    const result = await auditAndRefineArticle({ ...baseParams, draft });

    expect(result).toBe(draft);
    expect(callJsonMock.mock.calls.every((c) => c[0].kind === "audit")).toBe(true);
  });

  it("keeps the best version so far when the rewrite call throws", async () => {
    const draft = article("Borrador");
    callJsonMock.mockImplementation(async (p: { kind: string }) => {
      if (p.kind === "audit") return failingMajor();
      throw new Error("rewrite failed");
    });

    const result = await auditAndRefineArticle({ ...baseParams, draft });

    expect(result).toBe(draft);
    const kinds = callJsonMock.mock.calls.map((c) => c[0].kind);
    expect(kinds).toEqual(["audit", "rewrite"]);
  });
});
