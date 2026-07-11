import { describe, expect, it } from "vitest";
import { findTermContext } from "../src/domain/context.js";

const BODY =
  "El mercado abrió temprano. Los vendedores ofrecían frutas frescas, ¡y el aguacate estaba barato!\n" +
  "Más tarde llegó la lluvia. Todos corrieron a refugiarse bajo los toldos.";

describe("findTermContext", () => {
  it("returns the sentence containing the term", () => {
    expect(findTermContext(BODY, "aguacate")).toBe(
      "Los vendedores ofrecían frutas frescas, ¡y el aguacate estaba barato!",
    );
  });

  it("matches case- and punctuation-insensitively", () => {
    expect(findTermContext(BODY, "AGUACATE")).toContain("aguacate");
  });

  it("matches multi-word phrases", () => {
    expect(findTermContext(BODY, "frutas frescas")).toContain("frutas frescas");
  });

  it("does not match a term inside another word", () => {
    // "toldos" contains "toldo" as prefix but not as a whole word
    expect(findTermContext(BODY, "toldo")).toBeNull();
  });

  it("returns null when the term is absent", () => {
    expect(findTermContext(BODY, "biblioteca")).toBeNull();
  });

  it("truncates very long sentences", () => {
    const long = `El aguacate ${"muy ".repeat(200)}caro.`;
    const ctx = findTermContext(long, "aguacate");
    expect(ctx).not.toBeNull();
    expect(ctx!.length).toBeLessThanOrEqual(300);
  });
});
