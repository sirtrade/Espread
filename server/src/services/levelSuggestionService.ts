import {
  LEVEL_SUGGESTION_WINDOW,
  availableLevelSuggestion,
  stableLevelSuggestion,
  type CefrLevel,
  type DensityMark,
  type LevelSuggestion,
} from "../domain/levelSuggestion.js";
import { getRecentCompletedReadings } from "../db/repositories/articles.js";
import {
  getUserById,
  recordLevelSuggestionInteraction,
  type UserRow,
} from "../db/repositories/users.js";
import { withUserLock } from "../lib/locks.js";
import { Errors } from "../api/errors.js";

function parseMarks(raw: string): DensityMark[] {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((mark): mark is DensityMark => {
      return typeof mark === "object" && mark !== null && typeof (mark as { text?: unknown }).text === "string";
    });
  } catch {
    return [];
  }
}

async function readingsForUser(userId: number) {
  const rows = await getRecentCompletedReadings(userId, LEVEL_SUGGESTION_WINDOW);
  return rows.map((row) => ({ body: row.body, marks: parseMarks(row.marks) }));
}

async function evaluateForUser(user: UserRow, now: number): Promise<LevelSuggestion | null> {
  const readings = await readingsForUser(user.id);
  return availableLevelSuggestion(
    user.level as CefrLevel,
    readings,
    {
      direction: user.levelSuggestionDirection,
      shownAt: user.levelSuggestionShownAt,
      dismissedAt: user.levelSuggestionDismissedAt,
    },
    now,
    user.timezone,
  );
}

/** Read-only evaluation: callers decide when the suggestion was actually shown. */
export async function evaluateLevelSuggestion(userId: number, now = Date.now()): Promise<LevelSuggestion | null> {
  const user = await getUserById(userId);
  if (!user) throw Errors.notFound("Usuario");
  return evaluateForUser(user, now);
}

/**
 * Re-evaluates under a per-user lock before writing interaction metadata.
 * A stale tab cannot dismiss or mark a suggestion that no longer matches the
 * current level/window.
 */
export async function markLevelSuggestion(
  userId: number,
  expected: LevelSuggestion,
  action: "seen" | "dismissed",
  now = Date.now(),
): Promise<void> {
  await withUserLock(`level-suggestion:${userId}`, async () => {
    const user = await getUserById(userId);
    if (!user) throw Errors.notFound("Usuario");
    const current = action === "dismissed"
      ? stableLevelSuggestion(user.level as CefrLevel, await readingsForUser(user.id))
      : await evaluateForUser(user, now);
    if (
      current?.direction !== expected.direction ||
      current.targetLevel !== expected.targetLevel ||
      (action === "dismissed" &&
        (user.levelSuggestionDirection !== expected.direction || user.levelSuggestionShownAt === null))
    ) {
      throw Errors.conflict("La sugerencia de nivel ya no está vigente");
    }
    const recorded = await recordLevelSuggestionInteraction(userId, user.level, current.direction, action, now);
    if (!recorded) throw Errors.conflict("El nivel cambió mientras se guardaba la sugerencia");
  });
}
