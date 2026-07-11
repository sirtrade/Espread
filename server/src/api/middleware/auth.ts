import type { Context, Next } from "hono";
import { verifySession } from "../../auth/jwt.js";
import { Errors } from "../errors.js";
import type { AppEnv } from "../context.js";

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) throw Errors.unauthorized();

  try {
    const session = verifySession(token);
    c.set("session", session);
  } catch {
    throw Errors.unauthorized();
  }

  await next();
}
