import { callJsonLLM } from "./callJson.js";
import {
  articleStepSchema,
  articleQualityVerdictSchema,
  type ArticleStepResult,
  type ArticleQualityVerdict,
  type QualityIssue,
} from "./schemas.js";
import { auditRubric, writerGuidance, type CefrLevel } from "./articleRubric.js";
import type { ArticleFacts } from "./articleGeneration.js";
import {
  deterministicArticleChecks,
  WORD_TARGET_MIN,
  WORD_TARGET_MAX,
  type DeterministicCheckResult,
} from "../domain/articleQuality.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

/** Up to two rewrites: draft, then at most two corrected versions. */
export const MAX_REWRITE_ATTEMPTS = 2;

/** A dimension score at or above this counts as good enough. */
const PASS_SCORE_MIN = 4;

export interface RefineParams {
  userId: number;
  level: CefrLevel;
  targetTerms: string[];
  facts: ArticleFacts | null;
  draft: ArticleStepResult;
}

function factsLine(facts: ArticleFacts | null): string {
  return facts
    ? `Hechos verificados en los que se basa el artículo (no deben inventarse cifras ni citas nuevas):\n${facts.facts}\nFuente: ${facts.sourceName}`
    : "El artículo se escribió sin una fuente verificada, evitando cifras exactas y citas.";
}

/**
 * Independent quality auditor. A separate reviewer persona (not the writer)
 * judges the finished text against the level rubric and naturalness rules and
 * returns structured scores and issues. It must NOT rewrite the article — the
 * server decides what to do with the verdict.
 */
export async function runQualityAudit(params: {
  userId: number;
  level: CefrLevel;
  facts: ArticleFacts | null;
  targetTerms: string[];
  article: ArticleStepResult;
}): Promise<ArticleQualityVerdict> {
  const system =
    `Eres un corrector externo y exigente de español, especialista en el Marco Común Europeo (MCER). ` +
    `Tú NO escribiste este artículo: tu única tarea es evaluarlo con objetividad, no reescribirlo. ` +
    `Debe ser un artículo periodístico natural, del nivel indicado, que suene como lo escribiría un nativo culto. ` +
    `${auditRubric(params.level)} ` +
    `Longitud ideal: entre ${WORD_TARGET_MIN} y ${WORD_TARGET_MAX} palabras. ` +
    `Penaliza con dureza: colocaciones forzadas o calcos, vocabulario rebuscado usado para aparentar dificultad, ` +
    `fragmentos sin verbo, clichés vacíos y un nivel que no coincida con el objetivo. ` +
    `Puntúa cada dimensión de 1 (muy mal) a 5 (excelente). Señala problemas concretos con un fragmento ("excerpt") cuando puedas. ` +
    `Responde ÚNICAMENTE con JSON: {"estimatedLevel": "A2"|"B1"|"B2"|"C1"|"C2", "naturalness": 1-5, "cefrFit": 1-5, ` +
    `"readability": 1-5, "factualGrounding": 1-5, "issues": [{"category": ` +
    `"collocation"|"register"|"grammar"|"lexicon"|"facts"|"length"|"forced_vocab"|"cohesion", ` +
    `"severity": "minor"|"major", "excerpt": string|null, "suggestion": string}]}.`;

  const userContent =
    `Nivel objetivo (MCER): ${params.level}.\n` +
    `${factsLine(params.facts)}\n` +
    (params.targetTerms.length > 0
      ? `Vocabulario que se intentó incorporar (opcional, no debe forzarse): ${params.targetTerms.join(", ")}.\n`
      : "") +
    `\nTítulo: ${params.article.title}\n\n${params.article.body}`;

  return callJsonLLM({
    system,
    messages: [{ role: "user", content: userContent }],
    schema: articleQualityVerdictSchema,
    kind: "audit",
    userId: params.userId,
    model: config.MODEL,
    maxTokens: 1024,
  });
}

/**
 * Rewrite step: given the draft and the concrete issues found, produce a
 * corrected version with MINIMAL changes, preserving the facts and the woven
 * vocabulary. Reuses the article schema so downstream handling is identical.
 */
