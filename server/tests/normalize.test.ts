import { describe, expect, it } from "vitest";
import { normalizeTerm } from "../src/domain/normalize.js";

describe("normalizeTerm", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeTerm("¡Hola!")).toBe("hola");
    expect(normalizeTerm("¿Qué tal?")).toBe("qué tal");
  });

  it("collapses whitespace", () => {
    expect(normalizeTerm("  de   repente  ")).toBe("de repente");
  });

  it("keeps Spanish diacritics", () => {
    expect(normalizeTerm("Ñoño")).toBe("ñoño");
    expect(normalizeTerm("MAÑANA")).toBe("mañana");
  });

  it("strips surrounding quotes", () => {
    expect(normalizeTerm('"sin embargo"')).toBe("sin embargo");
  });
});
