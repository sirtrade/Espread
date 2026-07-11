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
});
export type ArticleStepResult = z.infer<typeof articleStepSchema>;

export const reviewSchema = z.object({
  words: z.array(
    z.object({
      term: z.string().min(1),
      translation: z.string().min(1),
      frequency: z.enum(["alta", "baja"]),
    }),
  ),
  phrases: z.array(
    z.object({
      term: z.string().min(1),
      explanation: z.string().min(1),
      clave: z.string().nullable(),
    }),
  ),
});
export type ReviewResult = z.infer<typeof reviewSchema>;