export async function runRewriteStep(params: {
  userId: number;
  level: CefrLevel;
  facts: ArticleFacts | null;
  targetTerms: string[];
  draft: ArticleStepResult;
  issues: QualityIssue[];
}): Promise<ArticleStepResult> {
  const issuesBlock = params.issues
    .map((i, n) => {
      const excerpt = i.excerpt ? ` (fragmento: "${i.excerpt}")` : "";
      return `${n + 1}. [${i.severity}/${i.category}] ${i.suggestion}${excerpt}`;
    })
    .join("\n");

  const system =
    `Eres un editor de español que CORRIGE un artículo para un lector de nivel ${params.level} (MCER). ` +
    `Haz los cambios mínimos necesarios para resolver los problemas señalados: no reescribas de cero ni cambies el tema. ` +
    `PROHIBIDO inventar hechos, cifras exactas o citas que no estén en la fuente. ` +
    `Mantén una longitud de ${WORD_TARGET_MIN} a ${WORD_TARGET_MAX} palabras y conserva, donde sea natural, el vocabulario ya incorporado. ` +
    `${writerGuidance(params.level)} ` +
    `Responde ÚNICAMENTE con JSON: {"title": string, "body": string, "usedTerms": string[]}.`;

  const userContent =
    `${factsLine(params.facts)}\n` +
    (params.targetTerms.length > 0
      ? `Vocabulario del estudiante (opcional, sin forzar): ${params.targetTerms.join(", ")}.\n`
      : "") +
    `\nProblemas detectados por el corrector:\n${issuesBlock}\n\n` +
    `Artículo a corregir:\nTítulo: ${params.draft.title}\n\n${params.draft.body}`;

  return callJsonLLM({
    system,
    messages: [{ role: "user", content: userContent }],
    schema: articleStepSchema,
    kind: "rewrite",
    userId: params.userId,
    model: config.MODEL,
    maxTokens: 2048,
  });
}

/** Sum of the relevant dimension scores; factual grounding only counts with a source. */
function verdictScore(verdict: ArticleQualityVerdict, hasFacts: boolean): number {
  return (
    verdict.naturalness +
    verdict.cefrFit +
    verdict.readability +
    (hasFacts ? verdict.factualGrounding : 0)
  );
}

/**
 * Server-side decision (never trusts a single model boolean): a rewrite is
 * needed if an objective check hard-failed, if the auditor reported any major
 * issue, or if a key dimension scored below the pass threshold.
 */
export function needsRewrite(
  verdict: ArticleQualityVerdict,
  deterministic: DeterministicCheckResult,
  hasFacts: boolean,
): boolean {
  if (deterministic.hardFail) return true;
  if (verdict.issues.some((i) => i.severity === "major")) return true;
  if (verdict.naturalness < PASS_SCORE_MIN) return true;
  if (verdict.cefrFit < PASS_SCORE_MIN) return true;
  if (hasFacts && verdict.factualGrounding < PASS_SCORE_MIN) return true;
  return false;
}

interface Candidate {
  article: ArticleStepResult;
  score: number;
}

/**
 * Draft -> independent audit -> conditional rewrite loop. Runs the objective
 * checks and the auditor, rewrites when needed (up to MAX_REWRITE_ATTEMPTS),
 * and returns the best version seen. Any failure in the quality steps degrades
 * gracefully to the best article available rather than failing generation.
 */
export async function auditAndRefineArticle(params: RefineParams): Promise<ArticleStepResult> {
  const hasFacts = params.facts !== null;
  let current = params.draft;
  let best: Candidate | null = null;

  for (let attempt = 0; attempt <= MAX_REWRITE_ATTEMPTS; attempt++) {
    const deterministic = deterministicArticleChecks(current.body);

    let verdict: ArticleQualityVerdict;
    try {
      verdict = await runQualityAudit({
        userId: params.userId,
        level: params.level,
        facts: params.facts,
        targetTerms: params.targetTerms,
        article: current,
      });
    } catch (err) {
      logger.warn({ err, level: params.level }, "Article quality audit failed; keeping current draft");
      return best?.article ?? current;
    }

    const score = verdictScore(verdict, hasFacts) - (deterministic.hardFail ? 100 : 0);
    if (!best || score > best.score) best = { article: current, score };

    const mustRewrite = needsRewrite(verdict, deterministic, hasFacts);
    if (!mustRewrite) {
      logger.info(
        { level: params.level, attempt, estimatedLevel: verdict.estimatedLevel, wordCount: deterministic.wordCount },
        "Article passed quality audit",
      );
      return current;
    }

    if (attempt === MAX_REWRITE_ATTEMPTS) {
      logger.warn(
        {
          level: params.level,
          estimatedLevel: verdict.estimatedLevel,
          wordCount: deterministic.wordCount,
          issues: verdict.issues.map((i) => `${i.severity}/${i.category}`),
        },
        "Article still failing quality after max rewrites; saving best version",
      );
      break;
    }

    const combinedIssues = [...deterministic.issues, ...verdict.issues];
    try {
      current = await runRewriteStep({
        userId: params.userId,
        level: params.level,
        facts: params.facts,
        targetTerms: params.targetTerms,
        draft: current,
        issues: combinedIssues,
      });
    } catch (err) {
      logger.warn({ err, level: params.level, attempt }, "Article rewrite failed; keeping best version so far");
      break;
    }
  }

  return best?.article ?? current;
}
