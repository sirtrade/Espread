import { eq } from "drizzle-orm";
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
  practiceSize: number;
  onboardedAt: number;
}>;

export async function updateUser(userId: number, patch: UserPatch): Promise<UserRow> {
  const [row] = await db.update(users).set(patch).where(eq(users.id, userId)).returning();
  if (!row) throw new Error("User not found");
  return row;
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
