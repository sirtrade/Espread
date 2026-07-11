import { callJsonLLM } from "./callJson.js";
import { sentenceCheckSchema, type SentenceCheckResult } from "./schemas.js";
import { config } from "../lib/config.js";

const EXPLAIN_LANG_NAME: Record<"ru" | "en" | "es", string> = {
  ru: "ruso",
  en: "inglés",
  es: "español simple",
};

export interface SentenceCheckParams {
  userId: number;
  level: string;
  explainLang: "ru" | "en" | "es";
  term: string;
  translation: string | null;
  sentence: string;
}

/**
 * Practice exercise: the student writes their own sentence using a bank
 * term; the model verifies the usage and returns feedback plus a corrected
 * version when something is off.
 */
export async function checkPracticeSentence(params: SentenceCheckParams): Promise<SentenceCheckResult> {
  const system =
    `Eres un profesor de español que corrige a un estudiante de nivel ${params.level}. ` +
    `El estudiante debía escribir UNA frase en español usando la palabra o expresión objetivo. ` +
    `Evalúa: (1) ¿usó la palabra objetivo con su significado correcto?, (2) ¿la frase es gramaticalmente correcta y natural? ` +
    `Sé indulgente con tildes y puntuación menor. Da el feedback en ${EXPLAIN_LANG_NAME[params.explainLang]}, máximo 2 frases, en tono alentador. ` +
    `Si la frase tiene errores o la palabra está mal usada, "ok" es false y "corrected" contiene la frase corregida en español; ` +
    `si todo está bien, "ok" es true y "corrected" es null. ` +
    `Responde ÚNICAMENTE con JSON: {"ok": boolean, "feedback": string, "corrected": string|null}.`;

  const userContent =
    `Palabra objetivo: ${params.term}` +
    (params.translation ? ` (significado: ${params.translation})` : "") +
    `\nFrase del estudiante: ${params.sentence}`;

  return callJsonLLM({
    system,
    messages: [{ role: "user", content: userContent }],
    schema: sentenceCheckSchema,
    kind: "practice",
    userId: params.userId,
    model: config.MODEL,
    maxTokens: 512,
  });
}
