import { describe, expect, it } from "vitest";
import {
  applyReviewToBank,
  MAX_NEW_TARGET_TERMS,
  MAX_TARGET_TERMS,
  POOL_SLOT_MAX_STAGE,
  queuedPromotionCount,
  selectTargetTerms,
  statusForFreqBand,
  type BankItemRecord,
  type ReviewedItem,
  type SelectableItem,
} from "../src/domain/bank.js";
import { READING_CREDIT_MAX_STAGE, SRS_INTERVALS_DAYS } from "../src/domain/srs.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

function item(overrides: Partial<BankItemRecord> = {}): BankItemRecord {
  return {
    lemma: "casa",
    isPhrase: false,
    status: "active",
    exposures: 1,
    srsStage: 0,
    nextDueAt: null,
    lastCreditAt: null,
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
    contexts: overrides.contexts ?? null,
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
    const result = applyReviewToBank(new Map(), [], [reviewed()], undefined, 0, NOW);
    expect(result.get("madrugar")).toMatchObject({
      status: "active",
      exposures: 1,
      srsStage: 0,
      nextDueAt: null,
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
    ], undefined, 0, NOW);
    expect(result.get("xilófono")?.status).toBe("ignored");
  });

  it("climbs the SRS ladder for an active word woven in without being re-marked", () => {
    const existing = new Map([["casa", item({ exposures: 2, srsStage: 0 })]]);
    const result = applyReviewToBank(existing, ["casa"], [], undefined, 0, NOW);
    expect(result.get("casa")).toMatchObject({
      exposures: 3,
      srsStage: 1,
      nextDueAt: NOW + SRS_INTERVALS_DAYS[0]! * DAY,
      lastCreditAt: NOW,
      status: "active",
    });
  });

  it("does not climb twice in one calendar day (anti-farm)", () => {
    const existing = new Map([["casa", item({ srsStage: 2, lastCreditAt: NOW - 60_000 })]]);
    const result = applyReviewToBank(existing, ["casa"], [], undefined, 0, NOW);
    // Same-day credit already spent: schedule untouched, exposures still count.
    expect(result.get("casa")).toMatchObject({ srsStage: 2, exposures: 2, lastCreditAt: NOW - 60_000 });
  });

  it("caps the reading credit by the user's local day, not UTC (UTC+3)", () => {
    // Prior credit at 2026-02-10 02:00 MSK; this exposure at 2026-02-10 23:00
    // MSK — same local day but a different UTC day. No second climb.
    const lastCredit = Date.UTC(2026, 1, 9, 23, 0, 0); // 2026-02-10 02:00 MSK
    const now = Date.UTC(2026, 1, 10, 20, 0, 0); // 2026-02-10 23:00 MSK
    const existing = new Map([["casa", item({ srsStage: 2, lastCreditAt: lastCredit })]]);
    const result = applyReviewToBank(existing, ["casa"], [], undefined, 0, now, "Europe/Moscow");
    expect(result.get("casa")).toMatchObject({ srsStage: 2, exposures: 2, lastCreditAt: lastCredit });
  });

  it("credits a reading exposure across a local-day rollover within one UTC day (UTC−8)", () => {
    // Prior credit at 2026-02-10 23:00 PST; this exposure at 2026-02-11 01:00
    // PST — same UTC day but a new local day, so the word climbs again.
    const lastCredit = Date.UTC(2026, 1, 11, 7, 0, 0); // 2026-02-10 23:00 PST
    const now = Date.UTC(2026, 1, 11, 9, 0, 0); // 2026-02-11 01:00 PST
    const existing = new Map([["casa", item({ srsStage: 2, lastCreditAt: lastCredit })]]);
    const result = applyReviewToBank(existing, ["casa"], [], undefined, 0, now, "America/Los_Angeles");
    expect(result.get("casa")).toMatchObject({
      srsStage: 3,
      exposures: 2,
      lastCreditAt: now,
      nextDueAt: now + SRS_INTERVALS_DAYS[2]! * DAY,
    });
  });

  it("advances a low-rung word on a clean exposure (at the reading-credit ceiling)", () => {
    // stage 2 == READING_CREDIT_MAX_STAGE: reading still advances it one rung.
    const existing = new Map([["casa", item({ srsStage: READING_CREDIT_MAX_STAGE, exposures: 2 })]]);
    const result = applyReviewToBank(existing, ["casa"], [], undefined, 0, NOW);
    expect(result.get("casa")).toMatchObject({
      srsStage: READING_CREDIT_MAX_STAGE + 1,
      exposures: 3,
      lastCreditAt: NOW,
      nextDueAt: NOW + SRS_INTERVALS_DAYS[READING_CREDIT_MAX_STAGE]! * DAY,
      status: "active",
    });
  });

  it("does not advance a word past the reading-credit ceiling on a clean exposure", () => {
    // stage 3 > READING_CREDIT_MAX_STAGE: passive reading counts the exposure
    // but leaves the schedule untouched — only practice/bot advances it now.
    const dueAt = NOW + 7 * DAY;
    const existing = new Map([
      ["casa", item({ srsStage: READING_CREDIT_MAX_STAGE + 1, exposures: 2, nextDueAt: dueAt })],
    ]);
    const result = applyReviewToBank(existing, ["casa"], [], undefined, 0, NOW);
    expect(result.get("casa")).toMatchObject({
      srsStage: READING_CREDIT_MAX_STAGE + 1,
      exposures: 3,
      nextDueAt: dueAt,
      lastCreditAt: null,
      status: "active",
    });
  });

  it("never graduates a top-rung word to learned from a clean reading exposure", () => {
    // Reading can't graduate: a word at the top rung stays active with its
    // schedule untouched. Graduation only happens through active recall.
    const dueAt = NOW + 120 * DAY;
    const existing = new Map([
      ["casa", item({ srsStage: SRS_INTERVALS_DAYS.length, exposures: 5, nextDueAt: dueAt })],
    ]);
    const result = applyReviewToBank(existing, ["casa"], [], undefined, 0, NOW);
    expect(result.get("casa")).toMatchObject({
      srsStage: SRS_INTERVALS_DAYS.length,
      exposures: 6,
      nextDueAt: dueAt,
      lastCreditAt: null,
      status: "active",
    });
  });

  it("soft-lapses a top-rung word instead of graduating it when re-marked", () => {
    const existing = new Map([["casa", item({ srsStage: SRS_INTERVALS_DAYS.length })]]);
    const result = applyReviewToBank(existing, ["casa"], [
      reviewed({ lemma: "casa", pos: "noun", gender: "f", translation: "house", freqBand: "top1000" }),
    ], undefined, 0, NOW);
    // Drops two rungs (7 - 2), not a full reset to 0.
    expect(result.get("casa")).toMatchObject({ srsStage: SRS_INTERVALS_DAYS.length - 2, status: "active" });
  });

  it("soft-lapses the schedule when an active item is re-marked", () => {
    const existing = new Map([["casa", item({ exposures: 3, srsStage: 4, nextDueAt: NOW + 30 * DAY })]]);
    const result = applyReviewToBank(existing, ["casa"], [
      reviewed({ lemma: "casa", pos: "noun", gender: "f", translation: "house", freqBand: "top1000" }),
    ], undefined, 0, NOW);
    // stage 4 - 2 = 2, due immediately for the next article.
    expect(result.get("casa")).toMatchObject({ exposures: 4, srsStage: 2, nextDueAt: NOW, status: "active" });
  });

  it("moves an exposed active item to ignored if re-marked as rare", () => {
    const existing = new Map([["casa", item({ exposures: 3, srsStage: 2 })]]);
    const result = applyReviewToBank(existing, ["casa"], [reviewed({ lemma: "casa", freqBand: "rare" })], undefined, 0, NOW);
    expect(result.get("casa")?.status).toBe("ignored");
  });

  it("does not mutate the input map", () => {
    const existing = new Map([["casa", item()]]);
    applyReviewToBank(existing, ["casa"], [], undefined, 0, NOW);
    expect(existing.get("casa")).toMatchObject({ exposures: 1, srsStage: 0 });
  });

  it("upserts a marked lemma outside the exposed set (freshly encountered in article body)", () => {
    const existing = new Map([["perro", item({ lemma: "perro", exposures: 1, srsStage: 3 })]]);
    const result = applyReviewToBank(existing, [], [
      reviewed({ lemma: "perro", pos: "noun", gender: "m", translation: "dog", freqBand: "top1000" }),
    ], undefined, 0, NOW);
    // Re-marked: soft lapse from stage 3 to 1 (not a full reset), due now.
    expect(result.get("perro")).toMatchObject({ exposures: 2, srsStage: 1, nextDueAt: NOW, status: "active" });
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
    ], undefined, 0, NOW);
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
    ], undefined, 0, NOW);
    expect(result.get("casa")).toMatchObject({
      surfaceForm: "casa",
      firstContext: "vive en una casa azul",
      contextTranslation: "lives in a blue house",
    });
  });
});

