import { z } from "zod";

export const searchStepSchema = z.object({
  facts: z.string().min(20),
  source_name: z.string().min(1),
  // http(s) only: this URL is rendered as a link in the webapp, so a
  // javascript:/data: scheme coming out of the LLM must never reach an href.
  source_url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "source_url must be http(s)"),
});
export type SearchStepResult = z.infer<typeof searchStepSchema>;

export const articleStepSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(50),
  // Which of the offered vocabulary words the model actually wove in. Optional
  // and advisory: the server re-verifies against the body before trusting it.
  usedTerms: z
    .array(z.string().min(1).max(80))
    .nullish()
    .transform((v) => v ?? []),
});
export type ArticleStepResult = z.infer<typeof articleStepSchema>;

export const sentenceCheckSchema = z.object({
  ok: z.boolean(),
  feedback: z.string().min(1),
  corrected: z.string().nullable(),
});
export type SentenceCheckResult = z.infer<typeof sentenceCheckSchema>;

export const posSchema = z.enum(["verb", "noun", "adj", "adv", "phrase", "other"]);
export const freqBandSchema = z.enum(["top1000", "top3000", "top5000", "rare"]);

// The model sometimes dumps explanations and the Spanish original into the
// translation field ("ранний (acceso anticipado — early access)"), which
// would leak the answer into quiz questions. A hard reject here is too brittle:
// one messy card would fail zod for the WHOLE review batch and throw away every
// other valid vocabulary card from the reader's session. Instead we heal the
// field — drop parenthetical asides and anything from a long dash onward — so
// only the plain translation survives. Explanations belong in `note`.
export function sanitizeShortTranslation(raw: string): string {
  const trim = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,;·]+|[\s,;·]+$/gu, "").trim();
  // "(acceso anticipado …)" → drop the whole parenthetical.
  const noParens = raw.replace(/\([^)]*\)/g, " ");
  // "ранний — досрочный" → keep only what precedes the first long dash.
  let out = trim(noParens.replace(/\s*[—–].*$/u, ""));
  // Fallback for the rare "— досрочный" shape where the dash leads: keep the
  // words instead of collapsing to an empty (and thus invalid) string.
  if (!out) out = trim(noParens.replace(/[—–]/gu, " "));
  // Keep whole words within the length cap rather than failing the batch.
  if (out.length > 60) out = trim(out.slice(0, 60).replace(/\s+\S*$/u, "")) || out.slice(0, 60).trim();
  return out;
}

export const shortTranslationSchema = z
  .string()
  .transform(sanitizeShortTranslation)
  .pipe(z.string().min(1).max(60));

export const reviewItemSchema = z.object({
  /** exact form(s) as marked in the text, e.g. "perfila" or "se llama" */
  surface: z.string().min(1).max(120),
  /** dictionary form: infinitive (with -se), noun singular, adj masc. sing. */
  lemma: z.string().min(1).max(80),
  pos: posSchema,
  gender: z
    .enum(["m", "f"])
    .nullish()
    .transform((v) => v ?? null),
  translation: shortTranslationSchema,
  note: z
    .string()
    .max(300)
    .nullish()
    .transform((v) => v || null),
  contextTranslation: z
    .string()
    .max(500)
    .nullish()
    .transform((v) => v || null),
  freqBand: freqBandSchema,
  /** exactly 3 same-POS Spanish distractors for multiple-choice quizzes */
  distractors: z.array(z.string().min(1).max(60)).length(3),
});
export type ReviewItem = z.infer<typeof reviewItemSchema>;

export const reviewSchema = z.object({
  items: z.array(reviewItemSchema),
});
export type ReviewResult = z.infer<typeof reviewSchema>;
