import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { articles, readingSessions } from "../schema.js";
import type { Mark } from "../../domain/marks.js";

export type SessionRow = typeof readingSessions.$inferSelect;

export async function getActiveSession(userId: number): Promise<SessionRow | undefined> {
  return db.query.readingSessions.findFirst({ where: eq(readingSessions.userId, userId) });
}

export async function createSession(userId: number, articleId: number): Promise<SessionRow> {
  const [row] = await db
    .insert(readingSessions)
    .values({ userId, articleId, marks: "[]", state: "reading" })
    .returning();
  if (!row) throw new Error("Failed to create session");
  return row;
}

export async function updateSessionMarks(sessionId: number, marks: Mark[]): Promise<void> {
  await db
    .update(readingSessions)
    .set({ marks: JSON.stringify(marks), updatedAt: Date.now() })
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

/**
 * Skips a reading (F-17): the skip stamp on the article and the session
 * delete land together or not at all — a crash between them must not leave a
 * skipped-but-still-active reading (or a silently dropped questionnaire).
 */
export async function applySkip(params: {
  sessionId: number;
  articleId: number;
  reason: "repeat" | "not_interested" | "too_hard" | "other" | null;
  comment: string | null;
  skippedAt: number;
}): Promise<void> {
  db.transaction((trx) => {
    trx
      .update(articles)
      .set({ skippedAt: params.skippedAt, skipReason: params.reason, skipComment: params.comment })
      .where(eq(articles.id, params.articleId))
      .run();
    trx.delete(readingSessions).where(eq(readingSessions.id, params.sessionId)).run();
  });
}
