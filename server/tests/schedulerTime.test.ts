import { describe, expect, it } from "vitest";
import { localDateStr, localHHMM, subtractMinutes } from "../src/scheduler/time.js";

describe("subtractMinutes", () => {
  it("subtracts within the same day", () => {
    expect(subtractMinutes("08:00", 5)).toBe("07:55");
  });

  it("wraps around midnight", () => {
    expect(subtractMinutes("00:02", 5)).toBe("23:57");
  });

  it("handles zero minutes", () => {
    expect(subtractMinutes("12:30", 0)).toBe("12:30");
  });
});

describe("localHHMM / localDateStr", () => {
  it("formats a known UTC instant correctly in UTC", () => {
    const d = new Date("2026-01-15T08:05:00Z");
    expect(localHHMM(d, "UTC")).toBe("08:05");
    expect(localDateStr(d, "UTC")).toBe("2026-01-15");
  });

  it("shifts across the date line for a different timezone", () => {
    const d = new Date("2026-01-15T23:30:00Z");
    expect(localDateStr(d, "Pacific/Auckland")).toBe("2026-01-16");
  });
});
