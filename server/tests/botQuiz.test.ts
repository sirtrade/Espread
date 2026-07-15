import { describe, expect, it } from "vitest";
import { encodeChoiceCallback, parseChoiceCallback } from "../src/bot/quiz.js";

describe("bot quiz callback metadata", () => {
  it("round-trips the server-built MC card type within Telegram's limit", () => {
    for (const cardType of ["cloze", "recall"] as const) {
      const encoded = encodeChoiceCallback({
        itemId: 2_147_483_647,
        cardType,
        chosenIdx: 3,
        correctIdx: 1,
      });
      expect(Buffer.byteLength(encoded, "utf8")).toBeLessThanOrEqual(64);
      expect(parseChoiceCallback(encoded)).toEqual({
        itemId: 2_147_483_647,
        cardType,
        chosenIdx: 3,
        correctIdx: 1,
      });
    }
  });

  it("keeps already-sent callbacks compatible", () => {
    expect(parseChoiceCallback("pq:42:2:1")).toEqual({
      itemId: 42,
      cardType: "recall",
      chosenIdx: 2,
      correctIdx: 1,
    });
  });
});
