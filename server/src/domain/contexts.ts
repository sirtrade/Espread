import { normalizeTerm } from "./normalize.js";

export const MAX_CONTEXTS = 5;

export interface BankContext {
  sentence: string;
  translation: string | null;
  surfaceForm: string;
  articleId: number | null;
  addedAt: number;
}

export interface LegacyContextFields {
  firstContext: string | null;
  contextTranslation: string | null;
  surfaceForm: string | null;
}

function isContext(value: unknown): value is BankContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Record<string, unknown>;
  return (
    typeof context.sentence === "string" &&
    context.sentence.trim().length > 0 &&
    (context.translation === null || typeof context.translation === "string") &&
    typeof context.surfaceForm === "string" &&
    context.surfaceForm.trim().length > 0 &&
    (context.articleId === null ||
      (typeof context.articleId === "number" && Number.isInteger(context.articleId) && context.articleId > 0)) &&
    typeof context.addedAt === "number" &&
    Number.isInteger(context.addedAt) &&
    context.addedAt >= 0
  );
}

export function legacyContext(fields: LegacyContextFields): BankContext | null {
  if (!fields.firstContext || !fields.surfaceForm) return null;
  return {
    sentence: fields.firstContext,
    translation: fields.contextTranslation,
    surfaceForm: fields.surfaceForm,
    articleId: null,
    addedAt: 0,
  };
}

/** Parses stored JSON defensively and falls back to the pre-F-6 card fields. */
export function parseContexts(raw: string | null, legacy: LegacyContextFields): BankContext[] {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(isContext).slice(-MAX_CONTEXTS);
        if (valid.length > 0) return valid;
      }
    } catch {
      // A malformed optional JSON field must not make a legacy card unusable.
    }
  }
  const fallback = legacyContext(legacy);
  return fallback ? [fallback] : [];
}

/** Appends one context, deduping normalized sentences and retaining the newest five. */
export function appendContext(contexts: readonly BankContext[], context: BankContext): BankContext[] {
  const capped = contexts.slice(-MAX_CONTEXTS);
  const key = normalizeTerm(context.sentence);
  if (!key) return [...capped];
  const duplicate = capped.findIndex((existing) => normalizeTerm(existing.sentence) === key);
  if (duplicate >= 0) {
    if (capped[duplicate]!.addedAt !== 0 || context.addedAt === 0) return [...capped];
    const upgraded = [...capped];
    upgraded[duplicate] = context;
    return upgraded;
  }
  return [...capped, context].slice(-MAX_CONTEXTS);
}

/** Selects a context with injectable randomness for deterministic tests. */
export function pickContext(
  contexts: readonly BankContext[],
  random: () => number = Math.random,
): BankContext | null {
  if (contexts.length === 0) return null;
  const sampled = random();
  const value = Number.isFinite(sampled) ? sampled : 0;
  const index = Math.min(contexts.length - 1, Math.max(0, Math.floor(value * contexts.length)));
  return contexts[index]!;
}

export function contextByAddedAt(contexts: readonly BankContext[], addedAt: number | null | undefined): BankContext | null {
  if (addedAt == null) return null;
  return contexts.find((context) => context.addedAt === addedAt) ?? null;
}