describe("applyReviewToBank with an active-pool limit", () => {
  /** A bank map preloaded with `n` distinct young active words (a0..a{n-1}). */
  function activeBank(n: number): Map<string, BankItemRecord> {
    const map = new Map<string, BankItemRecord>();
    for (let i = 0; i < n; i++) map.set(`a${i}`, item({ lemma: `a${i}`, srsStage: 0 }));
    return map;
  }

  it("keeps every accepted word active when the limit is 0 (no limit)", () => {
    const result = applyReviewToBank(activeBank(30), [], [reviewed({ lemma: "nuevo" })], undefined, 0, NOW);
    expect(result.get("nuevo")?.status).toBe("active");
  });

  it("queues a new frequent word once the active pool is full", () => {
    const result = applyReviewToBank(activeBank(20), [], [reviewed({ lemma: "nuevo" })], undefined, 20, NOW);
    expect(result.get("nuevo")?.status).toBe("queued");
    expect(result.get("nuevo")).toMatchObject({ translation: "to get up early", freqBand: "top5000", exposures: 1 });
  });

  it("still activates a new word when there is exactly one free slot", () => {
    const result = applyReviewToBank(activeBank(19), [], [reviewed({ lemma: "nuevo" })], undefined, 20, NOW);
    expect(result.get("nuevo")?.status).toBe("active");
  });

  it("fills the last free slots in reviewed order, queuing the overflow", () => {
    const result = applyReviewToBank(
      activeBank(18),
      [],
      [reviewed({ lemma: "first" }), reviewed({ lemma: "second" }), reviewed({ lemma: "third" })],
      undefined,
      20,
      NOW,
    );
    expect(result.get("first")?.status).toBe("active");
    expect(result.get("second")?.status).toBe("active");
    expect(result.get("third")?.status).toBe("queued");
  });

  it("does not count matured (long-interval) active words against the cap", () => {
    // 20 words, but half have matured past the slot threshold: only the young
    // ones fill the pool, so a new word still fits.
    const bank = activeBank(20);
    for (let i = 0; i < 10; i++) bank.set(`a${i}`, item({ lemma: `a${i}`, srsStage: POOL_SLOT_MAX_STAGE + 1 }));
    const result = applyReviewToBank(bank, [], [reviewed({ lemma: "nuevo" })], undefined, 20, NOW);
    expect(result.get("nuevo")?.status).toBe("active");
  });

  it("lets an already-active word keep its slot when re-marked at the limit", () => {
    const bank = activeBank(20);
    const result = applyReviewToBank(bank, [], [reviewed({ lemma: "a0", freqBand: "top1000" })], undefined, 20, NOW);
    expect(result.get("a0")?.status).toBe("active");
  });

  it("keeps a ceiling-stage word in its slot on a clean reading exposure (reading no longer matures it out)", () => {
    // a0 sits at POOL_SLOT_MAX_STAGE, above the reading-credit ceiling
    // (READING_CREDIT_MAX_STAGE): a clean reading exposure no longer advances it,
    // so it keeps occupying its slot and a new word is queued. Only active recall
    // in practice can push it past the pool threshold now.
    expect(POOL_SLOT_MAX_STAGE).toBeGreaterThan(READING_CREDIT_MAX_STAGE);
    const bank = activeBank(20);
    bank.set("a0", item({ lemma: "a0", srsStage: POOL_SLOT_MAX_STAGE }));
    const result = applyReviewToBank(bank, ["a0"], [reviewed({ lemma: "nuevo" })], undefined, 20, NOW);
    expect(result.get("a0")?.srsStage).toBe(POOL_SLOT_MAX_STAGE);
    expect(result.get("nuevo")?.status).toBe("queued");
  });

  it("ignores rejected/rare words regardless of the limit", () => {
    const result = applyReviewToBank(
      activeBank(20),
      [],
      [reviewed({ lemma: "raro", freqBand: "rare" }), reviewed({ lemma: "frecuente", freqBand: "top1000" })],
      { accepted: new Set<string>(), rejected: new Set(["frecuente"]) },
      20,
      NOW,
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
  function selectable(overrides: Partial<SelectableItem> & { lemma: string }): SelectableItem {
    return { exposures: 1, srsStage: 0, nextDueAt: null, ...overrides };
  }

  it("weaves only due words, reviews first (most overdue) then new, capped", () => {
    const now = 10_000;
    const items: SelectableItem[] = [
      selectable({ lemma: "r1", srsStage: 2, nextDueAt: 500 }),
      selectable({ lemma: "r2", srsStage: 1, nextDueAt: 900 }),
      selectable({ lemma: "n1", srsStage: 0, nextDueAt: null, exposures: 0 }),
      selectable({ lemma: "n2", srsStage: 0, nextDueAt: null, exposures: 2 }),
      selectable({ lemma: "future", srsStage: 1, nextDueAt: now + 5000 }),
    ];
    // max 3: r1, r2 (reviews, earliest due first), then one new word (fewest exposures).
    expect(selectTargetTerms(items, now)).toEqual(["r1", "r2", "n1"]);
  });

  it("introduces at most MAX_NEW_TARGET_TERMS new words when there are no reviews", () => {
    const now = 10_000;
    const items: SelectableItem[] = [
      selectable({ lemma: "n1", exposures: 0 }),
      selectable({ lemma: "n2", exposures: 1 }),
      selectable({ lemma: "n3", exposures: 2 }),
    ];
    const picked = selectTargetTerms(items, now);
    expect(picked).toEqual(["n1", "n2"]);
    expect(picked.length).toBeLessThanOrEqual(MAX_NEW_TARGET_TERMS);
  });

  it("returns nothing when no word is due", () => {
    const now = 10_000;
    const items: SelectableItem[] = [selectable({ lemma: "a", srsStage: 1, nextDueAt: now + DAY })];
    expect(selectTargetTerms(items, now)).toEqual([]);
  });

  it("never exceeds the total cap", () => {
    const now = 10_000;
    const items: SelectableItem[] = Array.from({ length: 8 }, (_, i) =>
      selectable({ lemma: `r${i}`, srsStage: 2, nextDueAt: 100 + i }),
    );
    expect(selectTargetTerms(items, now)).toHaveLength(MAX_TARGET_TERMS);
  });
});
