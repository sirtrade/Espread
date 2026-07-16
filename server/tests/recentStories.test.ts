import { describe, expect, it } from "vitest";
import {
  buildStoryAvoidList,
  RECENT_STORIES_LIMIT,
  RECENT_STORIES_WINDOW_MS,
  STORY_TITLE_MAX_CHARS,
  type RecentStoryCandidate,
} from "../src/domain/recentStories.js";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function read(title: string, readAt: number): RecentStoryCandidate {
  return { title, readAt, skippedAt: null, skipReason: null };
}

function skipped(title: string, skippedAt: number, reason: RecentStoryCandidate["skipReason"]): RecentStoryCandidate {
  return { title, readAt: null, skippedAt, skipReason: reason };
}

describe("buildStoryAvoidList (F-18)", () => {
  it("returns an empty list for an empty history", () => {
    expect(buildStoryAvoidList([], NOW)).toEqual([]);
  });

  it("keeps read and skipped stories inside the window, newest first", () => {
    const list = buildStoryAvoidList(
      [
        read("Historia vieja", NOW - 3 * DAY),
        skipped("Historia de ayer", NOW - 1 * DAY, "not_interested"),
        read("Historia de hoy", NOW),
      ],
      NOW,
    );
    expect(list).toEqual(["Historia de hoy", "Historia de ayer", "Historia vieja"]);
  });

  it("drops stories read/skipped before the window", () => {
    const list = buildStoryAvoidList(
      [
        read("Dentro de la ventana", NOW - RECENT_STORIES_WINDOW_MS),
        read("Fuera de la ventana", NOW - RECENT_STORIES_WINDOW_MS - 1),
        skipped("Salto viejo", NOW - 30 * DAY, "repeat"),
      ],
      NOW,
    );
    expect(list).toEqual(["Dentro de la ventana"]);
  });

  it("caps the list at the limit", () => {
    const candidates = Array.from({ length: RECENT_STORIES_LIMIT + 5 }, (_, i) => read(`Historia ${i}`, NOW - i));
    const list = buildStoryAvoidList(candidates, NOW);
    expect(list).toHaveLength(RECENT_STORIES_LIMIT);
    expect(list[0]).toBe("Historia 0");
  });

  it('lets "repeat" skips survive the cap ahead of newer entries', () => {
    // The oldest in-window entry is a repeat-skip: without priority it would
    // be pushed out by the cap; with it, it must lead the list.
    const candidates = [
      skipped("La historia repetida", NOW - 13 * DAY, "repeat"),
      ...Array.from({ length: RECENT_STORIES_LIMIT }, (_, i) => read(`Relleno ${i}`, NOW - i)),
    ];
    const list = buildStoryAvoidList(candidates, NOW);
    expect(list).toHaveLength(RECENT_STORIES_LIMIT);
    expect(list[0]).toBe("La historia repetida");
    expect(list).not.toContain(`Relleno ${RECENT_STORIES_LIMIT - 1}`);
  });

  it("gives no priority to skips with other reasons", () => {
    const list = buildStoryAvoidList(
      [skipped("Aburrida", NOW - 2 * DAY, "not_interested"), read("Reciente", NOW - DAY)],
      NOW,
    );
    expect(list).toEqual(["Reciente", "Aburrida"]);
  });

  it("truncates overlong titles and trims whitespace", () => {
    const long = `El congreso ${"muy ".repeat(40)}largo`;
    const list = buildStoryAvoidList([read(long, NOW), read("  Corta  ", NOW - 1)], NOW);
    expect(list[0]!.length).toBeLessThanOrEqual(STORY_TITLE_MAX_CHARS);
    expect(list[0]!.endsWith("…")).toBe(true);
    expect(list[1]).toBe("Corta");
  });

  it("drops blank titles", () => {
    expect(buildStoryAvoidList([read("   ", NOW)], NOW)).toEqual([]);
  });
});
