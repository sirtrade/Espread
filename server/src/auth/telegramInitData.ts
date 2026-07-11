import crypto from "node:crypto";
import { z } from "zod";

const telegramUserSchema = z.object({
  id: z.number().int(),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  language_code: z.string().optional(),
});

export interface ValidatedInitData {
  user: z.infer<typeof telegramUserSchema>;
  authDate: number;
}

export class InitDataError extends Error {}

/**
 * Validates Telegram Mini App `initData` per the official algorithm:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * secret_key = HMAC_SHA256("WebAppData", bot_token)
 * check_hash = HMAC_SHA256(secret_key, data_check_string)  (hex)
 * data_check_string = all fields except `hash`, "key=value" sorted by key, joined by "\n"
 */
export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400,
): ValidatedInitData {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new InitDataError("Missing hash");
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const a = Buffer.from(computedHash, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new InitDataError("Invalid initData signature");
  }

  const authDateRaw = params.get("auth_date");
  if (!authDateRaw) throw new InitDataError("Missing auth_date");
  const authDate = Number(authDateRaw);
  if (Date.now() / 1000 - authDate > maxAgeSeconds) {
    throw new InitDataError("initData expired");
  }

  const userRaw = params.get("user");
  if (!userRaw) throw new InitDataError("Missing user");
  const userParsed = telegramUserSchema.safeParse(JSON.parse(userRaw));
  if (!userParsed.success) throw new InitDataError("Malformed user field");

  return { user: userParsed.data, authDate };
}
