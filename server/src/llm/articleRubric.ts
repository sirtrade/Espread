/**
 * CEFR level guidance for article generation and quality auditing.
 *
 * The old approach reduced "level" to a frequency ceiling plus, for C2, a vague
 * push toward rare words and a literary register. That made the writer chase
 * ornate vocabulary and unusual constructions instead of producing text a
 * native journalist would actually write — a C1 article dressed up with words
 * nobody uses. This module replaces that with explicit, per-level descriptions
 * of natural grammar, sentence length, cohesion and register, plus a shared set
 * of naturalness rules that apply to every level.
 */

export type CefrLevel = "A2" | "B1" | "B2" | "C1" | "C2";

/** Levels that cap vocabulary to the N most frequent words. C2 is uncapped. */
type CappedLevel = Exclude<CefrLevel, "C2">;

/** How deep into the Spanish frequency list the article vocabulary may go. */
export const LEVEL_FREQ_CAP: Record<CappedLevel, number> = {
  A2: 1500,
  B1: 2500,
  B2: 3500,
  C1: 5000,
};

/**
 * Rules that hold at EVERY level: the point is authenticity, not difficulty.
 * These directly target the failure mode we saw (a "C2" text stuffed with rare
 * words, decorative fragments and unnatural collocations).
 */
export const NATURALNESS_RULES =
  "REGLAS DE NATURALIDAD (para cualquier nivel): " +
  "El texto debe sonar como periodismo real que escribiría un hablante nativo, no como un ejercicio de vocabulario. " +
  "Prioriza colocaciones habituales y el modo normal de decir las cosas; evita calcos, rebuscamientos y arcaísmos decorativos. " +
  "No uses una palabra rara si existe una común que dice lo mismo con naturalidad. " +
  "Escribe oraciones completas y bien formadas: nada de fragmentos sin verbo presentados como frases por efecto. " +
  "Evita los clichés periodísticos vacíos. La complejidad debe servir al significado, nunca ser un adorno para aparentar dificultad.";

/** Concise description of what natural text looks like at each level. */
export const LEVEL_PROFILES: Record<CefrLevel, string> = {
  A2:
    "Nivel A2: frases cortas y directas (sujeto-verbo-objeto), presente y pasados básicos, conectores simples (y, pero, porque, cuando). " +
    "Vocabulario cotidiano y concreto. Evita subjuntivo, voz pasiva y subordinadas largas.",
  B1:
    "Nivel B1: oraciones algo más largas con subordinadas frecuentes, pasados y futuro, condicional y subjuntivo sencillos cuando surjan de forma natural. " +
    "Vocabulario general con algún término temático explicado por el contexto.",
  B2:
    "Nivel B2: prosa fluida con subordinación variada, buen uso de tiempos y modos, conectores de contraste y causa. " +
    "Vocabulario amplio y preciso; algún término especializado si el tema lo pide, siempre natural.",
  C1:
    "Nivel C1: sintaxis compleja y bien controlada, matices con subjuntivo y condicional, cohesión cuidada y registro periodístico serio. " +
    "Vocabulario rico pero idiomático. NO recurras a palabras raras, arcaísmos ni frases nominales sin verbo para 'sonar difícil'.",
  C2:
    "Nivel C2: dominio casi nativo. Lo que distingue a C2 no es usar palabras más raras, sino la PRECISIÓN, las colocaciones naturales, " +
    "las expresiones idiomáticas bien empleadas y la flexibilidad de registro. Debe leerse sin esfuerzo, como escribiría un periodista culto nativo, " +
    "no como una demostración de vocabulario. Evita la acumulación de términos infrecuentes y las metáforas recargadas.",
};

/** Frequency framing for the write step; exported for tests. */
export function frequencyInstruction(level: CefrLevel): string {
  if (level === "C2") {
    // Near-native: no frequency ceiling, but explicitly NOT a mandate to hunt
    // for rare words. Richness comes from precision and idiom, not obscurity.
    return (
      "Sin restricción de frecuencia léxica, pero eso NO significa buscar palabras raras: " +
      "usa el vocabulario natural y preciso que emplearía un nativo culto, con expresiones idiomáticas donde encajen. " +
      "No acumules términos infrecuentes ni un registro artificialmente literario."
    );
  }
  const cap = LEVEL_FREQ_CAP[level];
  return (
    `Usa casi exclusivamente vocabulario dentro de las ~${cap} palabras más frecuentes del español. ` +
    `Palabras raras o muy especializadas: solo si son imprescindibles para la noticia, máximo 2-3 por artículo; ` +
    `si existe un sinónimo común, usa el sinónimo. ` +
    `Los nombres propios y las palabras del vocabulario del estudiante indicadas aparte quedan fuera de esta restricción.`
  );
}

/** Full language guidance injected into the writer's system prompt. */
export function writerGuidance(level: CefrLevel): string {
  return `${LEVEL_PROFILES[level]} ${frequencyInstruction(level)} ${NATURALNESS_RULES}`;
}

/** Guidance injected into the independent quality auditor's system prompt. */
export function auditRubric(level: CefrLevel): string {
  return `${LEVEL_PROFILES[level]} ${NATURALNESS_RULES}`;
}
