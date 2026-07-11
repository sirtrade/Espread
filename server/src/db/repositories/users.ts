import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { userStats, users } from "../schema.js";

export type UserRow = typeof users.$inferSelect;

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
