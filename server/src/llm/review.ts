import { callJsonLLM } from "./callJson.js";
import { reviewSchema, type ReviewResult } from "./schemas.js";
import { config } from "../lib/config.js";
import type { Mark } from "../domain/marks.js";

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
  marks: Mark[];
}

/**
 * Single LLM call implementing the "Terminé" review: turns the reader's
 * marks into structured vocabulary cards (lemma, POS, short translation,
 * usage note, sentence translation, frequency band, quiz distractors).
 * Adjacent marks that form one construction are merged into one card.
 */
export async function reviewMarkedItems(params: ReviewParams): Promise<ReviewResult> {
  if (params.marks.length === 0) {
    return { items: [] };
  }

  const lang = EXPLAIN_LANG_NAME[params.explainLang];
  const system =
    `Eres un profesor de español que ayuda a un estudiante de nivel ${params.level}. ` +
    `El estudiante marcó palabras, fragmentos y oraciones que no entendió mientras leía el artículo. ` +
    `Convierte las marcas en fichas de vocabulario. Responde ÚNICAMENTE con JSON: ` +
    `{"items": [{"surface": string, "lemma": string, "pos": "verb"|"noun"|"adj"|"adv"|"phrase"|"other", ` +
    `"gender": "m"|"f"|null, "translation": string, "note": string|null, ` +
    `"grammar": {"label": string, "explanation": string}|null, "contextTranslation": string|null, ` +
    `"freqBand": "top1000"|"top3000"|"top5000"|"rare", "distractors": [string, string, string]}]}.\n` +
    `Reglas para cada ficha:\n` +
    `- "surface": la forma EXACTA tal como aparece en el texto (p. ej. "perfila", "lanzamientos", "se llama").\n` +
    `- "lemma": la forma de diccionario: verbo en infinitivo (con -se si es pronominal: "perfilarse", "llamarse"), ` +
    `sustantivo en singular, adjetivo en masculino singular. Para expresiones, la forma neutra ("llegar cargado de").\n` +
    `- "pos": categoría gramatical; usa "phrase" para expresiones de varias palabras.\n` +
    `- "gender": solo para sustantivos ("m" o "f"); null en los demás casos.\n` +
    `- "translation": traducción CORTA del lemma en ${lang}: máximo 5 palabras, sin paréntesis, sin guiones largos, ` +
    `sin repetir el original español dentro. SOLO la traducción.\n` +
    `- "note": opcional, en ${lang}: matices de uso léxico y régimen preposicional. ` +
    `Todo lo que NO sea la traducción ni el análisis gramatical de "grammar" va aquí, nunca en "translation".\n` +
    `- "grammar": objeto {"label", "explanation"} o null. Rellénalo SOLO cuando la forma marcada (surface) sea ` +
    `un verbo en SUBJUNTIVO. "label": el tiempo del subjuntivo en español ("subjuntivo presente", ` +
    `"subjuntivo imperfecto", "subjuntivo pretérito perfecto", etc.). "explanation": en ${lang}, explica por qué ` +
    `se usa el subjuntivo AQUÍ: nombra el disparador concreto de esta oración (la conjunción, el verbo o la ` +
    `construcción que lo exige: deseo/ojalá, duda o negación, "para que"/"antes de que"/"cuando"+futuro, ` +
    `antecedente indefinido o hipotético tras "que", etc.) y por qué el indicativo sería incorrecto. 2-3 frases claras. ` +
    `Para cualquier forma que NO sea subjuntivo (indicativo, sustantivos, adjetivos...), "grammar": null.\n` +
    `- "contextTranslation": traducción en ${lang} de la oración marcada (campo "sentence" de la marca). ` +
    `Null solo si la marca no trae oración.\n` +
    `- "freqBand": banda de frecuencia del lemma en español: "top1000", "top3000", "top5000" (dentro de las ` +
    `1000/3000/5000 palabras más frecuentes) o "rare" (fuera de las 5000 más frecuentes, término especializado o nombre propio).\n` +
    `- "distractors": exactamente 3 palabras españolas de la MISMA categoría gramatical y nivel parecido, ` +
    `que NO sean sinónimos del lemma (se usan como opciones incorrectas en un quiz).\n` +
    `Reglas de agrupación:\n` +
    `- Marcas vecinas de la misma oración que forman UNA construcción se combinan en UNA sola ficha: ` +
    `clítico + verbo ("se" + "llama" → lemma "llamarse"), perífrasis ("llega" + "cargado de" → "llegar cargado de").\n` +
    `- Un clítico o artículo marcado solo, sin pareja en la oración ("se", "lo", "la"): no merece ficha propia; ` +
    `devuélvelo con freqBand "rare" y explica en "note" qué función cumple en esa oración.\n` +
    `- Para una oración completa marcada: traduce la oración en "contextTranslation" y elige como ficha la ` +
    `construcción o palabra (2-4 palabras máximo) que más probablemente causó la dificultad.\n` +
    `- No dupliques fichas: si dos marcas llevan al mismo lemma, devuelve una sola ficha.`;

  const marksPayload = params.marks.map((m) => ({ text: m.text, sentence: m.sentence, kind: m.kind }));
  const userContent =
    `Artículo:\nTítulo: ${params.articleTitle}\n${params.articleBody}\n\n` +
    `Marcas del estudiante: ${JSON.stringify(marksPayload)}`;

  return callJsonLLM({
    system,
    messages: [{ role: "user", content: userContent }],
    schema: reviewSchema,
    kind: "review",
    userId: params.userId,
    model: config.MODEL,
    maxTokens: 4096,
  });
}
