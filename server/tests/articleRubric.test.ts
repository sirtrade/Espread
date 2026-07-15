import { describe, expect, it } from "vitest";
import {
  auditRubric,
  frequencyInstruction,
  LEVEL_FREQ_CAP,
  LEVEL_PROFILES,
  NATURALNESS_RULES,
  writerGuidance,
  type CefrLevel,
} from "../src/llm/articleRubric.js";

const CAPPED = ["A2", "B1", "B2", "C1"] as const;
const ALL_LEVELS: CefrLevel[] = ["A2", "B1", "B2", "C1", "C2"];

describe("CEFR frequency caps", () => {
  it("keeps the agreed cap per capped level", () => {
    expect(LEVEL_FREQ_CAP).toEqual({ A2: 1500, B1: 2500, B2: 3500, C1: 5000 });
  });

  it.each(CAPPED)("frames %s within its frequency band", (level) => {
    const instruction = frequencyInstruction(level);
    expect(instruction).toContain(`~${LEVEL_FREQ_CAP[level]} palabras más frecuentes`);
    expect(instruction).toContain("sinónimo");
    expect(instruction).toContain("nombres propios");
  });

  it("does not cap C2 and does not push it toward rare words", () => {
    expect("C2" in LEVEL_FREQ_CAP).toBe(false);
    const instruction = frequencyInstruction("C2");
    expect(instruction).toContain("Sin restricción de frecuencia");
    expect(instruction).not.toContain("palabras más frecuentes");
    // The whole point of the change: C2 must NOT be told to hunt for rare words.
    expect(instruction).not.toContain("palabras poco comunes");
    expect(instruction).toContain("NO significa buscar palabras raras");
  });
});

describe("naturalness rules", () => {
  it("forbids the failure modes we saw (rare-word stuffing, fragments, calques)", () => {
    expect(NATURALNESS_RULES).toContain("colocaciones");
    expect(NATURALNESS_RULES).toContain("calcos");
    expect(NATURALNESS_RULES).toContain("fragmentos");
    expect(NATURALNESS_RULES.toLowerCase()).toContain("adorno");
  });

  it("is part of both the writer and auditor guidance", () => {
    for (const level of ALL_LEVELS) {
      expect(writerGuidance(level)).toContain(NATURALNESS_RULES);
      expect(auditRubric(level)).toContain(NATURALNESS_RULES);
    }
  });
});

describe("level profiles", () => {
  it("describes every level", () => {
    for (const level of ALL_LEVELS) {
      expect(LEVEL_PROFILES[level]).toContain(`Nivel ${level}`);
      expect(writerGuidance(level)).toContain(LEVEL_PROFILES[level]);
    }
  });

  it("distinguishes C2 by precision and idiom, not obscurity", () => {
    expect(LEVEL_PROFILES.C2).toContain("PRECISIÓN");
    expect(LEVEL_PROFILES.C2).toContain("colocaciones naturales");
  });

  it("tells C1 not to fake difficulty with rare words or verbless phrases", () => {
    expect(LEVEL_PROFILES.C1).toContain("NO recurras a palabras raras");
  });

  it("writer guidance combines profile, frequency framing and naturalness rules", () => {
    const guidance = writerGuidance("B2");
    expect(guidance).toContain(LEVEL_PROFILES.B2);
    expect(guidance).toContain(frequencyInstruction("B2"));
    expect(guidance).toContain(NATURALNESS_RULES);
  });
});
