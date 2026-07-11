import { describe, expect, it } from "vitest";
import { pickTopic } from "../src/domain/topicRotation.js";

describe("pickTopic", () => {
  it("never returns one of the last two topics if alternatives exist", () => {
    const topics = ["tecnología", "deporte", "cocina", "ciencia"];
    for (let i = 0; i < 20; i++) {
      const pick = pickTopic(topics, ["tecnología", "deporte"], Math.random);
      expect(["cocina", "ciencia"]).toContain(pick);
    }
  });

  it("falls back to the full list if all topics were recently used", () => {
    const pick = pickTopic(["a", "b"], ["a", "b"], () => 0);
    expect(["a", "b"]).toContain(pick);
  });

  it("throws on an empty topic list", () => {
    expect(() => pickTopic([], [])).toThrow();
  });

  it("is deterministic given a fixed random source", () => {
    const topics = ["a", "b", "c"];
    expect(pickTopic(topics, [], () => 0)).toBe("a");
    expect(pickTopic(topics, [], () => 0.99)).toBe("c");
  });
});
