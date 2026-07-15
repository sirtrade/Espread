import { z } from "zod";
import { callJsonLLM } from "./callJson.js";
import { reviewItemSchema } from "./schemas.js";
import { config } from "../lib/config.js";

const EXPLAIN_LANG_NAME: Record<"ru" | "en" | "es", string> = {
  ru: "ruso",
  en: "inglés",
  es: "español simple",
};

// Same card shape as the review, minus surface (the legacy term IS the
// surface form, we keep it in code), plus the row id to match results back.
export const enrichmentItemSchema = reviewItemSchema.omit({ surface: true }).extend({
  id: z.number().int(),
});
export type EnrichmentItem = z.infer<typeof enrichmentItemSchema>;

export const enrichmentSchema = z.object({
  items: z.array(enrichmentItemSchema),
});

export interface EnrichBankInput {
  id: number;
  term: string;
  translation: string | null;
  context: string | null;
}

export const ENRICHMENT_DISTRACTOR_INSTRUCTION =
  `- "distractors": genera entre 5 y 8 opciones españolas semánticamente plausibles de la misma categoría ` +
  `gramatical, relacionadas con un tema cercano y de longitud y registro parecidos. No deben ser sinónimos, ` +
  `variantes flexionadas ni formas derivadas del lemma; deben funcionar como respuestas incorrectas creíbles.\n`;

/**
 * One-off backfill for bank rows created before the lemma migration: turns a
 * legacy (term, dirty translation, context) triple into the structured card
 * fields the new schema expects.
 */
export async function enrichBankItems(params: {
  userId: number;
  level: string;
  explainLang: "ru" | "en" | "es";
  items: EnrichBankInput[];
}): Promise<EnrichmentItem[]> {
  if (params.items.length === 0) return [];

  const lang = EXPLAIN_LANG_NAME[params.explainLang];
  const system =
    `Eres un lexicógrafo de español que normaliza fichas de vocabulario de un estudiante de nivel ${params.level}. ` +
    `Cada entrada trae: "id", "term" (la forma tal como se marcó en un texto, puede estar flexionada), ` +
    `"translation" (posiblemente sucia: mezcla traducción, explicación y el original español) y "context" ` +
    `(la oración donde apareció, puede ser null). ` +
    `Para cada entrada devuelve una ficha limpia. Responde ÚNICAMENTE con JSON: ` +
    `{"items": [{"id": number, "lemma": string, "pos": "verb"|"noun"|"adj"|"adv"|"phrase"|"other", ` +
    `"gender": "m"|"f"|null, "translation": string, "note": string|null, "contextTranslation": string|null, ` +
    `"freqBand": "top1000"|"top3000"|"top5000"|"rare", "distractors": [string, ...]}]}.\n` +
    `Reglas:\n` +
    `- "lemma": forma de diccionario del term: verbo en infinitivo (con -se si es pronominal), sustantivo en singular, ` +
    `adjetivo en masculino singular; expresiones en forma neutra.\n` +
    `- "gender": solo para sustantivos; null en los demás casos.\n` +
    `- "translation": traducción CORTA del lemma en ${lang}: máximo 5 palabras, sin paréntesis, sin guiones largos, ` +
    `sin español dentro. Si la traducción vieja traía explicaciones, muévelas a "note".\n` +
    `- "note": opcional, en ${lang}: matices de uso y todo lo que no sea la traducción.\n` +
    `- "contextTranslation": traducción de "context" en ${lang}; null si context es null.\n` +
    `- "freqBand": "top1000", "top3000", "top5000" o "rare" (fuera de las 5000 más frecuentes o muy especializado).\n` +
    ENRICHMENT_DISTRACTOR_INSTRUCTION +
    `- Devuelve una ficha por cada entrada, con su mismo "id".`;

  const result = await callJsonLLM({
    system,
    messages: [{ role: "user", content: `Entradas: ${JSON.stringify(params.items)}` }],
    schema: enrichmentSchema,
    kind: "enrich",
    userId: params.userId,
    model: config.MODEL,
    maxTokens: 4096,
  });
  return result.items;
}
