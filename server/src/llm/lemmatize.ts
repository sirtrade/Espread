import { z } from "zod";
import { callJsonLLM } from "./callJson.js";
import { config } from "../lib/config.js";

// `lemmas` is REQUIRED here (unlike articleStepSchema, where a missing field
// degrades to []): an omission makes callJsonLLM feed the validation error
// back and retry once, instead of silently producing an empty registry.
const lemmatizeSchema = z.object({
  lemmas: z.array(z.string().min(1).max(80)).max(500),
});

/**
 * Recovers content-word lemmas for an article that has none stored: articles
 * generated before the lemmas contract existed, or whose writer silently
 * omitted the field. Mirrors the writer-step instructions so the result feeds
 * `normalizeArticleLemmas` unchanged. Called at most once per article — the
 * caller persists the result on the article row.
 */
export async function extractArticleLemmas(userId: number, body: string): Promise<string[]> {
  const system =
    "Eres un lingüista computacional. Del texto español dado extrae los lemas " +
    "(formas de diccionario) de las palabras con contenido semántico que aparecen en él. " +
    "Excluye artículos, pronombres, preposiciones, conjunciones, auxiliares y nombres propios; " +
    "incluye cada lema una sola vez. " +
    'Responde ÚNICAMENTE con JSON: {"lemmas": string[]}.';

  const result = await callJsonLLM({
    system,
    messages: [{ role: "user", content: body }],
    schema: lemmatizeSchema,
    kind: "lemmatize",
    userId,
    model: config.MODEL,
    maxTokens: 1536,
  });
  return result.lemmas;
}
