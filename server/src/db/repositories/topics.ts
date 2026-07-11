import { asc, eq } from "drizzle-orm";
import { db } from "../client.js";
import { userTopics } from "../schema.js";

export async function getUserTopics(userId: number): Promise<string[]> {
  const rows = await db.query.userTopics.findMany({
    where: eq(userTopics.userId, userId),
    orderBy: [asc(userTopics.position)],
  });
  return rows.map((r) => r.topic);
}

export async function setUserTopics(userId: number, topics: string[]): Promise<void> {
  db.transaction((trx) => {
    trx.delete(userTopics).where(eq(userTopics.userId, userId)).run();
    topics.forEach((topic, position) => {
      trx.insert(userTopics).values({ userId, topic, position }).run();
    });
  });
}
