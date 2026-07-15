import type Anthropic from "@anthropic-ai/sdk";
import { callJsonLLM } from "./callJson.js";
import { articleStepSchema, searchStepSchema, type ArticleStepResult } from "./schemas.js";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";

const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
};

export type CefrLevel = "A2" | "B1" | "B2" | "C1" | "C2";

export interface GenerateArticleParams {
  userId: number;
  level: CefrLevel;
  topic: string;
  targetTerms: string[];
}

/** Levels that cap vocabulary to the N most frequent words. C2 (near-native) is uncapped. */
type CappedLevel = Exclude<CefrLevel, "C2">;

/** How deep into the Spanish frequency list the article vocabulary may go. */
export const LEVEL_FREQ_CAP: Record<CappedLevel, number> = {
  A2: 1500,
  B1: 2500,
  B2: 3500,
  C1: 5000,
};

/** Frequency framing for the write step; exported for tests. */
export function frequencyInstruction(level: CefrLevel): string {
  if (level === "C2") {
    // Near-native: no frequency ceiling. Encourage a rich, natural register instead.
    return (
      `Sin restricción de frecuencia léxica: usa vocabulario rico y natural de nivel casi nativo, ` +
      `incluyendo palabras poco comunes, matices, expresiones idiomáticas y un registro de revista o literario cuando encaje. ` +
      `El texto debe sonar auténtico para un hablante avanzado, sin simplificar el idioma.`
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

export interface GeneratedArticle extends ArticleStepResult {
  sourceName: string | null;
  sourceUrl: string | null;
}

async function runSearchStep(userId: number, topic: string) {
  const system =
    "Eres un periodista que investiga noticias reales y recientes para lectores que aprenden español. " +
    "Usa la herramienta de búsqueda web para encontrar UNA noticia real, verificable y reciente sobre el tema dado. " +
    "Resume los hechos con tus propias palabras (5-7 frases), en español neutro. " +
    "PROHIBIDO copiar o parafrasear muy de cerca las frases del artículo original: usa tus propias palabras. " +
    "Responde ÚNICAMENTE con JSON: {\"facts\": string, \"source_name\": string, \"source_url\": string}.";

  return callJsonLLM({
    system,
    messages: [{ role: "user", content: `Tema: ${topic}` }],
    schema: searchStepSchema,
    kind: "search",
    userId,
    model: config.MODEL,
    maxTokens: 1024,
    tools: [WEB_SEARCH_TOOL],
  });
}

async function runWriteStep(params: {
  userId: number;
  level: GenerateArticleParams["level"];
  topic: string;
  targetTerms: string[];
  facts: { facts: string; sourceName: string } | null;
}): Promise<ArticleStepResult> {
  const targetTermsBlock =
    params.targetTerms.length > 0
      ? `Vocabulario del estudiante (OPCIONAL) — intenta incorporar de forma NATURAL, sin marcarlas ni destacarlas, ` +
        `estas palabras/frases españolas SOLO donde encajen bien en el tema. No las fuerces: si alguna no queda ` +
        `natural, simplemente OMÍTELA (mejor pocas y bien puestas que todas metidas a la fuerza). Son lemas: ` +
        `úsalas en cualquier forma flexionada que suene natural (conjugada, en plural, etc.): ` +
        `${params.targetTerms.join(", ")}. ` +
        `En el JSON, en "usedTerms" lista exactamente cuáles de esos lemas usaste realmente (puede ser una lista vacía).`
      : "";

  const factsBlock = params.facts
    ? `Basa el artículo estrictamente en estos hechos (no inventes datos adicionales, cifras exactas ni citas que no estén aquí):\n${params.facts.facts}\nFuente: ${params.facts.sourceName}`
    : "No tienes una fuente verificada disponible. Escribe un artículo periodístico plausible y genérico sobre el tema, " +
      "evitando por completo cifras exactas, estadísticas precisas y citas textuales inventadas.";

  const system =
    `Eres un redactor que escribe artículos originales en español latinoamericano neutro, estilo revista, ` +
    `para un estudiante de nivel ${params.level} (Marco Común Europeo). ` +
    `El artículo debe tener entre 250 y 320 palabras, párrafos cortos, vocabulario y gramática apropiados para el nivel ${params.level}. ` +
    `${frequencyInstruction(params.level)} ` +
    `${targetTermsBlock}\n` +
    `Responde ÚNICAMENTE con JSON: {"title": string, "body": string, "usedTerms": string[]}.`;

  return callJsonLLM({
    system,
    messages: [{ role: "user", content: factsBlock }],
    schema: articleStepSchema,
    kind: "generate",
    userId: params.userId,
    model: config.MODEL,
    maxTokens: 2048,
  });
}

/**
 * Two-step article generation (TZ 4.2.1): a web-search-grounded facts step,
 * then a no-search writing step. If the search step fails twice, falls back
 * to a sourceless article with a strict no-fabrication instruction.
 */
export async function generateArticle(params: GenerateArticleParams): Promise<GeneratedArticle> {
  let search: Awaited<ReturnType<typeof runSearchStep>> | null = null;
  try {
    search = await runSearchStep(params.userId, params.topic);
  } catch (err) {
    logger.warn({ err, topic: params.topic }, "Article search step failed, retrying once");
    try {
      search = await runSearchStep(params.userId, params.topic);
    } catch (err2) {
      logger.warn({ err: err2, topic: params.topic }, "Article search step failed twice, using fallback (no source)");
      search = null;
    }
  }

  const article = await runWriteStep({
    userId: params.userId,
    level: params.level,
    topic: params.topic,
    targetTerms: params.targetTerms,
    facts: search ? { facts: search.facts, sourceName: search.source_name } : null,
  });

  return {
    ...article,
    sourceName: search?.source_name ?? null,
    sourceUrl: search?.source_url ?? null,
  };
}
