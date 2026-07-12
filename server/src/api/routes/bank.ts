import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { getBankItems, rebalanceActivePool, setBankItemStatus } from "../../db/repositories/bank.js";
import { getUserById } from "../../db/repositories/users.js";
import { Errors } from "../errors.js";
import { serializeBankItem } from "../serializers.js";
import { bankQuerySchema, patchBankItemSchema } from "../validation.js";
import type { AppEnv } from "../context.js";

export const bankRoutes = new Hono<AppEnv>();

bankRoutes.use("*", requireAuth);

bankRoutes.get("/", async (c) => {
  const { userId } = c.get("session");
  const query = bankQuerySchema.safeParse({ status: c.req.query("status") });
  if (!query.success) throw Errors.badRequest("Parámetro status inválido");

  const items = await getBankItems(userId, query.data.status);
  return c.json({ items: items.map(serializeBankItem) });
});

bankRoutes.patch("/:id", async (c) => {
  const { userId } = c.get("session");
  const itemId = Number(c.req.param("id"));
  if (!Number.isInteger(itemId) || itemId <= 0) throw Errors.badRequest("Id inválido");

  const body = patchBankItemSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw Errors.badRequest("status debe ser active, learned o ignored");

  const updated = await setBankItemStatus(userId, itemId, body.data.status);
  if (!updated) throw Errors.notFound("Palabra");

  // A manual change to learned/ignored/queued may free a slot; refill the
  // active pool from the queue. Promoting straight to active (e.g. "Estudiar
  // ahora") can push past the cap — rebalance never demotes, so that stands.
  const user = await getUserById(userId);
  if (user) await rebalanceActivePool(userId, user.activePoolLimit);

  return c.json({ item: serializeBankItem(updated) });
});
