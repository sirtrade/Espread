import { describe, expect, it } from "vitest";
import {
  applyReviewToBank,
  queuedPromotionCount,
  selectTargetTerms,
  statusForFreqBand,
  type BankItemRecord,
  type ReviewedItem,
} from "../src/domain/bank.js";

function item(overrides: Partial<BankItemRecord> = {}): BankItemRecord {
  return {
    lemma: "casa",
    isPhrase: false,
    status: "active",
    exposures: 1,
    cleanStreak: 0,
    translation: "house",
    firstContext: "la casa es grande",
    surfaceForm: "casas",
    pos: "noun",
    gender: "f",
    note: null,
    contextTranslation: "the house is big",
    distractors: '["puerta","mesa","calle"]',
    freqBand: "top1000",
    ...overrides,
  };
}

function reviewed(overrides: Partial<ReviewedItem> = {}): ReviewedItem {
  return {
    lemma: "madrugar",
    isPhrase: false,
    surfaceForm: "madrugan",
    pos: "verb",
    gender: null,
    translation: "to get up early",
    note: null,
    contextTranslation: "farmers get up early",
    freqBand: "top5000",
    distractors: ["correr", "saltar", "dormir"],
    context: "los agricultores madrugan",
    ...overrides,
  };
}

describe("statusForFreqBand", () => {
  it("accepts top1000..top5000 into the bank and ignores rare", () => {
    expect(statusForFreqBand("top1000")).toBe("active");
    expect(statusForFreqBand("top3000")).toBe("active");
    expect(statusForFreqBand("top5000")).toBe("active");
    expect(statusForFreqBand("rare")).toBe("ignored");
  });
});

describe("applyReviewToBank", () => {
  it("creates a new active item with full card fields for a frequent word", () => {
    const result = applyReviewToBank(new Map(), [], [reviewed()]);
    expect(result.get("madrugar")).toMatchObject({
      status: "active",
      exposures: 1,
      cleanStreak: 0,
      surfaceForm: "madrugan",
      pos: "verb",
      gender: null,
      translation: "to get up early",
      contextTranslation: "farmers get up early",
      firstContext: "los agricultores madrugan",
      freqBand: "top5000",
      distractors: '["correr","saltar","dormir"]',
    });
  });

  it("creates a new ignored item for a rare word", () => {
    const result = applyReviewToBank(new Map(), [], [
      reviewed({ lemma: "xilófono", freqBand: "rare", pos: "noun", gender: "m" }),
    ]);
    expect(result.get("xilófono")?.status).toBe("ignored");
  });

  it("gives a clean exposure (streak+1) to an active item that appears but isn't marked", () => {
    const existing = new Map([["casa", item({ exposures: 2, cleanStreak: 1 })]]);
    const result = applyReviewToBank(existing, ["casa"], []);
    expect(result.get("casa")).toMatchObject({ exposures: 3, cleanStreak: 2, status: "active" });
  });

  it("promotes to learned on the 3rd consecutive clean exposure", () => {
    const existing = new Map([["casa", item({ exposures: 3, cleanStreak: 2 })]]);
    const result = applyReviewToBank(existing, ["casa"], []);
    expect(result.get("casa")).toMatchObject({ cleanStreak: 3, status: "learned" });
  });

  it("resets streak when an active item is marked again with a frequent verdict", () => {
    const existing = new Map([["casa", item({ exposures: 3, cleanStreak: 2 })]]);
    const result = applyReviewToBank(existing, ["casa"], [
      reviewed({ lemma: "casa", pos: "noun", gender: "f", translation: "house", freqBand: "top1000" }),
    ]);
    expect(result.get("casa")).toMatchObject({ exposures: 4, cleanStreak: 0, status: "active" });
  });

  it("moves an exposed active item to ignored if re-marked as rare", () => {
    const existing = new Map([["casa", item({ exposures: 3, cleanStreak: 2 })]]);
    const result = applyReviewToBank(existing, ["casa"], [reviewed({ lemma: "casa", freqBand: "rare" })]);
    expect(result.get("casa")?.status).toBe("ignored");
  });

  it("does not mutate the input map", () => {
    const existing = new Map([["casa", item()]]);
    applyReviewToBank(existing, ["casa"], []);
    expect(existing.get("casa")).toMatchObject({ exposures: 1, cleanStreak: 0 });
  });

  it("upserts a marked lemma outside the exposed set (freshly encountered in article body)", () => {
    const existing = new Map([["perro", item({ lemma: "perro", exposures: 1, cleanStreak: 0 })]]);
    const result = applyReviewToBank(existing, [], [
      reviewed({ lemma: "perro", pos: "noun", gender: "m", translation: "dog", freqBand: "top1000" }),
    ]);
    expect(result.get("perro")).toMatchObject({ exposures: 2, cleanStreak: 0, status: "active" });
  });

  it("keeps existing surfaceForm/firstContext/contextTranslation when the new verdict has empty ones", () => {
    const existing = new Map([["casa", item()]]);
    const result = applyReviewToBank(existing, [], [
      reviewed({
        lemma: "casa",
        surfaceForm: null,
        context: null,
        contextTranslation: null,
        translation: "home",
        pos: "noun",
        gender: "f",
        freqBand: "top1000",
      }),
    ]);
    expect(result.get("casa")).toMatchObject({
      translation: "home",
      surfaceForm: "casas",
      firstContext: "la casa es grande",
      contextTranslation: "the house is big",
    });
  });

  it("overwrites surfaceForm/firstContext/contextTranslation with fresh non-empty values", () => {
    const existing = new Map([["casa", item()]]);
    const result = applyReviewToBank(existing, [], [
      reviewed({
        lemma: "casa",
        surfaceForm: "casa",
        context: "vive en una casa azul",
        contextTranslation: "lives in a blue house",
        pos: "noun",
        gender: "f",
        freqBand: "top1000",
      }),
    ]);
    expect(result.get("casa")).toMatchObject({
      surfaceForm: "casa",
      firstContext: "vive en una casa azul",
      contextTranslation: "lives in a blue house",
    });
  });
});

