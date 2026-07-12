import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { anthropic, extractText, withBackoff } from "./client.js";
import { recordLlmCall } from "../db/repositories/llmCalls.js";
import { logger } from "../lib/logger.js";

function parseJsonLoose(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const candidate = start >= 0 && end >= start ? text.slice(start, end + 1) : text;
  return JSON.parse(candidate);
}

export interface CallJsonParams<T> {
  system: string;
  messages: Anthropic.MessageParam[];
  // Input typed as unknown so schemas with transforms (input ≠ output) fit.
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  kind: "search" | "generate" | "review" | "practice" | "enrich";
  userId: number | null;
  model: string;
  maxTokens: number;
  tools?: Anthropic.ToolUnion[];
}

/**
 * Calls the model expecting a strict JSON reply, validates it with zod, and
 * retries exactly once (with the validation/parse error fed back to the
 * model) if the first attempt is unparsable or invalid.
 */
export async function callJsonLLM<T>(params: CallJsonParams<T>): Promise<T> {
  const messages = [...params.messages];

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Anthropic.Message;
    let ok = true;
    try {
      response = await withBackoff(() =>
        anthropic.messages.create({
          model: params.model,
          max_tokens: params.maxTokens,
          system: params.system,
          messages,
          tools: params.tools,
        }),
      );
    } catch (err) {
      ok = false;
      await recordLlmCall({
        userId: params.userId,
        kind: params.kind,
        model: params.model,
        inputTokens: 0,
        outputTokens: 0,
        ok,
      });
      throw err;
    }

    await recordLlmCall({
      userId: params.userId,
      kind: params.kind,
      model: params.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      ok: true,
    });

    const text = extractText(response);
    try {
      const json = parseJsonLoose(text);
      return params.schema.parse(json);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn({ attempt, reason, kind: params.kind }, "LLM JSON response failed validation");
      if (attempt === 1) {
        throw new Error(`LLM did not return valid JSON for ${params.kind} after retry: ${reason}`);
      }
      messages.push({ role: "assistant", content: text });
      messages.push({
        role: "user",
        content: `Tu respuesta anterior no es un JSON válido según el esquema requerido (error: ${reason}). Responde ÚNICAMENTE con el JSON correcto, sin texto adicional ni markdown.`,
      });
    }
  }

  throw new Error("unreachable");
}
