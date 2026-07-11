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
});

export const practiceAnswerSchema = z.object({
  itemId: z.number().int().positive(),
  correct: z.boolean(),
});

export const practiceSentenceSchema = z.object({
  itemId: z.number().int().positive(),
  sentence: z.string().trim().min(3).max(500),
});

export const putSessionSchema = z.object({
  markedWords: z.array(z.string().min(1).max(80)).max(300),
  markedSents: z.array(z.string().min(1).max(500)).max(150),
});

export const bankQuerySchema = z.object({
  status: z.enum(["active", "learned", "ignored"]).optional(),
});

export const patchBankItemSchema = z.object({
  status: z.enum(["active", "learned", "ignored"]),
});
