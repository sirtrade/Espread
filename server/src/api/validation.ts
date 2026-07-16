import { z } from "zod";
import { isValidTimezone } from "../lib/timezone.js";
import { PRACTICE_SIZE_MIN, PRACTICE_SIZE_MAX } from "../domain/practiceSize.js";
import { PRACTICE_LATENCY_MAX_MS } from "../domain/practiceAnswer.js";
import { GRAMMAR_POOL_LIMIT_MAX, GRAMMAR_POOL_LIMIT_MIN } from "../domain/grammarLifecycle.js";

export const authTelegramSchema = z.object({
  initData: z.string().min(1),
});

export const patchMeSchema = z.object({
  level: z.enum(["A2", "B1", "B2", "C1", "C2"]).optional(),
  explainLang: z.enum(["ru", "en", "es"]).optional(),
  timezone: z
    .string()
    .min(1)
    .max(64)
    .refine(isValidTimezone, "Zona horaria inválida (se espera un identificador IANA, p. ej. Europe/Madrid)")
    .optional(),
  theme: z.enum(["claro", "sepia", "oscuro", "ambar"]).optional(),
  fontSize: z.enum(["sm", "md", "lg", "xl"]).optional(),
  topics: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  dailyEnabled: z.boolean().optional(),
  dailyTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato de hora inválido, usa HH:MM")
    .optional(),
  markOnboarded: z.boolean().optional(),
  botQuizzesPerDay: z.number().int().min(0).max(12).optional(),
  // Active-pool cap: 0 = no limit, otherwise how many words may be in study.
  activePoolLimit: z.number().int().min(0).max(200).optional(),
  // Independent grammar-pool cap (0 = no limit); design range 0-50.
  grammarActivePoolLimit: z
    .number()
    .int()
    .min(GRAMMAR_POOL_LIMIT_MIN)
    .max(GRAMMAR_POOL_LIMIT_MAX)
    .optional(),
  // Práctica session size (cards per session); server clamps 1-30 on the queue.
  practiceSize: z.number().int().min(PRACTICE_SIZE_MIN).max(PRACTICE_SIZE_MAX).optional(),
});

// "Keep the topic" for the remove-topic suggestion (F-19). Removal itself
// goes through the ordinary PATCH /me topics flow, so only the dismissal
// needs its own interaction endpoint.
export const topicSuggestionInteractionSchema = z.object({
  topic: z.string().trim().min(1).max(60),
});

export const levelSuggestionInteractionSchema = z.object({
  action: z.enum(["seen", "dismissed"]),
  direction: z.enum(["up", "down"]),
  targetLevel: z.enum(["A2", "B1", "B2", "C1", "C2"]),
});

// Práctica answers carry an itemId; the post-reading Quiz carries a lemma
// (the client never sees bank item ids). Exactly one identifier is required.
export const practiceAnswerSchema = z
  .object({
    itemId: z.number().int().positive().optional(),
    lemma: z.string().trim().min(1).max(80).optional(),
    // Grammar-track cards answer by their own id (F-14); mutually exclusive
    // with the lexical identifiers above.
    grammarItemId: z.number().int().positive().optional(),
    // Multiple-choice answers report their own correctness; typed-recall answers
    // send the raw text and the server grades it (`typedAnswer`) — one or the
    // other is required. When `typedAnswer` is present `correct` is ignored.
    correct: z.boolean().optional(),
    typedAnswer: z.string().trim().min(1).max(120).optional(),
    // Optional for backward compatibility with older callers; current webapp
    // and bot callers always send/derive it. Typed answers are forced to typed
    // by the route regardless of a conflicting client value.
    cardType: z.enum(["cloze", "recall", "typed"]).optional(),
    // Milliseconds from displaying this card until submitting its first
    // attempt. Bot answers use null/omission.
    latencyMs: z.number().int().min(0).max(PRACTICE_LATENCY_MAX_MS).nullable().optional(),
    // Opaque context selector from the queue. It carries no answer text and is
    // used only to grade/show feedback against the randomly selected example.
    contextAddedAt: z.number().int().nonnegative().optional(),
    // The reader revealed the context translation before answering: a correct
    // answer then earns no SRS credit (retrieval was scaffolded, not recalled).
    usedHint: z.boolean().optional(),
  })
  .refine(
    (d) => d.itemId != null || d.lemma != null || d.grammarItemId != null,
    "Se requiere itemId, lemma o grammarItemId",
  )
  .refine((d) => d.correct != null || d.typedAnswer != null, "Se requiere correct o typedAnswer");

export const practiceSentenceSchema = z.object({
  itemId: z.number().int().positive(),
  sentence: z.string().trim().min(3).max(500),
});

// Mark contract agreed with the webapp: `pos` is client-side highlight
// positioning data — the server stores and returns it verbatim.
export const markSchema = z.object({
  text: z.string().min(1).max(500),
  sentence: z.string().min(1).max(1000),
  kind: z.enum(["word", "span", "sentence"]),
  pos: z
    .object({
      p: z.number().int().min(0),
      s: z.number().int().min(0),
      t: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    })
    .optional(),
});

export const putSessionSchema = z.object({
  marks: z.array(markSchema).max(300),
});

// The review screen sends the reader's per-card intake choices as lemmas.
// Shape only: the service further restricts these to lemmas that appear in
// the current review result. Both fields optional -> default freq behavior.
export const completeSessionSchema = z.object({
  accepted: z.array(z.string().min(1).max(80)).max(100).optional(),
  rejected: z.array(z.string().min(1).max(80)).max(100).optional(),
  // Canonical keys of explicitly accepted grammar candidates. Optional, so an
  // old client that sends no grammar decisions completes normally (F-12).
  grammarAccepted: z.array(z.string().min(1).max(80)).max(10).optional(),
});

// F-17 skip questionnaire: the reason is optional (closing the sheet without
// answering still skips), the free-text comment is accepted only with "other"
// (owner decision — the three preset reasons already encode the signal).
export const skipSessionSchema = z
  .object({
    reason: z.enum(["repeat", "not_interested", "too_hard", "other"]).optional(),
    comment: z.string().trim().min(1).max(200).optional(),
  })
  .refine((d) => d.comment == null || d.reason === "other", "El comentario solo se admite con la razón 'other'");

export const bankQuerySchema = z.object({
  status: z.enum(["active", "learned", "ignored", "queued"]).optional(),
});

export const grammarQuerySchema = z.object({
  status: z.enum(["active", "queued", "learned", "ignored"]).optional(),
});

export const patchGrammarItemSchema = z.object({
  status: z.enum(["active", "queued", "learned", "ignored"]),
});

export const patchBankItemSchema = z.object({
  status: z.enum(["active", "learned", "ignored", "queued"]),
});
