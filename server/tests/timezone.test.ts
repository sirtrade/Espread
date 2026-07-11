import { describe, expect, it } from "vitest";
import { isValidTimezone } from "../src/lib/timezone.js";

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
