import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { listGrammarItems, rebalanceGrammarPool, setGrammarItemStatus } from "../../db/repositories/grammar.js";
import { getUserById } from "../../db/repositories/users.js";
import { Errors } from "../errors.js";
import { serializeGrammarItem } from "../serializers.js";
import { grammarQuerySchema, patchGrammarItemSchema } from "../validation.js";
import type { AppEnv } from "../context.js";

export const grammarRoutes = new Hono<AppEnv>();

grammarRoutes.use("*", requireAuth);

grammarRoutes.get("/", async (c) => {
  const { userId } = c.get("session");
  const query = grammarQuerySchema.safeParse({ status: c.req.query("status") });
  if (!query.success) throw Errors.badRequest("Parámetro status inválido");

  const items = await listGrammarItems(userId, query.data.status);
  return c.json({ items: items.map(serializeGrammarItem) });
});

grammarRoutes.patch("/:id", async (c) => {
  const { userId } = c.get("session");
  const itemId = Number(c.req.param("id"));
  if (!Number.isInteger(itemId) || itemId <= 0) throw Errors.badRequest("Id inválido");

  const body = patchGrammarItemSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw Errors.badRequest("status debe ser active, queued, learned o ignored");

  const updated = await setGrammarItemStatus(userId, itemId, body.data.status);
  if (!updated) throw Errors.notFound("Construcción");

  // Mirrors the lexical bank: a manual change may free an active slot, so
  // refill the independent grammar pool FIFO. Never demotes an over-cap pool.
  const user = await getUserById(userId);
  if (user) await rebalanceGrammarPool(userId, user.grammarActivePoolLimit);

  return c.json({ item: serializeGrammarItem(updated) });
});
