import { describe, expect, it } from "vitest";
import { isValidTimezone, localDayKey } from "../src/lib/timezone.js";

describe("isValidTimezone", () => {
  it("accepts IANA identifiers", () => {
    expect(isValidTimezone("Europe/Madrid")).toBe(true);
    expect(isValidTimezone("America/Mexico_City")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
  });

  it("rejects garbage that would crash the scheduler", () => {
    expect(isValidTimezone("Not/AZone")).toBe(false);
    expect(isValidTimezone("'; DROP TABLE users;--")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});

describe("localDayKey", () => {
  it("formats the day as YYYY-MM-DD in UTC", () => {
    expect(localDayKey(Date.UTC(2026, 0, 10, 9, 0, 0), "UTC")).toBe("2026-01-10");
  });

  it("shifts the day forward for an east-of-UTC zone at late UTC hours", () => {
    // 2026-01-10 23:00 UTC is already 2026-01-11 02:00 in Moscow (UTC+3).
    expect(localDayKey(Date.UTC(2026, 0, 10, 23, 0, 0), "Europe/Moscow")).toBe("2026-01-11");
  });

  it("shifts the day back for a west-of-UTC zone at early UTC hours", () => {
    // 2026-01-11 07:00 UTC is still 2026-01-10 23:00 in Los Angeles (UTC−8).
    expect(localDayKey(Date.UTC(2026, 0, 11, 7, 0, 0), "America/Los_Angeles")).toBe("2026-01-10");
  });

  it("falls back to UTC for an unrecognized zone instead of throwing", () => {
    // A bad stored timezone must not crash the anti-farm check.
    expect(localDayKey(Date.UTC(2026, 0, 10, 9, 0, 0), "Not/AZone")).toBe("2026-01-10");
  });
});
