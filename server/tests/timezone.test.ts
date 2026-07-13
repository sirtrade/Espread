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
  it("reports the UTC calendar day", () => {
    expect(localDayKey(Date.UTC(2026, 0, 10, 9, 0, 0), "UTC")).toBe("2026-01-10");
  });

  it("shifts the day forward for a zone east of UTC", () => {
    // 23:00 UTC is already the next local day in UTC+3.
    expect(localDayKey(Date.UTC(2026, 0, 10, 23, 0, 0), "Europe/Moscow")).toBe("2026-01-11");
  });

  it("shifts the day back for a zone west of UTC", () => {
    // 01:00 UTC is still the previous local day in UTC−8.
    expect(localDayKey(Date.UTC(2026, 0, 11, 1, 0, 0), "America/Los_Angeles")).toBe("2026-01-10");
  });

  it("falls back to UTC for an unrecognized zone instead of throwing", () => {
    expect(localDayKey(Date.UTC(2026, 0, 10, 9, 0, 0), "Not/AZone")).toBe("2026-01-10");
  });
});
