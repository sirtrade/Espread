import { describe, expect, it } from "vitest";
import {
  notInterestedSkipCounts,
  suggestTopicRemoval,
  TOPIC_SKIP_WINDOW_MS,
  TOPIC_SUGGEST_THRESHOLD,
  type TopicSkip,
} from "../src/domain/topicPreferences.js";
import { pickTopic } from "../src/domain/topicRotation.js";
import { sanitizeReaderNotes, READER_NOTES_LIMIT, READER_NOTE_MAX_CHARS } from "../src/domain/recentStories.js";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function skip(topic: string, skippedAt: number, reason: TopicSkip["skipReason"] = "not_interested"): TopicSkip {
  return { topic, skippedAt, skipReason: reason };
}

describe("notInterestedSkipCounts (F-19)", () => {
  it("counts only not_interested skips inside the window", () => {
    const counts = notInterestedSkipCounts(
      [
        skip("Deporte", NOW - DAY),
        skip("Deporte", NOW - 2 * DAY),
        skip("Deporte", NOW - TOPIC_SKIP_WINDOW_MS - 1), // stale
        skip("Deporte", NOW - DAY, "repeat"), // other reason
        skip("Deporte", NOW - DAY, "too_hard"),
        skip("Deporte", NOW - DAY, "other"),
        skip("Deporte", NOW - DAY, null),
        skip("Ciencia", NOW - DAY),
      ],
      NOW,
    );
    expect(counts.get("Deporte")).toBe(2);
    expect(counts.get("Ciencia")).toBe(1);
  });
});

describe("pickTopic with skip weights (F-19)", () => {
  const topics = ["a", "b"];

  it("keeps the uniform behavior without weights", () => {
    expect(pickTopic(topics, [], () => 0)).toBe("a");
    expect(pickTopic(topics, [], () => 0.99)).toBe("b");
  });

  it("shrinks the skipped topic's share of the random range", () => {
    // Weights: a=1, b=1/(1+3)=0.25, total 1.25 -> "a" owns [0, 0.8) of the
    // random range instead of [0, 0.5).
    const counts = new Map([["b", 3]]);
    expect(pickTopic(topics, [], () => 0.79, counts)).toBe("a");
    expect(pickTopic(topics, [], () => 0.81, counts)).toBe("b");
  });

  it("never excludes a skipped topic entirely", () => {
    const counts = new Map([["b", 1000]]);
    expect(pickTopic(topics, [], () => 0.9999, counts)).toBe("b");
  });

  it("keeps the avoid-last-two rule under weights", () => {
    const counts = new Map([["c", 5]]);
    for (let i = 0; i < 20; i++) {
      const pick = pickTopic(["a", "b", "c"], ["a", "b"], Math.random, counts);
      expect(pick).toBe("c");
    }
  });

  it("falls back to the full list when all topics are recent, still weighted", () => {
    const counts = new Map([["a", 3]]);
    // Pool falls back to [a, b]; weights 0.25 / 1 -> b owns [0.2, 1).
    expect(pickTopic(["a", "b"], ["a", "b"], () => 0.5, counts)).toBe("b");
    expect(pickTopic(["a", "b"], ["a", "b"], () => 0.1, counts)).toBe("a");
  });

  it("survives degenerate weight input with a uniform fallback", () => {
    const counts = new Map([["a", Number.POSITIVE_INFINITY]]);
    expect(["a", "b"]).toContain(pickTopic(topics, [], () => 0.5, counts));
  });
});

describe("suggestTopicRemoval (F-19)", () => {
  const topics = ["Deporte", "Ciencia"];

  it("returns null below the threshold", () => {
    const skips = Array.from({ length: TOPIC_SUGGEST_THRESHOLD - 1 }, (_, i) => skip("Deporte", NOW - i * DAY));
    expect(suggestTopicRemoval({ topics, skips, dismissals: new Map(), now: NOW })).toBeNull();
  });

  it("suggests the topic once the threshold is reached", () => {
    const skips = Array.from({ length: TOPIC_SUGGEST_THRESHOLD }, (_, i) => skip("Deporte", NOW - i * DAY));
    expect(suggestTopicRemoval({ topics, skips, dismissals: new Map(), now: NOW })).toEqual({
      topic: "Deporte",
      count: TOPIC_SUGGEST_THRESHOLD,
    });
  });

  it("ignores skips with other reasons and outside the window", () => {
    const skips = [
      skip("Deporte", NOW - DAY, "repeat"),
      skip("Deporte", NOW - DAY, "too_hard"),
      skip("Deporte", NOW - TOPIC_SKIP_WINDOW_MS - 1),
      skip("Deporte", NOW - DAY),
      skip("Deporte", NOW - 2 * DAY),
    ];
    expect(suggestTopicRemoval({ topics, skips, dismissals: new Map(), now: NOW })).toBeNull();
  });

  it("counts only skips after the reader's last dismissal", () => {
    const skips = [skip("Deporte", NOW - 3 * DAY), skip("Deporte", NOW - 2 * DAY), skip("Deporte", NOW - DAY)];
    const dismissals = new Map([["Deporte", NOW - 2 * DAY]]);
    // Only the NOW-DAY skip is after the dismissal -> below threshold.
    expect(suggestTopicRemoval({ topics, skips, dismissals, now: NOW })).toBeNull();
  });

  it("ignores skips of topics no longer in the interest list", () => {
    const skips = Array.from({ length: TOPIC_SUGGEST_THRESHOLD }, (_, i) => skip("Viajes", NOW - i * DAY));
    expect(suggestTopicRemoval({ topics, skips, dismissals: new Map(), now: NOW })).toBeNull();
  });

  it("picks the most-skipped topic when several qualify", () => {
    const skips = [
      ...Array.from({ length: TOPIC_SUGGEST_THRESHOLD }, (_, i) => skip("Deporte", NOW - i * DAY)),
      ...Array.from({ length: TOPIC_SUGGEST_THRESHOLD + 1 }, (_, i) => skip("Ciencia", NOW - i * DAY)),
    ];
    expect(suggestTopicRemoval({ topics, skips, dismissals: new Map(), now: NOW })?.topic).toBe("Ciencia");
  });
});

describe("sanitizeReaderNotes (F-19)", () => {
  it("collapses whitespace, strips quotes, and drops empties", () => {
    expect(sanitizeReaderNotes(['  demasiado \n "polémico"  ', "   ", "ok"])).toEqual([
      "demasiado 'polémico'",
      "ok",
    ]);
  });

  it("caps note length and list size", () => {
    const notes = sanitizeReaderNotes(["x".repeat(500), "a", "b", "c"]);
    expect(notes).toHaveLength(READER_NOTES_LIMIT);
    expect(notes[0]!.length).toBeLessThanOrEqual(READER_NOTE_MAX_CHARS);
  });
});
