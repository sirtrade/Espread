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
    `"gender": "m"|"f"|null, "translation": string, "note": string|null, ` +
    `"grammar": {"label": string, "explanation": string}|null, "contextTranslation": string|null, ` +
    `"freqBand": "top1000"|"top3000"|"top5000"|"rare", "distractors": [string, string, string]}]}.\n` +
    `Reglas:\n` +
    `- "lemma": forma de diccionario del term: verbo en infinitivo (con -se si es pronominal), sustantivo en singular, ` +
    `adjetivo en masculino singular; expresiones en forma neutra.\n` +
    `- "gender": solo para sustantivos; null en los demás casos.\n` +
    `- "translation": traducción CORTA del lemma en ${lang}: máximo 5 palabras, sin paréntesis, sin guiones largos, ` +
    `sin español dentro. Si la traducción vieja traía explicaciones, muévelas a "note".\n` +
    `- "note": opcional, en ${lang}: matices de uso léxico y todo lo que no sea la traducción ni "grammar".\n` +
    `- "grammar": objeto {"label", "explanation"} o null. Solo si el "term" (o su "context") está en SUBJUNTIVO: ` +
    `"label" = el tiempo del subjuntivo en español; "explanation" en ${lang} = por qué se usa el subjuntivo ahí ` +
    `(el disparador que lo exige) y por qué no el indicativo. En cualquier otro caso, null.\n` +
    `- "contextTranslation": traducción de "context" en ${lang}; null si context es null.\n` +
    `- "freqBand": "top1000", "top3000", "top5000" o "rare" (fuera de las 5000 más frecuentes o muy especializado).\n` +
    `- "distractors": exactamente 3 palabras españolas de la misma categoría gramatical, no sinónimas del lemma.\n` +
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
