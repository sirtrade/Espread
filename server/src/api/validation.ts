import { z } from "zod";
import { isValidTimezone } from "../lib/timezone.js";

export const authTelegramSchema = z.object({
  initData: z.string().min(1),
});

export const patchMeSchema = z.object({
  level: z.enum(["A2", "B1", "B2", "C1"]).optional(),
  explainLang: z.enum(["ru", "en", "es"]).optional(),
  timezone: z
    .string()
    .min(1)
    .max(64)
    .refine(isValidTimezone, "Zona horaria inválida (se espera un identificador IANA, p. ej. Europe/Madrid)")
    .optional(),
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
});

// Práctica answers carry an itemId; the post-reading Quiz carries a lemma
// (the client never sees bank item ids). Exactly one identifier is required.
export const practiceAnswerSchema = z
  .object({
    itemId: z.number().int().positive().optional(),
    lemma: z.string().trim().min(1).max(80).optional(),
    correct: z.boolean(),
  })
  .refine((d) => d.itemId != null || d.lemma != null, "Se requiere itemId o lemma");

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
});

export const bankQuerySchema = z.object({
  status: z.enum(["active", "learned", "ignored", "queued"]).optional(),
});

export const patchBankItemSchema = z.object({
  status: z.enum(["active", "learned", "ignored", "queued"]),
});
