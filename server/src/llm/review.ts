import { callJsonLLM } from "./callJson.js";
import { grammarCategorySchema, reviewSchema, type ReviewResult } from "./schemas.js";
import { config } from "../lib/config.js";
import type { Mark } from "../domain/marks.js";
import { MAX_GRAMMAR_CANDIDATES_PER_REVIEW, parseGrammarCandidates } from "../domain/grammar.js";

const EXPLAIN_LANG_NAME: Record<"ru" | "en" | "es", string> = {
  ru: "ruso",
  en: "inglés",
  es: "español (modo monolingüe: parafrasea en español simple, no traduzcas)",
};

export interface ReviewParams {
  userId: number;
  articleTitle: string;
  articleBody: string;
  level: string;
  explainLang: "ru" | "en" | "es";
  marks: Mark[];
}

export const REVIEW_DISTRACTOR_INSTRUCTION =
  `- "distractors": genera entre 5 y 8 opciones españolas semánticamente plausibles de la misma categoría ` +
  `gramatical, relacionadas con un tema cercano y de longitud y registro parecidos. No deben ser sinónimos, ` +
  `variantes flexionadas ni formas derivadas del lemma; deben funcionar como respuestas incorrectas creíbles en un quiz.\n`;

/**
 * Single LLM call implementing the "Terminé" review: turns the reader's
 * marks into structured vocabulary cards (lemma, POS, short translation,
 * usage note, sentence translation, frequency band, quiz distractors).
 * Adjacent marks that form one construction are merged into one card.
 */
/** The grammar-candidates half of the review contract (grammar-track design
 *  §4): appended to the system prompt only when at least one span/sentence
 *  mark exists — single-word marks can never produce a grammar candidate. */
function grammarInstruction(lang: string): string {
  return (
    `\nAdemás devuelve "grammarCandidates" (máximo ${MAX_GRAMMAR_CANDIDATES_PER_REVIEW}, puede ser lista vacía): ` +
    `patrones gramaticales PRODUCTIVOS que probablemente causaron la dificultad, SOLO a partir de oraciones marcadas ` +
    `o fragmentos de varias palabras. Un patrón debe poder reconocerse y reproducirse en contextos nuevos ` +
    `("ir a + infinitivo", "cuando + subjuntivo", "se lo + verbo"). NO son patrones: un tema amplio ("subjuntivo"), ` +
    `una oración concreta entera, una palabra o clítico suelto, ni una expresión léxica no composicional (esa va en "items"). ` +
    `Si no hay un patrón generalizable con confianza, devuelve [].\n` +
    `Cada candidato: {"canonicalKey": string, "pattern": string, "category": ` +
    `${grammarCategorySchema.options.map((option) => `"${option}"`).join("|")}, ` +
    `"explanation": string, "sourceForm": string, "sourceSentence": string, "sourceSentenceTranslation": string, ` +
    `"exercise": {"cloze": string, "acceptedAnswers": string[], "options": string[]}}.\n` +
    `- "canonicalKey": identidad estable y normalizada del patrón en minúsculas ("cuando+subjuntivo-presente", "ir-a+infinitivo").\n` +
    `- "pattern": plantilla corta en español para mostrar ("cuando + presente de subjuntivo").\n` +
    `- "explanation": explicación breve en ${lang} de cuándo y por qué se usa el patrón.\n` +
    `- "sourceForm": la manifestación EXACTA (varias palabras) dentro de la oración marcada; ` +
    `"sourceSentence": esa oración tal como aparece en el artículo; "sourceSentenceTranslation": su traducción en ${lang}.\n` +
    `- "exercise": la misma oración con la forma clave sustituida por "___" en "cloze" (un solo hueco, la respuesta no ` +
    `puede leerse en el cloze), "acceptedAnswers" con la(s) forma(s) correcta(s) (la primera debe ser la del texto) y ` +
    `"options" con 3 formas incorrectas plausibles de la misma paradigma.\n` +
    `Un mismo fragmento puede dar a la vez una ficha léxica en "items" y un candidato gramatical.`
  );
}

