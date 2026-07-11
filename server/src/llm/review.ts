import { callJsonLLM } from "./callJson.js";
import { reviewSchema, type ReviewResult } from "./schemas.js";
import { config } from "../lib/config.js";

const EXPLAIN_LANG_NAME: Record<"ru" | "en" | "es", string> = {
  ru: "ruso",
  en: "inglés",
  es: "español (modo monolingüe: parafrasea en español simple, no traduzcas)",
};

export interface ReviewParams {
  userId: number;
  articleTitle: string;
  articleBody: string;
  level: string;
  explainLang: "ru" | "en" | "es";
  markedWords: string[];
  markedSents: string[];
}

/**
 * Single LLM call implementing TZ 4.2.3 "Terminé" review: contextual
 * translation + frequency verdict for marked words, explanation + optional
 * "clave" idiom extraction for marked phrases.
 */
export async function reviewMarkedItems(params: ReviewParams): Promise<ReviewResult> {
  if (params.markedWords.length === 0 && params.markedSents.length === 0) {
    return { words: [], phrases: [] };
  }

  const system =
    `Eres un profesor de español que ayuda a un estudiante de nivel ${params.level}. ` +
    `Explica en ${EXPLAIN_LANG_NAME[params.explainLang]}. ` +
    `Para cada PALABRA marcada: da su traducción/significado según el contexto del artículo, y un veredicto de frecuencia: ` +
    `"alta" si pertenece al vocabulario de las ~5000-7000 palabras más frecuentes del español o es vocabulario temático útil, ` +
    `"baja" si es rara, nombre propio, o término muy especializado. ` +
    `En el campo "term" devuelve la palabra o frase EXACTAMENTE como fue marcada (sin lematizar ni corregir). ` +
    `Para cada FRASE marcada: explica su significado en contexto, y si contiene una construcción o modismo frecuente de 2 a 4 palabras ` +
    `que causó la dificultad, extráelo en el campo "clave" (si no aplica o no es frecuente, usa null). ` +
    `Responde ÚNICAMENTE con JSON: {"words": [{"term": string, "translation": string, "frequency": "alta"|"baja"}], ` +
    `"phrases": [{"term": string, "explanation": string, "clave": string|null}]}.`;

  const userContent =
    `Artículo:\nTítulo: ${params.articleTitle}\n${params.articleBody}\n\n` +
    `Palabras marcadas: ${JSON.stringify(params.markedWords)}\n` +
    `Frases marcadas: ${JSON.stringify(params.markedSents)}`;

  return callJsonLLM({
    system,
    messages: [{ role: "user", content: userContent }],
    schema: reviewSchema,
    kind: "review",
    userId: params.userId,
    model: config.MODEL,
    maxTokens: 2048,
  });
}