describe("applyReviewToBank with an active-pool limit", () => {
  /** A bank map preloaded with `n` distinct active words (a0..a{n-1}). */
  function activeBank(n: number): Map<string, BankItemRecord> {
    const map = new Map<string, BankItemRecord>();
    for (let i = 0; i < n; i++) map.set(`a${i}`, item({ lemma: `a${i}` }));
    return map;
  }

  it("keeps every accepted word active when the limit is 0 (no limit)", () => {
    const result = applyReviewToBank(activeBank(30), [], [reviewed({ lemma: "nuevo" })], undefined, 0);
    expect(result.get("nuevo")?.status).toBe("active");
  });

  it("queues a new frequent word once the active pool is full", () => {
    const result = applyReviewToBank(activeBank(20), [], [reviewed({ lemma: "nuevo" })], undefined, 20);
    expect(result.get("nuevo")?.status).toBe("queued");
    // The queued word still gets its full card so it's ready to study later.
    expect(result.get("nuevo")).toMatchObject({ translation: "to get up early", freqBand: "top5000", exposures: 1 });
  });

  it("still activates a new word when there is exactly one free slot", () => {
    const result = applyReviewToBank(activeBank(19), [], [reviewed({ lemma: "nuevo" })], undefined, 20);
    expect(result.get("nuevo")?.status).toBe("active");
  });

  it("fills the last free slots in reviewed order, queuing the overflow", () => {
    const result = applyReviewToBank(
      activeBank(18),
      [],
      [reviewed({ lemma: "first" }), reviewed({ lemma: "second" }), reviewed({ lemma: "third" })],
      undefined,
      20,
    );
    expect(result.get("first")?.status).toBe("active");
    expect(result.get("second")?.status).toBe("active");
    expect(result.get("third")?.status).toBe("queued");
  });

  it("lets an already-active word keep its slot when re-marked at the limit", () => {
    const bank = activeBank(20);
    // Re-mark one of the existing active words; it must NOT be pushed to queue.
    const result = applyReviewToBank(bank, [], [reviewed({ lemma: "a0", freqBand: "top1000" })], undefined, 20);
    expect(result.get("a0")?.status).toBe("active");
  });

  it("gives a slot freed by a same-session promotion to a new word", () => {
    // a0 is on its 3rd clean exposure -> becomes learned, freeing one slot.
    const bank = activeBank(20);
    bank.set("a0", item({ lemma: "a0", exposures: 3, cleanStreak: 2 }));
    const result = applyReviewToBank(bank, ["a0"], [reviewed({ lemma: "nuevo" })], undefined, 20);
    expect(result.get("a0")?.status).toBe("learned");
    expect(result.get("nuevo")?.status).toBe("active");
  });

  it("ignores rejected/rare words regardless of the limit", () => {
    const result = applyReviewToBank(
      activeBank(20),
      [],
      [reviewed({ lemma: "raro", freqBand: "rare" }), reviewed({ lemma: "frecuente", freqBand: "top1000" })],
      { accepted: new Set<string>(), rejected: new Set(["frecuente"]) },
      20,
    );
    expect(result.get("raro")?.status).toBe("ignored");
    expect(result.get("frecuente")?.status).toBe("ignored");
  });
});

describe("queuedPromotionCount", () => {
  it("promotes only up to the free slots under the limit", () => {
    expect(queuedPromotionCount(18, 5, 20)).toBe(2);
    expect(queuedPromotionCount(20, 5, 20)).toBe(0);
    expect(queuedPromotionCount(19, 0, 20)).toBe(0);
  });

  it("never promotes when the pool is over the limit (no demotion)", () => {
    expect(queuedPromotionCount(25, 3, 20)).toBe(0);
  });

  it("drains the whole queue when there is no limit", () => {
    expect(queuedPromotionCount(50, 7, 0)).toBe(7);
  });
});

describe("selectTargetTerms", () => {
  it("picks the items with the fewest exposures, capped at the limit", () => {
    const items = [
      { lemma: "a", exposures: 5 },
      { lemma: "b", exposures: 1 },
      { lemma: "c", exposures: 3 },
      { lemma: "d", exposures: 2 },
    ];
    expect(selectTargetTerms(items, 2)).toEqual(["b", "d"]);
  });

  it("returns all items if fewer than the limit", () => {
    const items = [{ lemma: "a", exposures: 1 }];
    expect(selectTargetTerms(items, 8)).toEqual(["a"]);
  });
});
