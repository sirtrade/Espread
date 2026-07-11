import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { getBankItems } from "../../db/repositories/bank.js";
import { Errors } from "../errors.js";
import { serializeBankItem } from "../serializers.js";
import { bankQuerySchema } from "../validation.js";
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