export async function reviewMarkedItems(params: ReviewParams): Promise<ReviewResult> {
  if (params.marks.length === 0) {
    return { items: [], grammarCandidates: [] };
  }

  // Grammar candidates may only come from sentence marks or multiword spans
  // (design §4); an all-single-words review doesn't even ask for them.
  const hasConstructionMarks = params.marks.some((mark) => mark.kind !== "word");

  const lang = EXPLAIN_LANG_NAME[params.explainLang];
  const system =
    `Eres un profesor de español que ayuda a un estudiante de nivel ${params.level}. ` +
    `El estudiante marcó palabras, fragmentos y oraciones que no entendió mientras leía el artículo. ` +
    `Convierte las marcas en fichas de vocabulario. Responde ÚNICAMENTE con JSON: ` +
    `{"items": [{"surface": string, "lemma": string, "pos": "verb"|"noun"|"adj"|"adv"|"phrase"|"other", ` +
    `"gender": "m"|"f"|null, "translation": string, "note": string|null, "contextTranslation": string|null, ` +
    `"freqBand": "top1000"|"top3000"|"top5000"|"rare", "distractors": [string, ...]}]}.\n` +
    `Reglas para cada ficha:\n` +
    `- "surface": la forma EXACTA tal como aparece en el texto (p. ej. "perfila", "lanzamientos", "se llama").\n` +
    `- "lemma": la forma de diccionario: verbo en infinitivo (con -se si es pronominal: "perfilarse", "llamarse"), ` +
    `sustantivo en singular, adjetivo en masculino singular. Para expresiones, la forma neutra ("llegar cargado de").\n` +
    `- "pos": categoría gramatical; usa "phrase" para expresiones de varias palabras.\n` +
    `- "gender": solo para sustantivos ("m" o "f"); null en los demás casos.\n` +
    `- "translation": traducción CORTA del lemma en ${lang}: máximo 5 palabras, sin paréntesis, sin guiones largos, ` +
    `sin repetir el original español dentro. SOLO la traducción.\n` +
    `- "note": opcional, en ${lang}: matices de uso, régimen preposicional, por qué se usa así en el texto. ` +
    `Todo lo que NO sea la traducción va aquí, nunca en "translation".\n` +
    `- "contextTranslation": traducción en ${lang} de la oración marcada (campo "sentence" de la marca). ` +
    `Null solo si la marca no trae oración.\n` +
    `- "freqBand": banda de frecuencia del lemma en español: "top1000", "top3000", "top5000" (dentro de las ` +
    `1000/3000/5000 palabras más frecuentes) o "rare" (fuera de las 5000 más frecuentes, término especializado o nombre propio).\n` +
    REVIEW_DISTRACTOR_INSTRUCTION +
    `Reglas de agrupación:\n` +
    `- Marcas vecinas de la misma oración que forman UNA construcción se combinan en UNA sola ficha: ` +
    `clítico + verbo ("se" + "llama" → lemma "llamarse"), perífrasis ("llega" + "cargado de" → "llegar cargado de").\n` +
    `- Un clítico o artículo marcado solo, sin pareja en la oración ("se", "lo", "la"): no merece ficha propia; ` +
    `devuélvelo con freqBand "rare" y explica en "note" qué función cumple en esa oración.\n` +
    `- Para una oración completa marcada: traduce la oración en "contextTranslation" y elige como ficha la ` +
    `construcción o palabra (2-4 palabras máximo) que más probablemente causó la dificultad.\n` +
    `- No dupliques fichas: si dos marcas llevan al mismo lemma, devuelve una sola ficha.` +
    (hasConstructionMarks ? grammarInstruction(lang) : "");

  const marksPayload = params.marks.map((m) => ({ text: m.text, sentence: m.sentence, kind: m.kind }));
  const userContent =
    `Artículo:\nTítulo: ${params.articleTitle}\n${params.articleBody}\n\n` +
    `Marcas del estudiante: ${JSON.stringify(marksPayload)}`;

  const result = await callJsonLLM({
    system,
    messages: [{ role: "user", content: userContent }],
    schema: reviewSchema,
    kind: "review",
    userId: params.userId,
    model: config.MODEL,
    maxTokens: 4096,
  });

  // Server-side validation is the source of truth: whatever the model claims,
  // only verifiable candidates survive, and never from single-word reviews.
  return {
    ...result,
    grammarCandidates: hasConstructionMarks
      ? parseGrammarCandidates(result.grammarCandidates, params.articleBody)
      : [],
  };
}
