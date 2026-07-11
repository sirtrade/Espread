import { describe, expect, it } from "vitest";
import { applyReviewToBank, selectTargetTerms, type BankItemRecord } from "../src/domain/bank.js";

function item(overrides: Partial<BankItemRecord> = {}): BankItemRecord {
  return {
    term: "casa",
    isPhrase: false,
    status: "active",
    exposures: 1,
    cleanStreak: 0,
    translation: "house",
    firstContext: "la casa es grande",
    ...overrides,
  };
}

describe("applyReviewToBank", () => {
  it("creates a new active item for a fresh alta word", () => {
    const result = applyReviewToBank(new Map(), [], [
      { term: "madrugar", isPhrase: false, translation: "to get up early", frequency: "alta" },
    ]);
    expect(result.get("madrugar")).toMatchObject({
      status: "active",
      exposures: 1,
      cleanStreak: 0,
    });
  });

  it("creates a new ignored item for a fresh baja word", () => {
    const result = applyReviewToBank(new Map(), [], [
      { term: "xilófono raro", isPhrase: false, translation: null, frequency: "baja" },
    ]);
    expect(result.get("xilófono raro")?.status).toBe("ignored");
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

  it("resets streak when an active item is marked again with alta verdict", () => {
    const existing = new Map([["casa", item({ exposures: 3, cleanStreak: 2 })]]);
    const result = applyReviewToBank(existing, ["casa"], [
      { term: "casa", isPhrase: false, translation: "house", frequency: "alta" },
    ]);
    expect(result.get("casa")).toMatchObject({ exposures: 4, cleanStreak: 0, status: "active" });
  });

  it("moves an exposed active item to ignored if re-marked as baja", () => {
    const existing = new Map([["casa", item({ exposures: 3, cleanStreak: 2 })]]);
    const result = applyReviewToBank(existing, ["casa"], [
      { term: "casa", isPhrase: false, translation: "house", frequency: "baja" },
    ]);
    expect(result.get("casa")?.status).toBe("ignored");
  });

  it("does not mutate the input map", () => {
    const existing = new Map([["casa", item()]]);
    applyReviewToBank(existing, ["casa"], []);
    expect(existing.get("casa")).toMatchObject({ exposures: 1, cleanStreak: 0 });
  });

  it("upserts a marked term outside the exposed set (freshly encountered in article body)", () => {
    const existing = new Map([["perro", item({ term: "perro", exposures: 1, cleanStreak: 0 })]]);
    const result = applyReviewToBank(existing, [], [
      { term: "perro", isPhrase: false, translation: "dog", frequency: "alta" },
    ]);
    expect(result.get("perro")).toMatchObject({ exposures: 2, cleanStreak: 0, status: "active" });
  });
});

describe("selectTargetTerms", () => {
  it("picks the items with the fewest exposures, capped at the limit", () => {
    const items = [
      { term: "a", exposures: 5 },
      { term: "b", exposures: 1 },
      { term: "c", exposures: 3 },
      { term: "d", exposures: 2 },
    ];
    expect(selectTargetTerms(items, 2)).toEqual(["b", "d"]);
  });

  it("returns all items if fewer than the limit", () => {
    const items = [{ term: "a", exposures: 1 }];
    expect(selectTargetTerms(items, 8)).toEqual(["a"]);
  });
});
