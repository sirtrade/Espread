import type Anthropic from "@anthropic-ai/sdk";
import { callJsonLLM } from "./callJson.js";
import { articleStepSchema, searchStepSchema, type ArticleStepResult } from "./schemas.js";
import { writerGuidance, type CefrLevel } from "./articleRubric.js";
import { auditAndRefineArticle } from "./articleQuality.js";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";

// Re-exported for tests and existing importers; the canonical definitions now
// live in articleRubric.ts alongside the rest of the level guidance.
export { LEVEL_FREQ_CAP, frequencyInstruction } from "./articleRubric.js";
export type { CefrLevel } from "./articleRubric.js";

const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
};

export interface GenerateArticleParams {
  userId: number;
  level: CefrLevel;
  topic: string;
  targetTerms: string[];
}

export interface GeneratedArticle extends ArticleStepResult {
  sourceName: string | null;
  sourceUrl: string | null;
}

/** Verified facts (from the search step) that the writing/rewrite steps must respect. */
export interface ArticleFacts {
  facts: string;
  sourceName: string;
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
  facts: ArticleFacts | null;
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
    `El artículo debe tener entre 250 y 320 palabras y párrafos cortos. ` +
    `${writerGuidance(params.level)} ` +
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

  const facts: ArticleFacts | null = search ? { facts: search.facts, sourceName: search.source_name } : null;

  const draft = await runWriteStep({
    userId: params.userId,
    level: params.level,
    topic: params.topic,
    targetTerms: params.targetTerms,
    facts,
  });

  // Independent quality gate: a separate reviewer judges the draft against the
  // level rubric and naturalness rules, and we rewrite once or twice if needed.
  // This never throws — a flaky quality step degrades to the best draft we have.
  const article = await auditAndRefineArticle({
    userId: params.userId,
    level: params.level,
    targetTerms: params.targetTerms,
    facts,
    draft,
  });

  return {
    ...article,
    sourceName: search?.source_name ?? null,
    sourceUrl: search?.source_url ?? null,
  };
}
