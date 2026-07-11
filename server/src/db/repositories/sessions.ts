import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { readingSessions } from "../schema.js";

export type SessionRow = typeof readingSessions.$inferSelect;

export async function getActiveSession(userId: number): Promise<SessionRow | undefined> {
  return db.query.readingSessions.findFirst({ where: eq(readingSessions.userId, userId) });
}

export async function createSession(userId: number, articleId: number): Promise<SessionRow> {
  const [row] = await db
    .insert(readingSessions)
    .values({ userId, articleId, markedWords: "[]", markedSents: "[]", state: "reading" })
    .returning();
  if (!row) throw new Error("Failed to create session");
  return row;
}

export async function updateSessionMarks(
  sessionId: number,
  markedWords: string[],
  markedSents: string[],
): Promise<void> {
  await db
    .update(readingSessions)
    .set({ markedWords: JSON.stringify(markedWords), markedSents: JSON.stringify(markedSents), updatedAt: Date.now() })
    .where(eq(readingSessions.id, sessionId));
}

export async function setSessionReviewed(sessionId: number, reviewResult: unknown): Promise<void> {
  await db
    .update(readingSessions)
    .set({ reviewResult: JSON.stringify(reviewResult), state: "reviewed", updatedAt: Date.now() })
    .where(eq(readingSessions.id, sessionId));
}

export async function deleteSession(userId: number): Promise<void> {
  await db.delete(readingSessions).where(eq(readingSessions.userId, userId));
}
