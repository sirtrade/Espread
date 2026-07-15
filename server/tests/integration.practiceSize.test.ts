import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Route-level coverage for the configurable Práctica session size (M-1):
 *  - PATCH /api/me persists `practiceSize` and GET /api/me returns it;
 *  - GET /api/practice/queue?limit= honors the requested size, so the saved
 *    preference really caps how many cards a session pulls.
 */
describe("practice session size (route level)", () => {
  let app: ReturnType<typeof import("../src/api/app.js").createApp>;
  let db: typeof import("../src/db/client.js").db;
  let sqlite: typeof import("../src/db/client.js").sqlite;
  let schema: typeof import("../src/db/schema.js");
  let signSession: typeof import("../src/auth/jwt.js").signSession;
  let findOrCreateUser: typeof import("../src/db/repositories/users.js").findOrCreateUser;
  let userId: number;
  let auth: string;

  async function patchMe(body: Record<string, unknown>) {
    const res = await app.request("/api/me", {
      method: "PATCH",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  async function queue(limit: number) {
    const res = await app.request(`/api/practice/queue?limit=${limit}`, { headers: { Authorization: auth } });
    expect(res.status).toBe(200);
    return (await res.json()) as { cards: unknown[]; due: number };
  }

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    ({ db, sqlite } = await import("../src/db/client.js"));
    migrate(db, { migrationsFolder: "./drizzle" });
    schema = await import("../src/db/schema.js");
    ({ signSession } = await import("../src/auth/jwt.js"));
    app = (await import("../src/api/app.js")).createApp();
    ({ findOrCreateUser } = await import("../src/db/repositories/users.js"));

    const user = await findOrCreateUser(778001, "practicesize");
    userId = user.id;
    auth = `Bearer ${signSession({ userId, tgUserId: user.tgUserId })}`;

    // Seed more due words than any preset so the limit is what caps the queue.
    for (let i = 0; i < 12; i++) {
      await db.insert(schema.bankItems).values({
        userId,
        lemma: `palabra${i}`,
        translation: `слово${i}`,
        firstContext: `Una frase con palabra${i} dentro.`,
        surfaceForm: `palabra${i}`,
        pos: "noun",
        status: "active",
        srsStage: 0,
      });
    }
  });

  afterAll(() => sqlite.close());

  it("defaults to 10 for a fresh profile", async () => {
    const res = await app.request("/api/me", { headers: { Authorization: auth } });
    const profile = (await res.json()) as Record<string, unknown>;
    expect(profile.practiceSize).toBe(10);
  });

  it("persists a chosen session size", async () => {
    const { status, body } = await patchMe({ practiceSize: 5 });
    expect(status).toBe(200);
    expect(body.practiceSize).toBe(5);

    const res = await app.request("/api/me", { headers: { Authorization: auth } });
    expect(((await res.json()) as Record<string, unknown>).practiceSize).toBe(5);
  });

  it("rejects a size outside the allowed range", async () => {
    expect((await patchMe({ practiceSize: 0 })).status).toBe(400);
    expect((await patchMe({ practiceSize: 31 })).status).toBe(400);
  });

  it("caps the queue at the requested size", async () => {
    expect((await queue(5)).cards.length).toBe(5);
    expect((await queue(20)).cards.length).toBe(12); // only 12 due words exist
  });
});
