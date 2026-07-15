import { and, eq } from "drizzle-orm";
import { db } from "../client.js";
import { userStats, users } from "../schema.js";

export type UserRow = typeof users.$inferSelect;

export type UserPatch = Partial<{
  level: "A2" | "B1" | "B2" | "C1" | "C2";
  explainLang: "ru" | "en" | "es";
  timezone: string;
  theme: "claro" | "sepia" | "oscuro" | "ambar";
  fontSize: "sm" | "md" | "lg" | "xl";
  dailyEnabled: boolean;
  dailyTime: string;
  botQuizzesPerDay: number;
  activePoolLimit: number;
  grammarActivePoolLimit: number;
  practiceSize: number;
  onboardedAt: number;
  levelSuggestionDirection: "up" | "down" | null;
  levelSuggestionShownAt: number | null;
  levelSuggestionDismissedAt: number | null;
}>;

export async function updateUser(userId: number, patch: UserPatch): Promise<UserRow> {
  const current = patch.level === undefined ? undefined : await getUserById(userId);
  const resetSuggestion = current && patch.level !== current.level;
  const [row] = await db
    .update(users)
    .set(resetSuggestion
      ? {
          ...patch,
          levelSuggestionDirection: null,
          levelSuggestionShownAt: null,
          levelSuggestionDismissedAt: null,
        }
      : patch)
    .where(eq(users.id, userId))
    .returning();
  if (!row) throw new Error("User not found");
  return row;
}

export async function recordLevelSuggestionInteraction(
  userId: number,
  expectedLevel: UserRow["level"],
  direction: "up" | "down",
  action: "seen" | "dismissed",
  at: number,
): Promise<boolean> {
  const rows = await db
    .update(users)
    .set({
      levelSuggestionDirection: direction,
      levelSuggestionShownAt: at,
      levelSuggestionDismissedAt: action === "dismissed" ? at : null,
    })
    .where(and(eq(users.id, userId), eq(users.level, expectedLevel)))
    .returning({ id: users.id });
  return rows.length === 1;
}

export async function getUserById(userId: number): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(users.id, userId) });
}

export async function getAllUsersWithDailyEnabled(): Promise<UserRow[]> {
  return db.query.users.findMany({ where: eq(users.dailyEnabled, true) });
}

export async function getAllUsers(): Promise<UserRow[]> {
  return db.query.users.findMany();
}

export async function markPrefetchDone(userId: number, dateStr: string): Promise<void> {
  await db.update(users).set({ lastPrefetchDate: dateStr }).where(eq(users.id, userId));
}

export async function setLastBotQuizAt(userId: number, ts: number): Promise<void> {
  await db.update(users).set({ lastBotQuizAt: ts }).where(eq(users.id, userId));
}

/** Marks a typed bot quiz as awaiting the user's free-text answer. */
export async function setPendingQuiz(userId: number, itemId: number, ts: number, contextAddedAt: number | null): Promise<void> {
  await db
    .update(users)
    .set({ pendingQuizItemId: itemId, pendingQuizSentAt: ts, pendingQuizContextAddedAt: contextAddedAt })
    .where(eq(users.id, userId));
}

export async function clearPendingQuiz(userId: number): Promise<void> {
  await db
    .update(users)
    .set({ pendingQuizItemId: null, pendingQuizSentAt: null, pendingQuizContextAddedAt: null })
    .where(eq(users.id, userId));
}

export async function markDailyDelivered(userId: number, dateStr: string): Promise<void> {
  await db.update(users).set({ lastDailyDeliveredDate: dateStr }).where(eq(users.id, userId));
}

export async function findUserByTgId(tgUserId: number): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(users.tgUserId, tgUserId) });
}

export async function findOrCreateUser(tgUserId: number, username: string | undefined): Promise<UserRow> {
  const existing = await findUserByTgId(tgUserId);
  if (existing) return existing;

  const [created] = await db.insert(users).values({ tgUserId, username: username ?? null }).returning();
  if (!created) throw new Error("Failed to create user");
  await db.insert(userStats).values({ userId: created.id });
  return created;
}
