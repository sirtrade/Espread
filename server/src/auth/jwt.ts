import jwt from "jsonwebtoken";
import { config } from "../lib/config.js";

export interface SessionPayload {
  userId: number;
  tgUserId: number;
}

/**
 * We validate `initData`'s HMAC signature once, at /auth/telegram, then issue a
 * short-lived JWT (default 1h). Subsequent requests carry the JWT instead of
 * re-parsing/re-verifying initData on every call: cheaper (no HMAC per request),
 * and Telegram re-issues a fresh initData whenever the Mini App is reopened, so
 * the client can silently re-auth when the JWT expires without extra friction.
 */
export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: config.JWT_TTL_SECONDS });
}

export function verifySession(token: string): SessionPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET);
  if (typeof decoded === "string") throw new Error("Invalid token payload");
  const { userId, tgUserId } = decoded as Record<string, unknown>;
  if (typeof userId !== "number" || typeof tgUserId !== "number") {
    throw new Error("Invalid token payload");
  }
  return { userId, tgUserId };
}
