import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { InitDataError, validateInitData } from "../src/auth/telegramInitData.js";

const BOT_TOKEN = "123456:TEST-TOKEN";

function buildInitData(fields: Record<string, string>): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("validateInitData", () => {
  it("accepts correctly signed initData and extracts the user", () => {
    const initData = buildInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 42, username: "alice" }),
      query_id: "abc",
    });
    const result = validateInitData(initData, BOT_TOKEN);
    expect(result.user.id).toBe(42);
    expect(result.user.username).toBe("alice");
  });

  it("rejects a tampered payload", () => {
    const initData = buildInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 42 }),
    });
    const tampered = initData.replace("42", "99");
    expect(() => validateInitData(tampered, BOT_TOKEN)).toThrow(InitDataError);
  });

  it("rejects a signature made with the wrong bot token", () => {
    const initData = buildInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 42 }),
    });
    expect(() => validateInitData(initData, "other:token")).toThrow(InitDataError);
  });

  it("rejects stale initData beyond maxAgeSeconds", () => {
    const initData = buildInitData({
      auth_date: String(Math.floor(Date.now() / 1000) - 999_999),
      user: JSON.stringify({ id: 42 }),
    });
    expect(() => validateInitData(initData, BOT_TOKEN, 86400)).toThrow(InitDataError);
  });

  it("rejects missing hash", () => {
    expect(() => validateInitData("user=%7B%22id%22%3A1%7D", BOT_TOKEN)).toThrow(InitDataError);
  });
});
